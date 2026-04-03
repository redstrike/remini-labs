import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchPriceSummary } from '../phuquy-client'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/prices'
const CACHE_TTL = 60
const STALE_TTL = 300

export const GET: RequestHandler = async ({ platform }) => {
	const cache = typeof caches !== 'undefined' ? await caches.open('tickers') : null

	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < CACHE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const summary = await fetchPriceSummary()
		const response = json(summary, {
			headers: {
				'Cache-Control': `private, max-age=${CACHE_TTL}`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		if (cache) {
			const stale = await cache.match(CACHE_KEY)
			if (stale) {
				const cachedAt = Number(stale.headers.get('X-Cached-At') || 0)
				if (Date.now() - cachedAt < STALE_TTL * 1000) return stale.clone()
			}
		}

		console.error('Phu Quy prices API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
