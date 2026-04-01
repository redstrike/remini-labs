import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchPriceTable } from '../phuquy-client'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/table'
const CACHE_TTL = 60

export const GET: RequestHandler = async ({ platform }) => {
	// Try Cloudflare Cache API first (persists across Worker cold starts)
	const cache = typeof caches !== 'undefined' ? await caches.open('tickers') : null
	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) return cached
	}

	try {
		const table = await fetchPriceTable()
		const response = json(table, {
			headers: { 'Cache-Control': `private, max-age=${CACHE_TTL}` },
		})

		// Store in Cache API for next request
		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		// On upstream error, try stale cache
		if (cache) {
			const stale = await cache.match(CACHE_KEY)
			if (stale) return stale
		}

		console.error('Phu Quy table API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
