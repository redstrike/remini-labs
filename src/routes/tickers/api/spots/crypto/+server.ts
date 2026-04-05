import { json } from '@sveltejs/kit'

import { fetchCryptoTickers } from '../../binance-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/crypto'
const DEBOUNCE_TTL = 10 // seconds — dedup rapid-fire requests, not a freshness cache

export const GET: RequestHandler = async () => {
	const cache = typeof caches !== 'undefined' ? await caches.open('tickers') : null

	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < DEBOUNCE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const tickers = await fetchCryptoTickers()
		const response = json(tickers, {
			headers: {
				'Cache-Control': `private, max-age=${DEBOUNCE_TTL}`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		console.error('Binance ticker API error:', e)
		return json({ error: 'Unable to fetch crypto prices' }, { status: 502 })
	}
}
