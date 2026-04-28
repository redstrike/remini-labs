export interface IpLocationResponse {
	lat: number
	lng: number
	city: string
	country: string
	isp: string
}

// Helper to extract IP Location from Cloudflare platform object
export function getCloudflareIpLocation(cf?: App.Platform['cf']): IpLocationResponse | null {
	if (cf && cf.latitude && cf.longitude) {
		return {
			lat: parseFloat(cf.latitude),
			lng: parseFloat(cf.longitude),
			city: cf.city || '',
			country: cf.country || '',
			isp: cf.asOrganization || '',
		}
	}
	return null
}

// Standard errors are used here so both endpoints and remote functions can catch them.
export async function fetchServerIpLocation(
	fetchFn: typeof fetch = fetch,
	clientIp?: string,
): Promise<IpLocationResponse> {
	// If client IP is local, don't pass it so the API resolves the server's public IP (useful for local dev)
	const isLocal = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1'
	const url = isLocal ? 'https://ipwho.is/' : `https://ipwho.is/${clientIp}`

	const res = await fetchFn(url)
	if (!res.ok) {
		throw new Error(`ipwho.is returned ${res.status}`)
	}

	const data = await res.json()

	if (!data.success) {
		throw new Error(`ipwho.is error: ${data.message || 'Unknown error'}`)
	}

	return {
		lat: data.latitude,
		lng: data.longitude,
		city: data.city || '',
		country: data.country || '',
		isp: data.connection?.isp || data.connection?.org || '',
	}
}

// Reverse Geocoding Helper
export async function fetchServerReverseGeocode(
	lat: string | null,
	lng: string | null,
	fetchFn: typeof fetch = fetch,
): Promise<{ city: string; country: string; district: string; ward: string }> {
	if (!lat || !lng) {
		throw new Error('lat and lng query params are required')
	}

	const url = new URL('https://nominatim.openstreetmap.org/reverse')
	url.searchParams.set('lat', lat)
	url.searchParams.set('lon', lng)
	url.searchParams.set('format', 'json')
	const res = await fetchFn(url, {
		headers: {
			// Nominatim usage policy requires a descriptive User-Agent
			'User-Agent': 'ReminiLabs/1.0 (Weather Agent)',
			Accept: 'application/json',
		},
	})

	if (!res.ok) {
		throw new Error(`Nominatim returned ${res.status}`)
	}

	const data = await res.json()
	const address = data.address ?? {}

	// Nominatim uses city > town > village > municipality depending on area type
	const city: string = address.city ?? address.town ?? address.village ?? address.municipality ?? ''
	const country: string = address.country ?? ''
	// Ward/district for more precise location (e.g. "Hai Chau, Da Nang" instead of just "Da Nang")
	const district: string = address.city_district ?? address.district ?? address.county ?? ''
	const ward: string = address.quarter ?? address.suburb ?? address.neighbourhood ?? ''

	return { city, country, district, ward }
}
