import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'

// Server-side proxy that fetches https://ip.me/ and scrapes the data table.
// Runs server-to-server so there are no CORS restrictions.
//
// HTML structure we target:
//   <th>City:</th>     <td><code>Hanoi</code></td>
//   <th>Country:</th>  <td><code>Vietnam</code></td>
//   <td class="latitude"><code>21.0184</code></td>
//   <td class="longitude"><code>105.8461</code></td>
export const GET: RequestHandler = async ({ fetch }) => {
	const res = await fetch('https://ip.me/')
	if (!res.ok) {
		error(502, `ip.me returned ${res.status}`)
	}

	const html = await res.text()

	const lat = extractClassedTd(html, 'latitude')
	const lng = extractClassedTd(html, 'longitude')
	const city = extractLabeledTd(html, 'City')
	const country = extractLabeledTd(html, 'Country')
	const isp = extractLabeledTd(html, 'ISP Name')

	if (lat === null || lng === null) {
		error(502, 'Could not parse lat/lng from ip.me response')
	}

	return json({ lat, lng, city, country, isp })
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
