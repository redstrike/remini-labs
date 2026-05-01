import { serverError502 } from '$lib/server-log'
import { json } from '@sveltejs/kit'

import { DEFAULT_INDEX_SYMBOL, fetchIndexQuote, parseVnSymbolParam } from '../../../shared/ssi-iboard-client'
import { freshMsForCache } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 60 * 1000 // floor — never cache shorter than 60s even if schedule says 0

export const GET: RequestHandler = async ({ url }) => {
	const parsed = parseVnSymbolParam(url, { defaultSymbol: DEFAULT_INDEX_SYMBOL })
	if ('errorResponse' in parsed) return parsed.errorResponse
	const { symbol } = parsed

	const cacheKey = `https://remini-labs.internal/tickers/api/spots/stocks?symbol=${symbol}`
	const freshMs = freshMsForCache(MIN_FRESH_MS)

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
		return serverError502('ssi-iboard-exchange-index-error', e, `Unable to fetch ${symbol} quote`, { symbol })
	}
}
