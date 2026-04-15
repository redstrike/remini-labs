import { error, json } from '@sveltejs/kit'

import { fetchCryptoTickers } from '../../binance-client'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/crypto'
const DEBOUNCE_TTL = 60 // seconds — dedup rapid-fire requests and cap our Binance API hit rate
const STALE_RETENTION = 3600 // seconds — keep entries around for stale-on-error fallback

export const GET: RequestHandler = async () => {
	const { debounced, cached, cache } = await probeCache(CACHE_KEY, DEBOUNCE_TTL)
	if (debounced) return debounced

	try {
		const tickers = await fetchCryptoTickers()
		const response = json(tickers, {
			headers: {
				'Cache-Control': `public, s-maxage=${STALE_RETENTION}, max-age=0, stale-if-error=${STALE_RETENTION}`,
				'X-Cached-At': String(Date.now()),
			},
		})
		if (cache) await cache.put(CACHE_KEY, response.clone())
		return response
	} catch (e) {
		if (cached) return cached // both mirrors dead — serve whatever's still cached
		console.error('Binance ticker API error:', e)
		error(502, 'crypto upstream unavailable')
	}
}
