import { json } from '@sveltejs/kit'

import { fetchPriceTable } from '../../../shared/phuquy-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/metals'
const DEBOUNCE_TTL = 900

export const GET: RequestHandler = async () => {
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	// Check cache — only use if within TTL (stored in X-Cached-At header)
	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < DEBOUNCE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const table = await fetchPriceTable()
		const response = json(table, {
			headers: {
				'Cache-Control': 'public, max-age=900, must-revalidate',
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		console.error('Phu Quy table API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
