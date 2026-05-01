import { json } from '@sveltejs/kit'

import { createFetchWithTimeout } from './fetch-with-timeout'
import { toUTCDate } from './ict-date'
import { pctChange } from './number-format'
import type { OHLCCandle } from './phuquy-client'

const IBOARD_API = 'https://iboard-api.ssi.com.vn'
const IBOARD_QUERY = 'https://iboard-query.ssi.com.vn'

/** Pinned default — VN100 is today's opinionated "VN market glance" index. */
export const DEFAULT_INDEX_SYMBOL = 'VN100'

/** SSI symbol shape — uppercase alphanumeric, 1-16 chars (longest real VN ticker is 9 chars,
 * `FUEVFVND`; the cap blocks attacker-controlled payloads from bloating Workers Cache keys
 * via `?symbol=AAAA…`). */
export const VN_SYMBOL_RE = /^[A-Z0-9]{1,16}$/

/** Result shape of `parseVnSymbolParam` — discriminated union so TS narrows after the check. */
export type VnSymbolParseResult = { symbol: string } | { errorResponse: Response }

/** Parse + validate the `?symbol=...` query param against the VN symbol shape. Pass
 * `defaultSymbol` to make the param optional (the natural default for spots/charts endpoints).
 * On hit returns the upper-cased symbol; on miss returns a 400 Response with `{ error }` —
 * the caller short-circuits with `if ('errorResponse' in r) return r.errorResponse`. */
export function parseVnSymbolParam(url: URL, opts: { defaultSymbol?: string } = {}): VnSymbolParseResult {
	const raw = url.searchParams.get('symbol')
	const candidate = raw ?? opts.defaultSymbol
	if (!candidate) {
		return { errorResponse: json({ error: 'symbol query param required' }, { status: 400 }) }
	}
	const symbol = candidate.toUpperCase()
	if (!VN_SYMBOL_RE.test(symbol)) {
		return {
			errorResponse: json({ error: 'Invalid symbol — uppercase alphanumeric, 1-16 chars' }, { status: 400 }),
		}
	}
	return { symbol }
}

/** Well-known VN-market indices. SSI's `/exchange-index/{ID}` endpoint serves these; every other
 * symbol (FPT, VCB, MWG, …) is a regular equity served by `/stock/{SYMBOL}` + `/le-table/...`.
 * The watchlist stores symbols as plain strings (no kind metadata), so we re-derive kind from
 * this set on every fetch — both the smart-fetch and periodic refresh code paths gate on it.
 * The picker's `kind: 'index'` field is the same source of truth (SSI dictionary), but doesn't
 * survive a page reload through localStorage; the hardcoded set is the durable floor.
 *
 * Coverage: HOSE main + size + diamond + sector indices, the full HNX family, UPCOM. Add new
 * HOSE/HNX/UPCOM indices here as they're listed (quarterly index reviews are the main churn). */
export const KNOWN_VN_INDICES = new Set([
	// HOSE main + size + theme + composites — names match SSI's `/stock-info` dictionary verbatim
	// (verified live: SSI uses `VNALL` not `VNALLSHARE`, `HNXUPCOMINDEX` not `UPCOMINDEX`).
	'VNINDEX',
	'VN30',
	'VN100',
	'VNALL',
	'VNXALL',
	'VNMID',
	'VNSML',
	'VNDIAMOND',
	'VNFINLEAD',
	'VNFINSELECT',
	'VNX50',
	'VNSI',
	'VNCOND',
	// HOSE sectors
	'VNCONS',
	'VNFIN',
	'VNHEAL',
	'VNIND',
	'VNIT',
	'VNMAT',
	'VNREAL',
	'VNUTI',
	'VNENE',
	// HNX family + UPCoM (SSI groups UPCOM under the HNX prefix as `HNXUPCOMINDEX`)
	'HNXINDEX',
	'HNX30',
	'HNXUPCOMINDEX',
])

/** True when the symbol matches a known VN exchange-index (fetched via `/exchange-index/{ID}`).
 * False for everything else — equities, warrants, ETFs, futures (those route through stock/futures
 * endpoints). Comparison is case-insensitive against `KNOWN_VN_INDICES`. */
export function isVnIndex(symbol: string): boolean {
	return KNOWN_VN_INDICES.has(symbol.toUpperCase())
}

// --- Types ---

/** Index quote from /exchange-index/{ID} — breadth counts + session aggregates. Index-only endpoint. */
export interface IndexQuote {
	code: string // e.g. 'VN100', 'VNINDEX', 'VN30', 'HNXINDEX', 'UPCOMINDEX'
	time: number // unix ms from exchange
	close: number // current index value
	refValue: number // prior close / reference
	change: number // absolute points vs refValue
	pctChange: number // percent change vs refValue
	high: number // session high (chartHigh)
	low: number // session low (chartLow)
	advances: number // stocks up today
	declines: number // stocks down today
	unchanged: number // stocks flat today
	totalVolume: number // matched volume (shares)
	totalValue: number // matched value (VND)
}

/**
 * Individual stock quote — merges static company data + latest matched trade.
 *
 * Price scale note: `price`, `refPrice`, `change`, `ceiling`, `floor` are in **full VND per share**
 * (e.g. FPT at 76,000 comes through as `76000`, not `76.0`). This matches SSI's `/stock/{symbol}` +
 * `/le-table` endpoints, which return full-VND integers. The chart endpoint `/charts/history` uses
 * a *different* scale (thousand-VND, so 76 = 76,000 VND) — don't confuse the two when wiring UI.
 */
export interface StockQuote {
	symbol: string // 'FPT'
	exchange: string // 'hose' | 'hnx' | 'upcom'
	companyNameVi: string
	companyNameEn: string
	time: string // 'HH:MM:SS' — timestamp of last matched trade
	price: number // latest matched price, full VND/share
	refPrice: number // prior close / reference, full VND/share
	change: number // priceChange, full VND
	pctChange: number // priceChangePercent
	ceiling: number // upper trading band for today, full VND/share
	floor: number // lower trading band for today, full VND/share
	accumulatedVol: number // today's cumulative matched volume (shares)
	accumulatedVal: number // today's cumulative matched value (VND)
	listedShare: number
	parValue: number
}

/** Symbol master-list entry for autocomplete / picker UI. */
export interface StockInfo {
	symbol: string // 'FPT'
	isin: string // 'VN000000FPT1'
	exchange: string // 'hose' | 'hnx' | 'upcom' | 'der' (derivatives) …
	companyNameVi: string // SSI: clientName
	companyNameEn: string // SSI: clientNameEn
	fullName: string // legal name
	type: string // 's' stock · 'i' index · 'c' covered warrant · 'e' ETF · 'f' fund …
}

/** Daily OHLC chart data — same shape whether the symbol is an index or a stock. */
export interface OhlcChartData {
	changeRate: number
	candles: OHLCCandle[]
}

// --- Upstream response shapes ---

interface SsiEnvelope<T> {
	code: string // 'SUCCESS' | 'ERR_STS_*'
	message: string
	data: T
}

interface ExchangeIndexData {
	indexId: string
	exchange: string
	indexValue: number
	prevIndexValue: number
	time: number
	change: number
	changePercent: number
	advances: number
	declines: number
	nochanges: number
	chartHigh: number
	chartLow: number
	allQty: number
	allValue: number
}

interface StockStaticData {
	stockSymbol: string
	exchange: string
	boardId: string
	companyNameVi: string
	companyNameEn: string
	ceiling: number
	floor: number
	refPrice: number
	listedShare: number
	parValue: number
}

interface LeTableRow {
	stockSymbol: string
	price: number
	priceChange: number
	priceChangePercent: number
	ref: number
	accumulatedVol: number
	accumulatedVal: number
	time: string // HH:MM:SS
}

interface LeTableData {
	items: LeTableRow[]
}

interface StockInfoRaw {
	isin: string
	exchange: string
	code: string
	name: string
	symbol: string
	fullName: string
	clientName: string
	clientNameEn: string
	type: string
}

interface UdfBars {
	s: 'ok' | 'no_data' | 'error'
	t: number[] // unix seconds
	o: number[]
	h: number[]
	l: number[]
	c: number[]
	v: number[]
}

// --- Fetch helper ---

// iBoard is Cloudflare-fronted; a browser-shaped UA avoids occasional 403s.
// Origin header matches real iBoard frontend traffic.
const withTimeout = createFetchWithTimeout({
	timeoutMs: 5_000,
	headers: {
		'User-Agent': 'Mozilla/5.0 (compatible; ReminiLabs/1.0)',
		Origin: 'https://iboard.ssi.com.vn',
		Accept: '*/*',
	},
})

async function unwrap<T>(res: Response, label: string): Promise<T> {
	if (!res.ok) throw new Error(`${label} returned ${res.status}`)
	const envelope: SsiEnvelope<T> = await res.json()
	if (envelope.code !== 'SUCCESS') {
		throw new Error(`${label} returned code=${envelope.code}: ${envelope.message}`)
	}
	return envelope.data
}

// --- Public API ---

/**
 * Fetch a spot quote for a VN stock **index** (VN100, VNINDEX, VN30, HNXINDEX, etc.).
 * Endpoint: /exchange-index/{ID} — pre-computed change/pctChange + breadth, single round-trip.
 *
 * For individual stock tickers (FPT, VCB, FOX), use `fetchStockQuote` (TODO — watchlist feature).
 */
export async function fetchIndexQuote(symbol: string = DEFAULT_INDEX_SYMBOL): Promise<IndexQuote> {
	const url = `${IBOARD_QUERY}/exchange-index/${symbol}`
	const res = await withTimeout(url)
	const data = await unwrap<ExchangeIndexData>(res, 'SSI iBoard exchange-index')

	return {
		code: symbol,
		time: data.time,
		close: data.indexValue,
		refValue: data.prevIndexValue,
		change: data.change,
		pctChange: data.changePercent,
		high: data.chartHigh,
		low: data.chartLow,
		advances: data.advances,
		declines: data.declines,
		unchanged: data.nochanges,
		totalVolume: data.allQty,
		totalValue: data.allValue,
	}
}

/**
 * Fetch daily OHLCV bars for any VN symbol — indices (VN100, VNINDEX) or individual stocks (FPT).
 * Endpoint: /statistics/charts/history — same shape for both.
 *
 * `from` is UTC-midnight-aligned; SSI daily bars are stamped at 00:00 UTC of the trading day.
 */
export async function fetchChart(symbol: string = DEFAULT_INDEX_SYMBOL, days = 365): Promise<OhlcChartData> {
	const to = Math.floor(Date.now() / 1000)
	const todayMidnight = to - (to % 86400)
	const from = todayMidnight - days * 86400
	const url = `${IBOARD_API}/statistics/charts/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`
	const res = await withTimeout(url)
	const udf = await unwrap<UdfBars>(res, 'SSI iBoard charts/history')

	if (udf.s !== 'ok' || !udf.t?.length) {
		return { changeRate: 0, candles: [] }
	}

	const candles: OHLCCandle[] = udf.t.map((t, i) => ({
		time: toUTCDate(t * 1000),
		open: udf.o[i],
		high: udf.h[i],
		low: udf.l[i],
		close: udf.c[i],
	}))

	const changeRate = candles.length >= 2 ? pctChange(candles[0].open, candles.at(-1)!.close) : 0

	return { changeRate, candles }
}

/**
 * Fetch a spot quote for an **individual stock ticker** (FPT, VCB, HPG, etc.).
 * Merges two SSI endpoints in parallel:
 *   /stock/{SYMBOL}                      — static: company name, ref/ceiling/floor, listed shares
 *   /le-table/stock/{SYMBOL}?pageSize=1  — live:  latest matched price + priceChange + accumulated vol
 *
 * Two round-trips per quote — fine for watchlist sizes ≤20. For larger lists, prefer a single
 * batch call to /stock/group/VNALL and filter client-side (future optimization).
 *
 * TODO (watchlist UI): when `live.items` is empty, this function silently collapses three distinct
 * states into the same "0.00% unchanged at refPrice" payload:
 *   1. Halted stock (trading suspension by HOSE/HNX/UPCOM)
 *   2. IPO day before the first matched trade
 *   3. Non-existent / invalid symbol (SSI returns `{ items: [] }`, not an error envelope)
 * The watchlist UI must distinguish these before it ships. Add a `tradingStatus: string` field
 * sourced from `/stock/group/{exchange}` per-row `tradingStatus`, and surface "halted" / "no
 * trades yet" / "unknown symbol" in the UI instead of a misleading price.
 */
export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
	const [stat, live] = await Promise.all([
		withTimeout(`${IBOARD_QUERY}/stock/${symbol}`).then((r) => unwrap<StockStaticData>(r, 'SSI iBoard stock')),
		withTimeout(`${IBOARD_QUERY}/le-table/stock/${symbol}?pageSize=1`).then((r) =>
			unwrap<LeTableData>(r, 'SSI iBoard le-table'),
		),
	])
	const lastMatch = live.items?.[0]

	return {
		symbol: stat.stockSymbol,
		exchange: stat.exchange,
		companyNameVi: stat.companyNameVi,
		companyNameEn: stat.companyNameEn,
		time: lastMatch?.time ?? '',
		price: lastMatch?.price ?? stat.refPrice,
		refPrice: stat.refPrice,
		change: lastMatch?.priceChange ?? 0,
		pctChange: lastMatch?.priceChangePercent ?? 0,
		ceiling: stat.ceiling,
		floor: stat.floor,
		accumulatedVol: lastMatch?.accumulatedVol ?? 0,
		accumulatedVal: lastMatch?.accumulatedVal ?? 0,
		listedShare: stat.listedShare,
		parValue: stat.parValue,
	}
}

/**
 * Fetch SSI's full symbol master list — every HOSE/HNX/UPCOM listing plus derivatives, warrants,
 * and ETFs (~2000 entries). Source of truth for ticker autocomplete / picker UIs.
 *
 * The list changes slowly (weekly at most, mostly on IPOs/delistings); cache aggressively server-side.
 */
export async function fetchStockList(): Promise<StockInfo[]> {
	const res = await withTimeout(`${IBOARD_QUERY}/stock/stock-info`)
	const rows = await unwrap<StockInfoRaw[]>(res, 'SSI iBoard stock-info')
	return rows.map((r) => ({
		symbol: r.symbol,
		isin: r.isin,
		exchange: r.exchange,
		companyNameVi: r.clientName,
		companyNameEn: r.clientNameEn,
		fullName: r.fullName,
		type: r.type,
	}))
}

/** VN tickers ordered by trading liquidity + market-cap relevance. Position in the array IS the
 * rank — `POPULAR_VN_TICKERS[0]` is most-prominent, `[N-1]` is least. Used by `searchStocks` to
 * surface high-volume names above same-prefix peers (e.g. `FUEVFVND` ahead of alphabetically-
 * earlier `FUEABVND` when the user types `FUE`) and to drive "dumb browse" mode order — typing
 * `ETF` returns every ETF in this rank order, popular ones first.
 *
 * Curated by hand from market data (HOSE top market-cap × ADV, ETF AUM rankings, index follow
 * counts). Periodic review on the quarterly VN30/VN100 index review (March / September). Anything
 * not in this list falls through to alphabetical sort within its match bucket. */
export const POPULAR_VN_TICKERS: readonly string[] = [
	// Top indices — most followed, drive the rest of the market reference frame
	'VNINDEX',
	'VN30',
	'VN100',
	'VNDIAMOND',
	'HNXINDEX',
	'HNXUPCOMINDEX',
	'VNALL',
	'VNX50',
	'VNMID',
	'VNSML',
	'HNX30',
	'VNFINLEAD',
	// Top ETFs by AUM — Diamond + VN30 trackers dominate VN ETF flows
	'E1VFVN30',
	'FUEVFVND',
	'FUESSVFL',
	'FUEKIV30',
	'FUEMAVND',
	'FUEKIVND',
	'FUEIP100',
	'FUEDCMID',
	'FUEKIVFS',
	'FUEABVND',
	'FUEMAV30',
	'FUEBFVND',
	'FUEFCV50',
	// Banks — VN-Index heavyweights
	'VCB',
	'BID',
	'CTG',
	'VPB',
	'MBB',
	'TCB',
	'ACB',
	'STB',
	'HDB',
	'TPB',
	'VIB',
	'MSB',
	// Vingroup family
	'VIC',
	'VHM',
	'VRE',
	// Steel / industrial / energy / chemicals / utilities
	'HPG',
	'HSG',
	'NKG',
	'GAS',
	'PLX',
	'PVS',
	'BSR',
	'GVR',
	'DGC',
	'DCM',
	'DPM',
	'POW',
	'REE',
	// Tech / consumer / aviation / pharma
	'FPT',
	'CMG',
	'MWG',
	'MSN',
	'VNM',
	'SAB',
	'VJC',
	'HVN',
	'PNJ',
	'DHG',
	// Brokers
	'SSI',
	'VND',
	'HCM',
	'VCI',
	// Real estate / industrial parks
	'NVL',
	'KDH',
	'DXG',
	'KBC',
	'BCM',
	'IDC',
	'SZC',
] as const

const POPULAR_RANK: Map<string, number> = new Map(POPULAR_VN_TICKERS.map((s, i) => [s, i]))

/** "Dumb browse" keyword → SSI kind-letter. When the picker query matches one of these (case-
 * insensitive, post-trim, EXACT — not as a substring), search short-circuits the regular
 * prefix/substring buckets and returns every entry of that kind sorted by popularity. Lets users
 * find long, hard-to-remember ETF symbols (`FUEVFVND`, `FUESSVFL`, …) by typing the category
 * name when they don't recall the ticker.
 *
 * Keyword set is intentionally small + unambiguous — single-word category names with their
 * common plurals. No SSI symbol literally equals any of these words, so the override is safe
 * (a future symbol named `ETF` would hide the browse keyword, but that's an unlikely listing). */
const BROWSE_KEYWORDS: Record<string, string> = {
	ETF: 'e',
	ETFS: 'e',
	INDEX: 'i',
	INDICES: 'i',
	INDEXES: 'i',
	STOCK: 's',
	STOCKS: 's',
	BOND: 'b',
	BONDS: 'b',
	WARRANT: 'w',
	WARRANTS: 'w',
	FUTURE: 'f',
	FUTURES: 'f',
}

/** Sort comparator: `POPULAR_VN_TICKERS` rank ascending (lower index wins), then alphabetical
 * by symbol as a stable tiebreaker for non-popular entries. */
function comparePopularity(a: StockInfo, b: StockInfo): number {
	const aRank = POPULAR_RANK.get(a.symbol) ?? Infinity
	const bRank = POPULAR_RANK.get(b.symbol) ?? Infinity
	if (aRank !== bRank) return aRank - bRank
	return a.symbol.localeCompare(b.symbol)
}

/**
 * Rank-search helper for the stock picker. Two modes:
 *
 * 1. **Browse mode** — `query` matches a `BROWSE_KEYWORDS` entry (e.g. `"ETF"`, `"Indices"`):
 *    return every dictionary entry of that kind, popularity-ordered. Lets users explore long-
 *    tail tickers they don't remember by typing the category name.
 * 2. **Search mode** — anything else: prefix → substring → name buckets, each popularity-sorted
 *    internally so high-volume names surface above same-prefix peers (FUEVFVND ahead of
 *    FUEABVND, VN30 ahead of VN30F1M, etc.).
 *
 * Pure function — callable from server route or browser cache as long as the caller holds a
 * `StockInfo[]` in memory. */
export function searchStocks(query: string, list: StockInfo[], limit = 25): StockInfo[] {
	const q = query.trim().toUpperCase()
	// Empty/whitespace query — return nothing so the UI can prompt "Type a ticker…" instead of
	// leaking SSI's arbitrary list ordering (warrants/bonds first, etc.).
	if (!q) return []

	// Browse mode: exact keyword match → every entry of that kind, popularity-ordered.
	const browseKind = BROWSE_KEYWORDS[q]
	if (browseKind) {
		return list
			.filter((r) => r.type === browseKind)
			.sort(comparePopularity)
			.slice(0, limit)
	}

	const symbolPrefix: StockInfo[] = []
	const symbolSubstring: StockInfo[] = []
	const nameSubstring: StockInfo[] = []

	for (const row of list) {
		const sym = row.symbol.toUpperCase()
		if (sym.startsWith(q)) {
			symbolPrefix.push(row)
			continue
		}
		if (sym.includes(q)) {
			symbolSubstring.push(row)
			continue
		}
		const haystack = `${row.companyNameVi} ${row.companyNameEn} ${row.fullName}`.toUpperCase()
		if (haystack.includes(q)) nameSubstring.push(row)
	}

	// Sort each bucket by popularity-then-alpha so high-volume names lead within their match tier.
	symbolPrefix.sort(comparePopularity)
	symbolSubstring.sort(comparePopularity)
	nameSubstring.sort(comparePopularity)

	return [...symbolPrefix, ...symbolSubstring, ...nameSubstring].slice(0, limit)
}
