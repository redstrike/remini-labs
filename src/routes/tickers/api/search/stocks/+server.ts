import { error, json } from '@sveltejs/kit'

import { fetchStockList, searchStocks, type StockInfo } from '../../ssi-iboard-client'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/search/stocks/dict'
// 7 days — VN IPOs/delistings happen weekly at most; quarterly index reviews still land within window.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000

// SSI's single-letter `type` → wire-friendly kind. Mappings are *observed* from live SSI data, not
// guessed: warrants are 'w' (CFPT*), futures are 'f' (VN30F1M = HĐTL = Hợp Đồng Tương Lai). The
// in-code comment in ssi-iboard-client.ts is stale — trust this map. Anything unmapped falls
// through as the raw letter so new SSI types stay visible instead of silently collapsing.
const KIND_MAP: Record<string, string> = {
	s: 'stock',
	i: 'index',
	w: 'warrant',
	f: 'futures',
	e: 'etf', // E1VFVN30 = Quỹ ETF DCVFMVN30
	b: 'bond', // VIC123029 = Tập đoàn Vingroup bond series
}

async function buildAndStore(cache: Cache | null): Promise<StockInfo[]> {
	const list = await fetchStockList()
	if (cache) {
		await cache.put(
			CACHE_KEY,
			new Response(JSON.stringify(list), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `public, s-maxage=${Math.floor(FRESH_MS / 1000)}, max-age=0`,
					'X-Cached-At': String(Date.now()),
				},
			}),
		)
	}
	return list
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const q = url.searchParams.get('q') ?? ''
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	let list: StockInfo[] | null = null

	if (cache) {
		const cached = await cache.match(CACHE_KEY)
		if (cached) {
			list = (await cached.json()) as StockInfo[]
			const age = Date.now() - Number(cached.headers.get('X-Cached-At') || 0)
			if (age >= FRESH_MS && platform?.context?.waitUntil) {
				platform.context.waitUntil(
					buildAndStore(cache).catch((e) => console.error('stock dict refresh failed:', e)),
				)
			}
		}
	}

	// No cached list (cold cache OR dev where Workers Cache is absent): build it now.
	if (!list) {
		try {
			list = await buildAndStore(cache)
		} catch (e) {
			console.error('SSI iBoard stock-info error:', e)
			error(502, 'stock symbol dict unavailable')
		}
	}

	// Slim each match to {symbol, name, kind}. `kind` drives quote routing downstream (indices use
	// /exchange-index/{SYMBOL}, everything else uses /stock/{SYMBOL}) and lets the picker badge types.
	const matches = searchStocks(q, list, 10).map((r) => ({
		symbol: r.symbol,
		name: r.companyNameVi || r.companyNameEn || r.fullName,
		kind: KIND_MAP[r.type] ?? r.type,
	}))

	return json(matches)
}
