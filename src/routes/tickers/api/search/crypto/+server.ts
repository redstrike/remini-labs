import { logServerError } from '$lib/server-log'
import { error, json } from '@sveltejs/kit'

import { fetchCryptoDict, searchCryptoDict, type CryptoDict } from '../../../shared/binance-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/search/crypto/dict'
// 7 days — Binance lists new pairs weekly at most; user explicitly opted out of chasing fresh listings.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000

async function buildAndStore(cache: Cache | null): Promise<CryptoDict> {
	const dict = await fetchCryptoDict()
	if (cache) {
		await cache.put(
			CACHE_KEY,
			new Response(JSON.stringify(dict), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=604800, must-revalidate',
					'X-Cached-At': String(Date.now()),
				},
			}),
		)
	}
	return dict
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const q = url.searchParams.get('q') ?? ''
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	let dict: CryptoDict | null = null

	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			dict = (await cached.json()) as CryptoDict
			const age = Date.now() - Number(cached.headers.get('X-Cached-At') || 0)
			// Stale: serve current dict immediately, refresh in the background.
			if (age >= FRESH_MS && platform?.context?.waitUntil) {
				platform.context.waitUntil(
					buildAndStore(cache).catch((e) => logServerError('crypto-dict-refresh-error', e)),
				)
			}
		}
	}

	// No cached dict (cold cache OR dev where Workers Cache is absent): build it now.
	if (!dict) {
		try {
			dict = await buildAndStore(cache)
		} catch (e) {
			logServerError('binance-exchangeinfo-error', e)
			error(502, 'crypto symbol dict unavailable')
		}
	}

	return json(searchCryptoDict(q, dict), { headers: { 'Cache-Control': 'public, max-age=604800, must-revalidate' } })
}
