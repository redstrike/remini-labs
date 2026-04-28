import { logServerError } from '$lib/server-log'
import { json } from '@sveltejs/kit'

import { DEFAULT_INDEX_SYMBOL, VN_SYMBOL_RE, fetchChart } from '../../../shared/ssi-iboard-client'
import { freshMsForCache } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 10 * 1000 // debounce floor — dedup rapid-fire requests

export const GET: RequestHandler = async ({ url }) => {
	const raw = url.searchParams.get('symbol') ?? DEFAULT_INDEX_SYMBOL
	const symbol = raw.toUpperCase()
	if (!VN_SYMBOL_RE.test(symbol)) {
		return json({ error: `Invalid symbol: ${raw}` }, { status: 400 })
	}

	const cacheKey = `https://remini-labs.internal/tickers/api/charts/stocks?symbol=${symbol}`
	const freshMs = freshMsForCache(MIN_FRESH_MS)

	const { debounced, cache } = await probeCache(cacheKey, freshMs)
	if (debounced) return debounced.clone()

	try {
		const chartData = await fetchChart(symbol)
		const response = json(chartData, {
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
		logServerError('ssi-iboard-charts-history-error', e, { symbol })
		return json({ error: `Unable to fetch ${symbol} chart data` }, { status: 502 })
	}
}
