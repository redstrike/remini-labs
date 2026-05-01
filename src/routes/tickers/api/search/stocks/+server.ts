import { fetchStockList, searchStocks, type StockInfo } from '../../../shared/ssi-iboard-client'
import { createDictSearchHandler } from '../../dict-search-handler'

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

interface StockMatch {
	symbol: string
	name: string
	kind: string
}

// Slim each match to {symbol, name, kind}. `kind` drives quote routing downstream (indices use
// /exchange-index/{SYMBOL}, everything else uses /stock/{SYMBOL}) and lets the picker badge
// types. Limit 25 leaves room for the "dumb browse" mode (typing `ETF` / `Index` returns every
// matching kind, popularity-ordered) — alphabetic-only with limit 10 was hiding long ETF
// symbols like FUEVFVND when the user typed a short prefix like `FUE`.
export const GET = createDictSearchHandler<StockInfo[], StockInfo, StockMatch>({
	cacheKey: 'https://remini-labs.internal/tickers/api/search/stocks/dict',
	freshMs: FRESH_MS,
	maxAgeSeconds: FRESH_MS / 1000,
	fetchAll: fetchStockList,
	search: (q, list) => searchStocks(q, list, 25),
	mapResult: (r) => ({
		symbol: r.symbol,
		name: r.companyNameVi || r.companyNameEn || r.fullName,
		kind: KIND_MAP[r.type] ?? r.type,
	}),
	errorTag: { fetch: 'ssi-iboard-stock-info-error', refresh: 'stock-dict-refresh-error' },
	errorMessage: 'stock symbol dict unavailable',
})
