import { json } from '@sveltejs/kit'

import { DEFAULT_INDEX_SYMBOL, fetchChart } from '../../../shared/ssi-iboard-client'
import { msUntilNextPoll } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 10 * 1000 // debounce floor — dedup rapid-fire requests
const SYMBOL_RE = /^[A-Z0-9]+$/

/** Chart TTL mirrors the spot schedule: fresh during trading, long during closed hours. */
function computeFreshMs(): number {
	return Math.max(MIN_FRESH_MS, msUntilNextPoll())
}

export const GET: RequestHandler = async ({ url }) => {
	const raw = url.searchParams.get('symbol') ?? DEFAULT_INDEX_SYMBOL
	const symbol = raw.toUpperCase()
	if (!SYMBOL_RE.test(symbol)) {
		return json({ error: `Invalid symbol: ${raw}` }, { status: 400 })
	}

	const cacheKey = `https://remini-labs.internal/tickers/api/charts/stocks?symbol=${symbol}`
	const freshMs = computeFreshMs()

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
		console.error('SSI iBoard charts/history error:', e)
		return json({ error: `Unable to fetch ${symbol} chart data` }, { status: 502 })
	}
}
