import { logServerError } from '$lib/server-log'
import { error, json } from '@sveltejs/kit'

import { fetchCryptoTickers } from '../../../shared/binance-client'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/crypto'
const DEBOUNCE_TTL_MS = 5 * 60 * 1000 // 5 min — dedup rapid-fire requests and cap our Binance API hit rate

export const GET: RequestHandler = async () => {
	const { debounced, cache } = await probeCache(CACHE_KEY, DEBOUNCE_TTL_MS)
	if (debounced) return debounced

	try {
		const tickers = await fetchCryptoTickers()
		const response = json(tickers, {
			headers: {
				'Cache-Control': `public, max-age=${DEBOUNCE_TTL_MS / 1000}, must-revalidate`,
				'X-Cached-At': String(Date.now()),
			},
		})
		if (cache) await cache.put(CACHE_KEY, response.clone())
		return response
	} catch (e) {
		logServerError('binance-ticker-error', e)
		error(502, 'crypto upstream unavailable')
	}
}
