import { json } from '@sveltejs/kit'

import { DEFAULT_INDEX_SYMBOL, fetchIndexQuote } from '../../../shared/ssi-iboard-client'
import { msUntilNextPoll } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 60 * 1000 // floor — never cache shorter than 60s even if schedule says 0
const SYMBOL_RE = /^[A-Z0-9]+$/ // VN symbols are uppercase alphanumeric (e.g. VN100, VNINDEX, FPT)

function computeFreshMs(): number {
	return Math.max(MIN_FRESH_MS, msUntilNextPoll())
}

export const GET: RequestHandler = async ({ url }) => {
	const raw = url.searchParams.get('symbol') ?? DEFAULT_INDEX_SYMBOL
	const symbol = raw.toUpperCase()
	if (!SYMBOL_RE.test(symbol)) {
		return json({ error: `Invalid symbol: ${raw}` }, { status: 400 })
	}

	const cacheKey = `https://remini-labs.internal/tickers/api/spots/stocks?symbol=${symbol}`
	const freshMs = computeFreshMs()

	const { debounced, cache } = await probeCache(cacheKey, freshMs)
	if (debounced) return debounced.clone()

	try {
		const quote = await fetchIndexQuote(symbol)
		const response = json(quote, {
			headers: {
				'Cache-Control': `public, max-age=${Math.floor(freshMs / 1000)}, must-revalidate`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(cacheKey, response.clone())
		}

		return response
	} catch (e) {
		console.error('SSI iBoard exchange-index error:', e)
		return json({ error: `Unable to fetch ${symbol} quote` }, { status: 502 })
	}
}
