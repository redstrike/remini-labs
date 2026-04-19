import { error, json } from '@sveltejs/kit'

import { fetchCryptoTickers } from '../../../shared/binance-client'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/crypto'
const DEBOUNCE_TTL = 300 // seconds — dedup rapid-fire requests and cap our Binance API hit rate

export const GET: RequestHandler = async () => {
	const { debounced, cache } = await probeCache(CACHE_KEY, DEBOUNCE_TTL)
	if (debounced) return debounced

	try {
		const tickers = await fetchCryptoTickers()
		const response = json(tickers, {
			headers: {
				'Cache-Control': 'public, max-age=300, must-revalidate',
				'X-Cached-At': String(Date.now()),
			},
		})
		if (cache) await cache.put(CACHE_KEY, response.clone())
		return response
	} catch (e) {
		console.error('Binance ticker API error:', e)
		error(502, 'crypto upstream unavailable')
	}
}
