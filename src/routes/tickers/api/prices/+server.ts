import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchPriceSummary } from '../phuquy-client'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/prices'
const CACHE_TTL = 60

export const GET: RequestHandler = async ({ platform }) => {
	const cache = typeof caches !== 'undefined' ? await caches.open('tickers') : null
	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) return cached
	}

	try {
		const summary = await fetchPriceSummary()
		const response = json(summary, {
			headers: { 'Cache-Control': `private, max-age=${CACHE_TTL}` },
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		if (cache) {
			const stale = await cache.match(CACHE_KEY)
			if (stale) return stale
		}

		console.error('Phu Quy prices API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
