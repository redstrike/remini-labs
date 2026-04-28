import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'

import { fetchServerReverseGeocode } from './../weather-service'

// Server-side reverse geocoding proxy using Nominatim (OpenStreetMap).
// Accepts ?lat=X&lng=Y, returns { city, country }.
// Runs server-to-server to avoid CORS and comply with Nominatim's User-Agent policy.
export const GET: RequestHandler = async ({ url, fetch }) => {
	const latRaw = url.searchParams.get('lat')
	const lngRaw = url.searchParams.get('lng')

	if (!latRaw || !lngRaw) {
		error(400, 'lat and lng query params are required')
	}

	const lat = Number.parseFloat(latRaw)
	const lng = Number.parseFloat(lngRaw)

	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		error(400, 'lat and lng must be valid numbers')
	}
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		error(400, 'lat must be in [-90, 90] and lng in [-180, 180]')
	}

	try {
		// Pass the parsed numeric back as a clean string — guarantees the upstream URL gets a
		// well-formed numeric form (no whitespace, no `Infinity`, no scientific-notation surprises
		// that could change the assumed query shape on Nominatim's side).
		const data = await fetchServerReverseGeocode(String(lat), String(lng), fetch)
		return json(data)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		error(502, msg)
	}
}
