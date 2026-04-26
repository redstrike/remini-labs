import { json } from '@sveltejs/kit'

import { fetchStockQuote } from '../../../shared/ssi-iboard-client'
import { msUntilNextPoll } from '../../../vn-stock-schedule'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const MIN_FRESH_MS = 60 * 1000
const STALE_GRACE_MS = 5 * 60 * 1000
const SYMBOL_RE = /^[A-Z0-9]+$/

function computeTtls(): { freshMs: number; staleMs: number } {
	const freshMs = Math.max(MIN_FRESH_MS, msUntilNextPoll())
	const staleMs = freshMs + STALE_GRACE_MS
	return { freshMs, staleMs }
}

export const GET: RequestHandler = async ({ url }) => {
	const raw = url.searchParams.get('symbol')
	if (!raw) return json({ error: '?symbol= is required' }, { status: 400 })
	const symbol = raw.toUpperCase()
	if (!SYMBOL_RE.test(symbol)) {
		return json({ error: `Invalid symbol: ${raw}` }, { status: 400 })
	}

	const cacheKey = `https://remini-labs.internal/tickers/api/stocks/quote?symbol=${symbol}`
	const { freshMs, staleMs } = computeTtls()

	const { debounced, cached, cache } = await probeCache(cacheKey, freshMs)
	if (debounced) return debounced.clone()

	try {
		const quote = await fetchStockQuote(symbol)
		const response = json(quote, {
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
		// `cached` is the same probe result — body untouched (debounced was null, so the fresh
		// path didn't consume it). Reuse for stale-on-error within the bounded grace window.
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < staleMs) return cached.clone()
		}

		console.error('SSI iBoard stock quote error:', e)
		return json({ error: `Unable to fetch ${symbol} quote` }, { status: 502 })
	}
}
