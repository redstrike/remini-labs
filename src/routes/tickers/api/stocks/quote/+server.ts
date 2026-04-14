import { json } from '@sveltejs/kit'

import { msUntilNextPoll } from '../../../vn-stock-schedule'
import { fetchStockQuote } from '../../ssi-iboard-client'
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
	const cache = (await globalThis.caches?.open('tickers')) ?? null
	const { freshMs, staleMs } = computeTtls()

	if (cache) {
		const cached = await cache.match(cacheKey)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < freshMs) return cached.clone()
		}
	}

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
		if (cache) {
			const stale = await cache.match(cacheKey)
			if (stale) {
				const cachedAt = Number(stale.headers.get('X-Cached-At') || 0)
				if (Date.now() - cachedAt < staleMs) return stale.clone()
			}
		}

		console.error('SSI iBoard stock quote error:', e)
		return json({ error: `Unable to fetch ${symbol} quote` }, { status: 502 })
	}
}
