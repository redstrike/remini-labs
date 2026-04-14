import { json } from '@sveltejs/kit'

import { msUntilNextPoll } from '../../../vn-stock-schedule'
import { DEFAULT_INDEX_SYMBOL, fetchChart } from '../../ssi-iboard-client'
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
	const cache = (await globalThis.caches?.open('tickers')) ?? null
	const freshMs = computeFreshMs()

	if (cache) {
		const cached = await cache.match(cacheKey)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < freshMs) return cached.clone()
		}
	}

	try {
		const chartData = await fetchChart(symbol)
		const response = json(chartData, {
			headers: {
				'Cache-Control': `private, max-age=${Math.floor(freshMs / 1000)}`,
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
