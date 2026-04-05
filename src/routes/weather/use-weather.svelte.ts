import { asyncStorage } from '$lib/utils/storage'
import { Sun, Cloud, CloudRain, Snowflake } from '@lucide/svelte'
import { onMount } from 'svelte'

import { getIpLocationRemote, getReverseGeocodeRemote } from './weather.remote'

const FRESHNESS_THRESHOLD = 15 * 60 * 1000 // 15 minutes in ms

// --- Hook / State Module ---

export function useWeather(useRemoteFns = false) {
	let loadingState = $state<'idle' | 'locating' | 'fetching'>('locating')
	let locationError = $state<string | null>(null)
	let cachedWeather = $state<WeatherCacheItem | null>(null)
	let liveWeather = $state<WeatherCacheItem | null>(null)
	let now = $state(Date.now())
	let permissionState = $state<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
	let isApproxLocation = $state(false)
	let ipCity = $state<string | null>(null)
	let ipIsp = $state<string>('') // ISP name from IP geolocation
	let gpsCity = $state<string>('') // reverse-geocoded label for GPS location

	// Load cache, check permission, and trigger initial location request
	onMount(async () => {
		const cached = await asyncStorage.getItem<WeatherCacheItem>('weather_cache')
		if (cached) {
			cachedWeather = cached
			if (cached.locationLabel) gpsCity = cached.locationLabel
		}

		// Query initial permission state and subscribe to changes
		if ('permissions' in navigator) {
			try {
				const status = await navigator.permissions.query({ name: 'geolocation' })
				permissionState = status.state

				// Reactively update permission state if user changes it in browser settings
				status.onchange = () => {
					permissionState = status.state
					// If user just granted permission, trigger a real GPS fetch
					if (status.state === 'granted') {
						isApproxLocation = false
						ipCity = null
						ipIsp = ''
						gpsCity = ''
						requestLocation()
					}
				}
			} catch {
				// Permissions API not supported or blocked — fall through to requestLocation()
				permissionState = 'unknown'
			}
		}

		if (cachedWeather) {
			// Have cached location — skip GPS, just refresh weather if stale
			loadingState = 'idle'
			const isStale = Date.now() - cachedWeather.timestamp >= FRESHNESS_THRESHOLD
			if (isStale) {
				// Silently refresh weather using cached lat/lng, then check if user changed ward
				fetchWeatherData(cachedWeather.lat, cachedWeather.lng).then(async () => {
					if (permissionState !== 'granted') return
					try {
						const pos = await getUserLocation()
						const { latitude, longitude } = pos.coords
						// Reverse geocode the new position and compare with cached
						const newGeo = await fetchReverseGeocode(latitude, longitude)
						const oldGeo = cachedWeather.geo
						if (newGeo && oldGeo) {
							const wardChanged = newGeo.ward !== oldGeo.ward
							const cityChanged = newGeo.city !== oldGeo.city
							if (wardChanged || cityChanged) {
								// User moved to a different area — re-fetch weather
								fetchWeatherData(latitude, longitude)
							}
						}
						// Update the display label regardless
						const detail = [newGeo?.ward, newGeo?.district].filter(Boolean).join(', ')
						if (detail && newGeo?.city) {
							gpsCity = `${detail}, ${newGeo.city}`
						} else if (newGeo) {
							gpsCity = [newGeo.city, newGeo.country].filter(Boolean).join(', ')
						}
					} catch {
						/* GPS failed silently — cached location is fine */
					}
				})
			}
		} else {
			// No cache at all (first visit) — need GPS to get initial location
			if (permissionState === 'denied') {
				await requestIpLocationFallback()
			} else {
				await requestLocation()
			}
		}
	})

	$effect(() => {
		// Only run the ticker if we actually have data to compute relative time for
		if (!liveWeather && !cachedWeather) return

		const interval = setInterval(() => {
			now = Date.now()
		}, 60000) // update every minute
		return () => clearInterval(interval)
	})

	async function fetchWeatherData(lat: number, lng: number) {
		loadingState = 'fetching'
		try {
			const weatherData = await fetchOpenMeteoForecast(lat, lng)

			const newWeather: WeatherCacheItem = {
				lat,
				lng,
				timestamp: Date.now(),
				weather: weatherData,
				locationLabel: gpsCity || undefined,
			}
			liveWeather = newWeather

			await asyncStorage.setItem('weather_cache', newWeather)
		} catch (e) {
			console.error('Failed to fetch weather', e)
			locationError = 'Failed to fetch the latest weather data.'
		} finally {
			loadingState = 'idle'
		}
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
			await fetchWeatherData(ipLocation.lat, ipLocation.lng)
		} catch (e: any) {
			console.error('IP location fallback failed:', e)
			locationError = 'Could not determine your location. Please enable GPS or try again later.'
			loadingState = 'idle'
		}
	}

	// Raw reverse geocode fetch — returns geo data without side effects
	async function fetchReverseGeocode(lat: number, lng: number): Promise<GeoInfo | null> {
		try {
			let data: { city: string; country: string; district?: string; ward?: string }
			if (useRemoteFns) {
				data = await getReverseGeocodeRemote({ lat, lng })
			} else {
				const res = await fetch(`/weather/api/reverse-geocode?lat=${lat}&lng=${lng}`)
				if (!res.ok) return null
				data = await res.json()
			}
			return data
		} catch {
			return null
		}
	}

	// Reverse geocode GPS coordinates in the background — sets gpsCity, never blocks weather load.
	// Caches the result in localStorage keyed by rounded lat/lng (3 decimal places ≈ 110m precision).
	async function reverseGeocode(lat: number, lng: number, skipCache: boolean = false) {
		const cacheKey = `geocode_${lat.toFixed(3)}_${lng.toFixed(3)}`

		// Try cache first — avoid slow Nominatim call if location hasn't changed
		if (!skipCache) {
			try {
				const cached = await asyncStorage.getItem<{ label: string; timestamp: number }>(cacheKey)
				if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
					gpsCity = cached.label
					return
				}
			} catch {
				/* proceed to fetch */
			}
		}

		try {
			const data = await fetchReverseGeocode(lat, lng)
			if (!data) return
			// Build detailed label: "Ward, District, City" or fallback to "City, Country"
			const detail = [data.ward, data.district].filter(Boolean).join(', ')
			let label: string
			if (detail && data.city) {
				label = `${detail}, ${data.city}`
			} else {
				label = [data.city, data.country].filter(Boolean).join(', ')
			}
			gpsCity = label
			await asyncStorage.setItem(cacheKey, { label, timestamp: Date.now() })
			// Persist label + geo into weather cache so next load has it
			const current = liveWeather || cachedWeather
			if (current) {
				current.locationLabel = label
				current.geo = data
				await asyncStorage.setItem('weather_cache', current)
			}
		} catch {
			// Silently ignore — city label is a bonus, not critical
		}
	}

	async function requestLocation(force: boolean = false) {
		loadingState = 'locating'
		locationError = null

		try {
			const position = await getUserLocation()
			const { latitude, longitude } = position.coords

			// Successful GPS — clear any lingering IP-fallback flags
			isApproxLocation = false
			ipCity = null
			ipIsp = ''
			// Don't blank gpsCity here — reverseGeocode will update it (possibly from cache instantly)

			loadingState = 'idle'
			let shouldFetch = true

			if (!force && cachedWeather) {
				const isLocationChanged = isDrasticLocationChange(
					cachedWeather.lat,
					cachedWeather.lng,
					latitude,
					longitude,
				)
				const isStale = Date.now() - cachedWeather.timestamp >= FRESHNESS_THRESHOLD

				if (isLocationChanged) {
					// User moved >= 3km, must fetch new data regardless of time
					shouldFetch = true
				} else if (!isStale) {
					// Data is fresh and user hasn't moved significantly
					shouldFetch = false
					loadingState = 'idle'
				}
			}

			// Fire reverse geocoding in the background — doesn't block weather loading
			reverseGeocode(latitude, longitude, force)

			if (shouldFetch) {
				await fetchWeatherData(latitude, longitude)
			}
		} catch (error: any) {
			console.error('Geolocation error:', error)

			// If permission is denied, try IP fallback automatically
			if (permissionState === 'denied' || error?.code === 1 /* PERMISSION_DENIED */) {
				permissionState = 'denied'
				await requestIpLocationFallback()
			} else {
				locationError = error?.message || 'Please allow location access to see your local weather.'
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
			return liveWeather || cachedWeather
		},
		get isUpdatingInBg() {
			return loadingState === 'fetching' && !!(liveWeather || cachedWeather) && !liveWeather
		},
		get relativeTime() {
			const display = liveWeather || cachedWeather
			if (!display || !display.timestamp) return ''
			const diffMs = now - display.timestamp
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
		data = await getIpLocationRemote()
	} else {
		const res = await fetch('/weather/api/ip-location')
		if (!res.ok) throw new Error(`IP location proxy returned ${res.status}`)
		data = await res.json()
	}

	// Build "City, Country" label — omit whichever part is missing
	const city: string = [data.city, data.country].filter(Boolean).join(', ')
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
				maximumAge: 5 * 60 * 1000, // Let the OS cache the coordinate for 5 minutes instead of 1 minute to reduce mobile battery drain and GPS icon flashing
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

// Haversine formula to calculate the great-circle distance between two points on a sphere given their longitudes and latitudes.
// This detects drastic location changes (e.g. user moved >= 3km) so we know when to discard weather cache.
function isDrasticLocationChange(oldLat: number, oldLng: number, newLat: number, newLng: number) {
	const earthRadiusKm = 6371 // Earth's mean radius in kilometers
	const drasticDistanceThresholdKm = 3 // The threshold in kilometers

	// Convert latitude and longitude differences from degrees to radians
	const deltaLatRadians = ((newLat - oldLat) * Math.PI) / 180
	const deltaLngRadians = ((newLng - oldLng) * Math.PI) / 180

	// Calculate the square of half the chord length between the points (a)
	const a =
		Math.sin(deltaLatRadians / 2) * Math.sin(deltaLatRadians / 2) +
		Math.cos((oldLat * Math.PI) / 180) *
			Math.cos((newLat * Math.PI) / 180) *
			Math.sin(deltaLngRadians / 2) *
			Math.sin(deltaLngRadians / 2)

	// Calculate the angular distance in radians (c)
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

	// Calculate the great-circle distance in kilometers
	const distanceKm = earthRadiusKm * c

	return distanceKm >= drasticDistanceThresholdKm
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

export interface GeoInfo {
	city: string
	country: string
	district?: string
	ward?: string
}

export interface WeatherCacheItem {
	lat: number
	lng: number
	timestamp: number
	weather: WeatherResponse
	locationLabel?: string
	geo?: GeoInfo
}
