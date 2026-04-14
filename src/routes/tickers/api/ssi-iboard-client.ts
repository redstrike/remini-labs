import type { OHLCCandle } from './phuquy-client'

const IBOARD_API = 'https://iboard-api.ssi.com.vn'
const IBOARD_QUERY = 'https://iboard-query.ssi.com.vn'

// iBoard is Cloudflare-fronted; a browser-shaped UA avoids occasional 403s.
// Origin header matches real iBoard frontend traffic.
const HEADERS = {
	'User-Agent': 'Mozilla/5.0 (compatible; ReminiLabs/1.0)',
	Origin: 'https://iboard.ssi.com.vn',
	Accept: '*/*',
}

const FETCH_TIMEOUT_MS = 5000

/** Pinned default — VN100 is today's opinionated "VN market glance" index. */
export const DEFAULT_INDEX_SYMBOL = 'VN100'

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

/** Individual stock quote — merges static company data + latest matched trade. */
export interface StockQuote {
	symbol: string // 'FPT'
	exchange: string // 'hose' | 'hnx' | 'upcom'
	companyNameVi: string
	companyNameEn: string
	time: string // 'HH:MM:SS' — timestamp of last matched trade
	price: number // latest matched price
	refPrice: number // prior close / reference
	change: number // priceChange
	pctChange: number // priceChangePercent
	ceiling: number // upper trading band for today
	floor: number // lower trading band for today
	accumulatedVol: number // today's cumulative matched volume
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

function withTimeout(url: string, init?: RequestInit): Promise<Response> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

	return globalThis
		.fetch(url, {
			...init,
			signal: controller.signal,
			headers: { ...HEADERS, ...init?.headers },
		})
		.finally(() => clearTimeout(timeout))
}

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
		time: new Date(t * 1000).toISOString().split('T')[0],
		open: udf.o[i],
		high: udf.h[i],
		low: udf.l[i],
		close: udf.c[i],
	}))

	let changeRate = 0
	if (candles.length >= 2) {
		const first = candles[0].open
		const last = candles[candles.length - 1].close
		changeRate = first ? ((last - first) / first) * 100 : 0
	}

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

/**
 * Rank-search helper for the stock picker. Prefix match on symbol wins over substring name matches.
 * Pure function — callable from client code once it holds a StockInfo[] list in memory.
 */
export function searchStocks(query: string, list: StockInfo[], limit = 20): StockInfo[] {
	const q = query.trim().toUpperCase()
	// Empty/whitespace query — return nothing so the UI can prompt "Type a ticker…" instead of
	// leaking SSI's arbitrary list ordering (warrants/bonds first, etc.).
	if (!q) return []

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

	return [...symbolPrefix, ...symbolSubstring, ...nameSubstring].slice(0, limit)
}
