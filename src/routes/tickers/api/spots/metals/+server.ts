import { json } from '@sveltejs/kit'

import { fetchPriceTable } from '../../phuquy-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/metals'
const CACHE_TTL = 60
const STALE_TTL = 300

export const GET: RequestHandler = async () => {
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	// Check cache — only use if within TTL (stored in X-Cached-At header)
	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < CACHE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const table = await fetchPriceTable()
		const response = json(table, {
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
		// On upstream error, serve stale cache (up to STALE_TTL)
		if (cache) {
			const stale = await cache.match(CACHE_KEY)
			if (stale) {
				const cachedAt = Number(stale.headers.get('X-Cached-At') || 0)
				if (Date.now() - cachedAt < STALE_TTL * 1000) return stale.clone()
			}
		}

		console.error('Phu Quy table API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
