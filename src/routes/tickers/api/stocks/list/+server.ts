import { json } from '@sveltejs/kit'

import { fetchStockList } from '../../ssi-iboard-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/stocks/list'
// Symbol universe changes on IPO / delisting only — refresh at most once a day.
const FRESH_MS = 24 * 60 * 60 * 1000
const STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000 // serve stale for a week on upstream error

export const GET: RequestHandler = async () => {
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < FRESH_MS) return cached.clone()
		}
	}

	try {
		const list = await fetchStockList()
		const response = json(list, {
			headers: {
				'Cache-Control': `public, max-age=${Math.floor(FRESH_MS / 1000)}`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		if (cache) {
			const stale = await cache.match(CACHE_KEY)
			if (stale) {
				const cachedAt = Number(stale.headers.get('X-Cached-At') || 0)
				if (Date.now() - cachedAt < STALE_GRACE_MS) return stale.clone()
			}
		}

		console.error('SSI iBoard stock-info error:', e)
		return json({ error: 'Unable to fetch stock master list' }, { status: 502 })
	}
}
