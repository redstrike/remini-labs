import { createCache } from '$lib/utils/cache'
import { Sun, Cloud, CloudRain, Snowflake } from '@lucide/svelte'
import { onMount } from 'svelte'

import { getIpLocationRemote, getReverseGeocodeRemote } from './weather.remote'

const weatherCache = createCache<WeatherAppCache>('weather', {
	ttl: 15 * 60 * 1000, // 15 min — single hard TTL, no soft-refresh ladder
})

// Geocode results are effectively immutable (ward boundaries don't change) — long TTL.
// The dict is capped to GEOCODE_MAX_ENTRIES via LRU (lastAccessedAt) to keep the blob small.
const geocodesCache = createCache<Record<string, GeocodeEntry>>('weather.geocodes', {
	ttl: 90 * 24 * 60 * 60 * 1000, // 90 days — nuke-all safety net, not per-entry freshness
})
const GEOCODE_MAX_ENTRIES = 5

function geocodeKey(lat: number, lng: number) {
	// 3 decimals ≈ 110m precision — one cache entry per ~ward-sized bucket
	return `${lat.toFixed(3)}_${lng.toFixed(3)}`
}

async function lookupGeocode(lat: number, lng: number): Promise<GeocodeEntry | null> {
	const dict = await geocodesCache.get()
	if (!dict) return null
	const key = geocodeKey(lat, lng)
	const entry = dict[key]
	if (!entry) return null
	// Touch LRU timestamp on read, persist so eviction order reflects actual usage
	entry.lastAccessedAt = Date.now()
	await geocodesCache.set(dict)
	return entry
}

async function saveGeocode(
	lat: number,
	lng: number,
	data: { city: string; country: string; district?: string; ward?: string; label: string },
) {
	const dict = (await geocodesCache.get()) ?? {}
	const key = geocodeKey(lat, lng)
	dict[key] = { ...data, lastAccessedAt: Date.now() }

	// LRU eviction — keep only the N most recently accessed entries
	const keys = Object.keys(dict)
	if (keys.length > GEOCODE_MAX_ENTRIES) {
		const sorted = keys.toSorted((a, b) => dict[a].lastAccessedAt - dict[b].lastAccessedAt)
		for (const k of sorted.slice(0, keys.length - GEOCODE_MAX_ENTRIES)) delete dict[k]
	}

	await geocodesCache.set(dict)
}

// --- Hook / State Module ---

export interface UseWeatherOptions {
	/**
	 * Use SvelteKit experimental remote functions instead of REST API endpoints.
	 *
	 * Both paths are intentionally maintained as a permanent A/B toggle: the REST `+server.ts`
	 * endpoints (`/weather/api/ip-location` and `/weather/api/reverse-geocode`) live alongside
	 * the `weather.remote.ts` query() functions (`getIpLocationRemote` / `getReverseGeocodeRemote`)
	 * so either runtime model can be exercised against real upstream traffic during the
	 * SvelteKit remote-functions experimental window. The duplication is the design — drop one
	 * path only when remote functions exit experimental AND a single-path migration is explicitly
	 * desired.
	 */
	useRemoteFns?: boolean
}

export function useWeather({ useRemoteFns = false }: UseWeatherOptions = {}) {
	let loadingState = $state<'idle' | 'locating' | 'fetching'>('locating')
	let locationError = $state<string | null>(null)
	let liveWeather = $state<WeatherData | null>(null)
	let now = $state(Date.now())
	let permissionState = $state<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
	let isApproxLocation = $state(false)
	let ipCity = $state<string | null>(null)
	let ipIsp = $state<string>('') // ISP name from IP geolocation
	let gpsCity = $state<string>('') // reverse-geocoded label for GPS location

	// Single lifecycle abort signal for every async path inside the hook (onMount IIFE,
	// reverseGeocode, future async). Triggered from onMount cleanup. Downstream awaits check
	// `signal.aborted` before mutating reactive state, and pass the signal to `fetch` to also
	// cancel in-flight HTTP. Replaces the per-path `unmounted` boolean — single source of truth.
	const lifecycleAbort = new AbortController()

	// Sync `onMount` body with an async IIFE inside, so we can RETURN a cleanup function:
	// async functions return Promises, which Svelte ignores (only `typeof === 'function'` is
	// treated as cleanup). Wrapping the async work lets us also detach the PermissionStatus
	// `change` listener on unmount instead of leaking it across remounts.
	onMount(() => {
		const { signal } = lifecycleAbort
		let permissionStatus: PermissionStatus | null = null
		const onPermissionChange = () => {
			if (!permissionStatus || signal.aborted) return
			permissionState = permissionStatus.state
			if (permissionStatus.state === 'granted') {
				isApproxLocation = false
				ipCity = null
				ipIsp = ''
				gpsCity = ''
				requestLocation()
			}
		}

		void (async () => {
			// Hydrate from cache first — if fresh, we can skip the network entirely.
			// getCachedItem auto-removes expired entries so we never see stale data.
			const cached = await weatherCache.get()
			if (signal.aborted) return
			if (cached) {
				liveWeather = { lat: cached.lat, lng: cached.lng, timestamp: cached.fetchedAt, weather: cached.weather }
				gpsCity = cached.gpsCity ?? ''
				isApproxLocation = cached.isApproxLocation
				ipCity = cached.ipCity ?? null
				ipIsp = cached.ipIsp ?? ''
				loadingState = 'idle'
			}

			if ('permissions' in navigator) {
				try {
					const status = await navigator.permissions.query({ name: 'geolocation' })
					if (signal.aborted) return
					permissionStatus = status
					permissionState = status.state
					// Reactively update permission state if user changes it in browser settings
					status.addEventListener('change', onPermissionChange)
				} catch {
					permissionState = 'unknown'
				}
			}

			// If we hydrated from fresh cache, don't re-fetch. Otherwise run the full flow.
			if (cached) return
			if (signal.aborted) return

			if (permissionState === 'denied') {
				await requestIpLocationFallback()
			} else {
				await requestLocation()
			}
		})()

		return () => {
			lifecycleAbort.abort()
			permissionStatus?.removeEventListener('change', onPermissionChange)
		}
	})

	$effect(() => {
		if (!liveWeather) return
		const interval = setInterval(() => {
			now = Date.now()
		}, 60000) // update every minute
		return () => clearInterval(interval)
	})

	async function fetchWeatherData(lat: number, lng: number) {
		loadingState = 'fetching'
		try {
			const weatherData = await fetchOpenMeteoForecast(lat, lng)
			liveWeather = { lat, lng, timestamp: Date.now(), weather: weatherData }
			await persistCache()
		} catch (e) {
			console.error('Failed to fetch weather', e)
			locationError = 'Failed to fetch the latest weather data.'
		} finally {
			loadingState = 'idle'
		}
	}

	// Snapshot current state into the single per-mini-app cache key.
	// Called after weather lands and again after reverse-geocode resolves the label.
	async function persistCache() {
		if (!liveWeather) return
		await weatherCache.set({
			lat: liveWeather.lat,
			lng: liveWeather.lng,
			weather: liveWeather.weather,
			fetchedAt: liveWeather.timestamp,
			gpsCity: gpsCity || undefined,
			isApproxLocation,
			ipCity,
			ipIsp,
		})
	}

	async function requestIpLocationFallback() {
		loadingState = 'locating'
		locationError = null
		try {
			const ipLocation = await fetchIpLocation(useRemoteFns)
			isApproxLocation = true
			ipCity = ipLocation.city
			ipIsp = ipLocation.isp
			loadingState = 'idle'
			// Reverse geocode in the background so users on the IP fallback path also get
			// a proper "Ward, District, City" label instead of just the coarse IP city.
			reverseGeocode(ipLocation.lat, ipLocation.lng)
			await fetchWeatherData(ipLocation.lat, ipLocation.lng)
		} catch (e) {
			console.error('IP location fallback failed:', e)
			locationError = 'Could not determine your location. Please enable GPS or try again later.'
			loadingState = 'idle'
		}
	}

	// Reverse geocode GPS coordinates in the background — sets gpsCity, never blocks weather load.
	// Uses the persistent LRU geocode dict (weather.geocodes.cache) to skip the network when
	// the user is in a previously-visited area.
	//
	// Fire-and-forget by design (caller doesn't await), so every state mutation past an `await`
	// must check `lifecycleAbort.signal.aborted` before writing — otherwise a navigation
	// mid-flight resumes the resolved promise on a torn-down component (writes to dead $state +
	// wasted localStorage writes from saveGeocode/persistCache).
	async function reverseGeocode(lat: number, lng: number) {
		const { signal } = lifecycleAbort

		// Fast path: cached geocode for this rounded coordinate
		const cached = await lookupGeocode(lat, lng)
		if (signal.aborted) return
		if (cached) {
			gpsCity = cached.label
			await persistCache()
			return
		}

		try {
			let data: { city: string; country: string; district?: string; ward?: string }
			if (useRemoteFns) {
				// Outside a reactive context (.svelte.ts), `await query(...)` throws
				// "not created in a reactive context". Use `.run()` for one-shot fetch.
				// `.run()` doesn't accept a signal, so abort-handling is post-await only.
				// https://svelte.dev/docs/kit/remote-functions#query
				data = await getReverseGeocodeRemote({ lat, lng }).run()
				if (signal.aborted) return
			} else {
				// Pass the lifecycle signal to fetch — cancels the in-flight HTTP request on
				// unmount. The thrown AbortError is caught + swallowed below.
				const res = await fetch(`/weather/api/reverse-geocode?lat=${lat}&lng=${lng}`, { signal })
				if (!res.ok) return
				data = await res.json()
				if (signal.aborted) return
			}
			// Two-token label, most-specific first: "Ward, District" → "District, City" → "City, Country"
			const label = buildLocationLabel(data)
			gpsCity = label
			// Persist to the LRU geocode dict + update the weather snapshot so reloads show the label
			await saveGeocode(lat, lng, { ...data, label })
			await persistCache()
		} catch (e) {
			// AbortError = lifecycle abort fired (component unmount); silent. Anything else =
			// real failure worth surfacing. City label is a bonus, not critical.
			if (e instanceof Error && e.name === 'AbortError') return
			console.error('reverseGeocode failed:', e)
		}
	}

	async function requestLocation() {
		loadingState = 'locating'
		locationError = null

		try {
			const position = await getUserLocation()
			const { latitude, longitude } = position.coords

			isApproxLocation = false
			ipCity = null
			ipIsp = ''

			// Fire reverse geocoding in the background — doesn't block weather loading
			reverseGeocode(latitude, longitude)
			await fetchWeatherData(latitude, longitude)
		} catch (e) {
			console.error('Geolocation error:', e)

			const code = e instanceof GeolocationPositionError ? e.code : 0
			if (permissionState === 'denied' || code === 1 /* PERMISSION_DENIED */) {
				permissionState = 'denied'
				await requestIpLocationFallback()
			} else {
				locationError =
					(e instanceof Error && e.message) || 'Please allow location access to see your local weather.'
				loadingState = 'idle'
			}
		}
	}

	return {
		get loadingState() {
			return loadingState
		},
		get locationError() {
			return locationError
		},
		get permissionState() {
			return permissionState
		},
		get isApproxLocation() {
			return isApproxLocation
		},
		get ipCity() {
			return ipCity
		},
		get ipIsp() {
			return ipIsp
		},
		get gpsCity() {
			return gpsCity
		},
		get displayWeather() {
			return liveWeather
		},
		get relativeTime() {
			if (!liveWeather) return ''
			const diffMs = now - liveWeather.timestamp
			const diffMins = Math.floor(diffMs / 60000)

			if (diffMins < 1) return 'Just now'
			if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
			const diffHours = Math.floor(diffMins / 60)
			if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
			const diffDays = Math.floor(diffHours / 24)
			return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
		},
		requestLocation,
	}
}

// --- Helpers ---

// Build a location label following the priority Ward > District > City > (empty → lat/lng).
// Prefers two tokens ("ward, district" or "district, city") but degrades to a single token
// when the adjacent level is missing. Empty string means the caller should fall back to lat/lng.
function buildLocationLabel(data: { city: string; country: string; district?: string; ward?: string }): string {
	const { ward, district, city } = data
	if (ward && district) return ward === district ? ward : `${ward}, ${district}`
	if (ward) return ward
	if (district && city) return `${district}, ${city}`
	if (district) return district
	if (city) return city
	return ''
}

// Parse WMO Weather codes to human readable text and icons
export function getWeatherCondition(code: number) {
	if (code === 0) return { text: 'Clear sky', icon: Sun, animationType: 'sun' as const }
	if (code === 1 || code === 2 || code === 3)
		return { text: 'Partly cloudy', icon: Cloud, animationType: 'cloud' as const }
	if (code >= 45 && code <= 48) return { text: 'Fog', icon: Cloud, animationType: 'cloud' as const }
	if (code >= 51 && code <= 67) return { text: 'Rain', icon: CloudRain, animationType: 'rain' as const }
	if (code >= 71 && code <= 77) return { text: 'Snow', icon: Snowflake, animationType: 'snow' as const }
	if (code >= 80 && code <= 82) return { text: 'Showers', icon: CloudRain, animationType: 'rain' as const }
	if (code >= 95 && code <= 99) return { text: 'Thunderstorm', icon: CloudRain, animationType: 'storm' as const }
	return { text: 'Unknown', icon: Cloud, animationType: 'cloud' as const }
}

// IP-based coarse location via local SvelteKit proxy (/api/ip-location) or remote function.
// The proxy/remote function fetches ip.me server-side to avoid CORS restrictions.
async function fetchIpLocation(
	useRemoteFns: boolean,
): Promise<{ lat: number; lng: number; city: string; isp: string }> {
	let data
	if (useRemoteFns) {
		data = await getIpLocationRemote().run()
	} else {
		const res = await fetch('/weather/api/ip-location')
		if (!res.ok) throw new Error(`IP location proxy returned ${res.status}`)
		data = await res.json()
	}

	// Same priority chain as the GPS path (Ward > District > City > lat/lng).
	// IP geolocation only resolves city/country, so this collapses to just the city
	// — country is intentionally dropped to match the unified label rules.
	const city = buildLocationLabel({
		city: data.city ?? '',
		country: data.country ?? '',
		district: data.district,
		ward: data.ward,
	})
	return { lat: data.lat, lng: data.lng, city, isp: data.isp ?? '' }
}

// Promisified Geolocation Wrapper
async function getUserLocation(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('Geolocation is not supported by your browser.'))
		} else {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				timeout: 10000,
				maximumAge: 5 * 60 * 1000, // Let the OS cache the coordinate for 5 minutes to reduce mobile battery drain and GPS icon flashing
			})
		}
	})
}

// Pure isolated network fetch
async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<WeatherResponse> {
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`API returned status: ${response.status}`)
	}
	return response.json()
}

// --- Types & Interfaces ---

export interface CurrentWeather {
	temperature_2m: number
	relative_humidity_2m: number
	apparent_temperature: number
	is_day: number
	precipitation: number
	rain: number
	showers: number
	snowfall: number
	weather_code: number
	cloud_cover: number
	pressure_msl: number
	surface_pressure: number
	wind_speed_10m: number
	wind_direction_10m: number
	wind_gusts_10m: number
}

export interface DailyWeather {
	time: string[]
	weather_code: number[]
	temperature_2m_max: number[]
	temperature_2m_min: number[]
	sunrise: string[]
	sunset: string[]
}

export interface WeatherResponse {
	latitude: number
	longitude: number
	generationtime_ms: number
	utc_offset_seconds: number
	timezone: string
	timezone_abbreviation: string
	elevation: number
	current_units: Record<string, string>
	current: CurrentWeather
	daily_units: Record<string, string>
	daily: DailyWeather
}

export interface WeatherData {
	lat: number
	lng: number
	timestamp: number
	weather: WeatherResponse
}

// One entry in the weather.geocodes LRU dict. `lastAccessedAt` drives eviction.
interface GeocodeEntry {
	city: string
	country: string
	district?: string
	ward?: string
	label: string // pre-built display label to avoid re-building on every read
	lastAccessedAt: number
}

// Persisted snapshot stored under the single "weather" localStorage key.
// Envelope (expiresAt) is added automatically by the cache factory.
interface WeatherAppCache {
	lat: number
	lng: number
	weather: WeatherResponse
	fetchedAt: number
	gpsCity?: string
	isApproxLocation: boolean
	ipCity?: string | null
	ipIsp?: string
}
