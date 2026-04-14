import { json } from '@sveltejs/kit'

import { fetchCryptoKlines, ALL_SYMBOLS, type CryptoSymbol } from '../../binance-client'
import type { RequestHandler } from './$types'

const DEBOUNCE_TTL = 10 // seconds — dedup rapid-fire requests, not a freshness cache

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol') as CryptoSymbol | null

	if (!symbol || !ALL_SYMBOLS.includes(symbol)) {
		return json({ error: `symbol query param required, one of: ${ALL_SYMBOLS.join(', ')}` }, { status: 400 })
	}

	const cacheKey = `https://remini-labs.internal/tickers/api/charts/crypto?symbol=${symbol}`
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	if (cache) {
		const cached = await cache.match(cacheKey)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < DEBOUNCE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const chartData = await fetchCryptoKlines(symbol)
		const response = json(chartData, {
			headers: {
				'Cache-Control': `private, max-age=${DEBOUNCE_TTL}`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(cacheKey, response.clone())
		}

		return response
	} catch (e) {
		console.error('Binance klines API error:', e)
		return json({ error: 'Unable to fetch crypto chart data' }, { status: 502 })
	}
}
