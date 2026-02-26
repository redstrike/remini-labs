import { onMount } from 'svelte';
import { asyncStorage } from '$lib/utils/storage';
import { Sun, Cloud, CloudRain, Snowflake } from 'lucide-svelte';

const FRESHNESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes in ms

// --- Hook / State Module ---

export function useWeather() {
	let loadingState = $state<'idle' | 'locating' | 'fetching'>('locating');
	let locationError = $state<string | null>(null);
	let cachedWeather = $state<WeatherCacheItem | null>(null);
	let liveWeather = $state<WeatherCacheItem | null>(null);
	let now = $state(Date.now());

	// Load cache and trigger initial location request
	onMount(async () => {
		const cached = await asyncStorage.getItem<WeatherCacheItem>('weather_cache');
		if (cached) {
			cachedWeather = cached;
		}
		requestLocation();
	});

	$effect(() => {
		// Only run the ticker if we actually have data to compute relative time for
		if (!liveWeather && !cachedWeather) return;

		const interval = setInterval(() => {
			now = Date.now();
		}, 60000); // update every minute
		return () => clearInterval(interval);
	});

	async function fetchWeatherData(lat: number, lng: number) {
		loadingState = 'fetching';
		try {
			const weatherData = await fetchOpenMeteoForecast(lat, lng);

			const newWeather: WeatherCacheItem = { lat, lng, timestamp: Date.now(), weather: weatherData };
			liveWeather = newWeather;

			await asyncStorage.setItem('weather_cache', newWeather);
		} catch (e) {
			console.error('Failed to fetch weather', e);
			locationError = 'Failed to fetch the latest weather data.';
		} finally {
			loadingState = 'idle';
		}
	}

	async function requestLocation(force: boolean = false) {
		loadingState = 'locating';
		locationError = null;

		try {
			const position = await getUserLocation();
			const { latitude, longitude } = position.coords;

			loadingState = 'idle';
			let shouldFetch = true;

			if (!force && cachedWeather) {
				const isLocationChanged = isDrasticLocationChange(
					cachedWeather.lat,
					cachedWeather.lng,
					latitude,
					longitude,
				);
				const isStale = Date.now() - cachedWeather.timestamp >= FRESHNESS_THRESHOLD;

				if (isLocationChanged) {
					// User moved >= 3km, must fetch new data regardless of time
					shouldFetch = true;
				} else if (!isStale) {
					// Data is fresh and user hasn't moved significantly
					shouldFetch = false;
					loadingState = 'idle';
				}
			}

			if (shouldFetch) {
				await fetchWeatherData(latitude, longitude);
			}
		} catch (error: any) {
			console.error('Geolocation error:', error);
			locationError = error?.message || 'Please allow location access to see your local weather.';
			loadingState = 'idle';
		}
	}

	return {
		get loadingState() {
			return loadingState;
		},
		get locationError() {
			return locationError;
		},
		get displayWeather() {
			return liveWeather || cachedWeather;
		},
		get isUpdatingInBg() {
			return loadingState === 'fetching' && !!(liveWeather || cachedWeather) && !liveWeather;
		},
		get relativeTime() {
			const display = liveWeather || cachedWeather;
			if (!display || !display.timestamp) return '';
			const diffMs = now - display.timestamp;
			const diffMins = Math.floor(diffMs / 60000);

			if (diffMins < 1) return 'Just now';
			if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
			const diffHours = Math.floor(diffMins / 60);
			if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
			const diffDays = Math.floor(diffHours / 24);
			return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		},
		requestLocation,
	};
}

// --- Helpers ---

// Parse WMO Weather codes to human readable text and icons
export function getWeatherCondition(code: number) {
	if (code === 0) return { text: 'Clear sky', icon: Sun };
	if (code === 1 || code === 2 || code === 3) return { text: 'Partly cloudy', icon: Cloud };
	if (code >= 45 && code <= 48) return { text: 'Fog', icon: Cloud };
	if (code >= 51 && code <= 67) return { text: 'Rain', icon: CloudRain };
	if (code >= 71 && code <= 77) return { text: 'Snow', icon: Snowflake };
	if (code >= 80 && code <= 82) return { text: 'Showers', icon: CloudRain };
	if (code >= 95 && code <= 99) return { text: 'Thunderstorm', icon: CloudRain };
	return { text: 'Unknown', icon: Cloud };
}

// Promisified Geolocation Wrapper
async function getUserLocation(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('Geolocation is not supported by your browser.'));
		} else {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				timeout: 10000,
				maximumAge: 5 * 60 * 1000, // Let the OS cache the coordinate for 5 minutes instead of 1 minute to reduce mobile battery drain and GPS icon flashing
			});
		}
	});
}

// Pure isolated network fetch
async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<WeatherResponse> {
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`API returned status: ${response.status}`);
	}
	return response.json();
}

// Haversine formula to calculate the great-circle distance between two points on a sphere given their longitudes and latitudes.
// This detects drastic location changes (e.g. user moved >= 3km) so we know when to discard weather cache.
function isDrasticLocationChange(oldLat: number, oldLng: number, newLat: number, newLng: number) {
	const earthRadiusKm = 6371; // Earth's mean radius in kilometers
	const drasticDistanceThresholdKm = 3; // The threshold in kilometers

	// Convert latitude and longitude differences from degrees to radians
	const deltaLatRadians = ((newLat - oldLat) * Math.PI) / 180;
	const deltaLngRadians = ((newLng - oldLng) * Math.PI) / 180;

	// Calculate the square of half the chord length between the points (a)
	const a =
		Math.sin(deltaLatRadians / 2) * Math.sin(deltaLatRadians / 2) +
		Math.cos((oldLat * Math.PI) / 180) *
			Math.cos((newLat * Math.PI) / 180) *
			Math.sin(deltaLngRadians / 2) *
			Math.sin(deltaLngRadians / 2);

	// Calculate the angular distance in radians (c)
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	// Calculate the great-circle distance in kilometers
	const distanceKm = earthRadiusKm * c;

	return distanceKm >= drasticDistanceThresholdKm;
}

// --- Types & Interfaces ---

export interface CurrentWeather {
	temperature_2m: number;
	relative_humidity_2m: number;
	apparent_temperature: number;
	is_day: number;
	precipitation: number;
	rain: number;
	showers: number;
	snowfall: number;
	weather_code: number;
	cloud_cover: number;
	pressure_msl: number;
	surface_pressure: number;
	wind_speed_10m: number;
	wind_direction_10m: number;
	wind_gusts_10m: number;
}

export interface DailyWeather {
	time: string[];
	weather_code: number[];
	temperature_2m_max: number[];
	temperature_2m_min: number[];
	sunrise: string[];
	sunset: string[];
}

export interface WeatherResponse {
	latitude: number;
	longitude: number;
	generationtime_ms: number;
	utc_offset_seconds: number;
	timezone: string;
	timezone_abbreviation: string;
	elevation: number;
	current_units: Record<string, string>;
	current: CurrentWeather;
	daily_units: Record<string, string>;
	daily: DailyWeather;
}

export interface WeatherCacheItem {
	lat: number;
	lng: number;
	timestamp: number;
	weather: WeatherResponse;
}
