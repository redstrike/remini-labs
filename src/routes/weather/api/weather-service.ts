// Standard errors are used here so both endpoints and remote functions can catch them.
export async function fetchServerIpLocation(fetchFn: typeof fetch = fetch): Promise<{
	lat: number
	lng: number
	city: string
	country: string
	isp: string
}> {
	const res = await fetchFn('https://ip.me/')
	if (!res.ok) {
		throw new Error(`ip.me returned ${res.status}`)
	}

	const html = await res.text()

	const lat = extractClassedTd(html, 'latitude')
	const lng = extractClassedTd(html, 'longitude')
	const city = extractLabeledTd(html, 'City')
	const country = extractLabeledTd(html, 'Country')
	const isp = extractLabeledTd(html, 'ISP Name')

	if (lat === null || lng === null) {
		throw new Error('Could not parse lat/lng from ip.me response')
	}

	return { lat, lng, city, country, isp }
}

/**
 * Extracts the float value from <td class="{name}"><code>…</code></td>
 * Used for latitude and longitude which have explicit class names.
 */
function extractClassedTd(html: string, className: string): number | null {
	const match = html.match(new RegExp(`<td[^>]*class="${className}"[^>]*>\\s*<code>([\\d.\\-]+)<\\/code>`, 'i'))
	if (!match) return null
	const value = parseFloat(match[1])
	return isNaN(value) ? null : value
}

/**
 * Extracts the text from the <td><code>…</code></td> that follows a <th>{label}:</th>.
 * Used for City, Country which have no dedicated class.
 */
function extractLabeledTd(html: string, label: string): string {
	const match = html.match(new RegExp(`<th>${label}:<\\/th>\\s*<td><code>([^<]+)<\\/code><\\/td>`, 'i'))
	return match ? match[1].trim() : ''
}

// Reverse Geocoding Helper
export async function fetchServerReverseGeocode(
	lat: string | null,
	lng: string | null,
	fetchFn: typeof fetch = fetch,
): Promise<{ city: string; country: string }> {
	if (!lat || !lng) {
		throw new Error('lat and lng query params are required')
	}

	const res = await fetchFn(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
		headers: {
			// Nominatim usage policy requires a descriptive User-Agent
			'User-Agent': 'MegaAppShell/1.0 (Weather Mini-App)',
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

	return { city, country }
}
