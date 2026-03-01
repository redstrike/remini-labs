import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'

import { fetchServerIpLocation } from './../weather-service'

// Server-side proxy that fetches https://ip.me/ and scrapes the data table.
// Runs server-to-server so there are no CORS restrictions.
export const GET: RequestHandler = async ({ fetch }) => {
	try {
		const data = await fetchServerIpLocation(fetch)
		return json(data)
	} catch (e: any) {
		error(502, e.message)
	}
}
