import { serverError502 } from '$lib/server-log'
import { json } from '@sveltejs/kit'

import { fetchStockQuote, parseVnSymbolParam } from '../../../shared/ssi-iboard-client'
import { freshMsForCache } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 60 * 1000
const STALE_GRACE_MS = 5 * 60 * 1000

export const GET: RequestHandler = async ({ url }) => {
	const parsed = parseVnSymbolParam(url) // no defaultSymbol — required
	if ('errorResponse' in parsed) return parsed.errorResponse
	const { symbol } = parsed

	const cacheKey = `https://remini-labs.internal/tickers/api/stocks/quote?symbol=${symbol}`
	const freshMs = freshMsForCache(MIN_FRESH_MS)
	const staleMs = freshMs + STALE_GRACE_MS

	const { debounced, cached, cache } = await probeCache(cacheKey, freshMs)
	if (debounced) return debounced.clone()

	try {
		const quote = await fetchStockQuote(symbol)
		const response = json(quote, {
			headers: {
				// `private` silently blocks `cache.put` on Workers Cache + the project polyfill
				// (see reference_workers_cache_api_gotchas.md). Match the sibling spots/charts
				// pattern so the cache.put below + stale-on-error fallback at the bottom both work.
				'Cache-Control': `public, max-age=${Math.floor(freshMs / 1000)}, must-revalidate`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(cacheKey, response.clone())
		}

		return response
	} catch (e) {
		// `cached` is the same probe result — body untouched (debounced was null, so the fresh
		// path didn't consume it). Reuse for stale-on-error within the bounded grace window.
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') ?? 0)
			if (Date.now() - cachedAt < staleMs) return cached.clone()
		}

		return serverError502('ssi-iboard-stock-quote-error', e, `Unable to fetch ${symbol} quote`, { symbol })
	}
}
