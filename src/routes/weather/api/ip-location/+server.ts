import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'

import { fetchServerIpLocation, getCloudflareIpLocation } from './../weather-service'

// Gets user's geolocation natively from Cloudflare platform.cf object or
// a fallback to ipwho.is API (server-to-server avoiding CORS).
export const GET: RequestHandler = async (event) => {
	try {
		const cfLocation = getCloudflareIpLocation(event.platform?.cf)
		if (cfLocation) {
			return json(cfLocation)
		}

		const clientIp = event.getClientAddress()
		const data = await fetchServerIpLocation(event.fetch, clientIp)
		return json(data)
	} catch (e: any) {
		error(502, e.message)
	}
}
