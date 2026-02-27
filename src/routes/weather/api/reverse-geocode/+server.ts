import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

// Server-side reverse geocoding proxy using Nominatim (OpenStreetMap).
// Accepts ?lat=X&lng=Y, returns { city, country }.
// Runs server-to-server to avoid CORS and comply with Nominatim's User-Agent policy.
export const GET: RequestHandler = async ({ fetch, url }) => {
	const lat = url.searchParams.get('lat');
	const lng = url.searchParams.get('lng');

	if (!lat || !lng) {
		error(400, 'lat and lng query params are required');
	}

	const res = await fetch(
		`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
		{
			headers: {
				// Nominatim usage policy requires a descriptive User-Agent
				'User-Agent': 'MegaAppShell/1.0 (Weather Mini-App)',
				Accept: 'application/json',
			},
		},
	);

	if (!res.ok) {
		error(502, `Nominatim returned ${res.status}`);
	}

	const data = await res.json();
	const address = data.address ?? {};

	// Nominatim uses city > town > village > municipality depending on area type
	const city: string =
		address.city ?? address.town ?? address.village ?? address.municipality ?? '';
	const country: string = address.country ?? '';

	return json({ city, country });
};
