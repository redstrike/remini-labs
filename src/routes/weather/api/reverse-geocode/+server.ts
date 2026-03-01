import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'

import { fetchServerReverseGeocode } from './../weather-service'

// Server-side reverse geocoding proxy using Nominatim (OpenStreetMap).
// Accepts ?lat=X&lng=Y, returns { city, country }.
// Runs server-to-server to avoid CORS and comply with Nominatim's User-Agent policy.
export const GET: RequestHandler = async ({ url, fetch }) => {
	const lat = url.searchParams.get('lat')
	const lng = url.searchParams.get('lng')

	try {
		const data = await fetchServerReverseGeocode(lat, lng, fetch)
		return json(data)
	} catch (e: any) {
		const status = e.message.includes('required') ? 400 : 502
		error(status, e.message)
	}
}
