import { createFetchWithTimeout } from './fetch-with-timeout'
import { toUTCDate } from './ict-date'
import { pctChange } from './number-format'

// Binance mirrors — api-gcp is primary (reliably reachable from CF Workers); api (AWS)
// is the documented fallback. Either can flip to IP-pool-blocked without notice, so we
// try the active one, retry the other on block signals, and stick on whichever succeeded.
const BASES = ['https://api-gcp.binance.com', 'https://api.binance.com']

// Sticky preferred-base index, per V8 isolate. Flips on fallback success; a new isolate
// starts at 0 and re-learns on first block. Cost of re-learn: one extra fetch per isolate
// per outage — negligible at our traffic, and it's the only layer we need since the Cache
// API debounce absorbs within-colo bursts anyway.
let activeIdx = 0

// --- Types ---

// Widened from a narrow 3-member union to string — the watchlist can add any valid Binance pair.
// The picker validates symbols against exchangeInfo before they enter the watchlist.
export type CryptoSymbol = string

export interface CryptoTicker {
	symbol: string
	lastPrice: number
	priceChange: number
	priceChangePercent: number
	highPrice: number
	lowPrice: number
	volume: number
	quoteVolume: number
}

export interface CryptoKline {
	time: string // 'YYYY-MM-DD'
	open: number
	high: number
	low: number
	close: number
	volume: number
}

export interface CryptoChartData {
	changeRate: number
	candles: CryptoKline[]
}

// --- Upstream API response types ---

interface BinanceTicker {
	symbol: string
	lastPrice: string
	priceChange: string
	priceChangePercent: string
	highPrice: string
	lowPrice: string
	volume: string
	quoteVolume: string
}

// Binance kline: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string]

// --- Fetch helpers ---

const withTimeout = createFetchWithTimeout({
	timeoutMs: 5_000,
	headers: { Accept: 'application/json' },
})

// 403/451 = CF egress block signature from Binance's edge. 429/5xx are Binance-side and
// shared by both mirrors, so we do NOT fall back on those.
function isBlockStatus(status: number): boolean {
	return status === 403 || status === 451
}

// TimeoutError = AbortSignal.timeout tripped; AbortError = caller-aborted; TypeError = Workers
// fetch surfaced a network failure. Any of these means this mirror is effectively unreachable
// right now — try the other.
function isNetworkBlock(err: unknown): boolean {
	return (
		err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError' || err.name === 'TypeError')
	)
}

async function binanceFetch(path: string): Promise<Response> {
	let lastErr: unknown = null
	for (let attempt = 0; attempt < BASES.length; attempt++) {
		const idx = (activeIdx + attempt) % BASES.length
		try {
			const res = await withTimeout(`${BASES[idx]}/api/v3${path}`)
			if (isBlockStatus(res.status) && attempt < BASES.length - 1) continue
			if (attempt > 0) activeIdx = idx // fallback succeeded — stick on this mirror
			return res
		} catch (err) {
			lastErr = err
			if (isNetworkBlock(err) && attempt < BASES.length - 1) continue
			throw err
		}
	}
	throw lastErr ?? new Error('binanceFetch: all mirrors blocked')
}

// --- Public API ---

const ALL_SYMBOLS: CryptoSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']

export async function fetchCryptoTickers(symbols: CryptoSymbol[] = ALL_SYMBOLS): Promise<CryptoTicker[]> {
	const encoded = encodeURIComponent(JSON.stringify(symbols))
	const res = await binanceFetch(`/ticker/24hr?symbols=${encoded}`)
	if (!res.ok) throw new Error(`Binance API returned ${res.status}`)

	const data: BinanceTicker[] = await res.json()

	return data.map(
		(t): CryptoTicker => ({
			symbol: t.symbol,
			lastPrice: parseFloat(t.lastPrice),
			priceChange: parseFloat(t.priceChange),
			priceChangePercent: parseFloat(t.priceChangePercent),
			highPrice: parseFloat(t.highPrice),
			lowPrice: parseFloat(t.lowPrice),
			volume: parseFloat(t.volume),
			quoteVolume: parseFloat(t.quoteVolume),
		}),
	)
}

// === Symbol dictionary for autocomplete picker ===

/** Compact crypto dict: quote-asset → list of base-assets. ~30KB stringified, parses in <2ms. */
export type CryptoDict = Record<string, string[]>

/** A single match surfaced by `searchCryptoDict()`. */
export interface CryptoSymbolMatch {
	symbol: string // 'BTCUSDT' — always base + quote
	base: string // 'BTC'
	quote: string // 'USDT'
}

interface ExchangeInfoSymbol {
	symbol: string
	baseAsset: string
	quoteAsset: string
	status: string
}

/**
 * Fetch Binance's TRADING-status symbol universe and compact into a quote-grouped dict.
 * Refreshed weekly via Workers Cache; new listings happen slowly enough that 7-day staleness is fine.
 */
export async function fetchCryptoDict(): Promise<CryptoDict> {
	const res = await binanceFetch('/exchangeInfo')
	if (!res.ok) throw new Error(`Binance exchangeInfo returned ${res.status}`)

	const data: { symbols: ExchangeInfoSymbol[] } = await res.json()

	const dict: CryptoDict = {}
	for (const s of data.symbols) {
		if (s.status !== 'TRADING') continue
		;(dict[s.quoteAsset] ??= []).push(s.baseAsset)
	}
	return dict
}

/**
 * Rank-search the crypto dict. Six tiers from most to least specific:
 *   1. base exact      — q='ETH'    → ETH-anything pairs first
 *   2. symbol exact    — q='ETHBTC' → that single pair
 *   3. base prefix     — q='ETHB'   → ETHBNB, ETHBUSD, …
 *   4. symbol prefix   — q='ETHB'   → also catches ETHBTC, ETHBNB
 *   5. base substring  — q='USDT'-like base names (rare)
 *   6. symbol substring— q='USDT'   → BTCUSDT, ETHUSDT, …
 */
export function searchCryptoDict(query: string, dict: CryptoDict, limit = 10): CryptoSymbolMatch[] {
	const q = query.trim().toUpperCase()
	// Empty query → nothing, so the UI can show a "Type a ticker…" hint instead of a firehose.
	if (!q) return []

	const baseExact: CryptoSymbolMatch[] = []
	const symbolExact: CryptoSymbolMatch[] = []
	const basePrefix: CryptoSymbolMatch[] = []
	const symbolPrefix: CryptoSymbolMatch[] = []
	const baseSubstring: CryptoSymbolMatch[] = []
	const symbolSubstring: CryptoSymbolMatch[] = []

	for (const [quote, bases] of Object.entries(dict)) {
		for (const base of bases) {
			const symbol = base + quote
			const m: CryptoSymbolMatch = { symbol, base, quote }
			if (base === q) baseExact.push(m)
			else if (symbol === q) symbolExact.push(m)
			else if (base.startsWith(q)) basePrefix.push(m)
			else if (symbol.startsWith(q)) symbolPrefix.push(m)
			else if (base.includes(q)) baseSubstring.push(m)
			else if (symbol.includes(q)) symbolSubstring.push(m)
		}
	}

	return [...baseExact, ...symbolExact, ...basePrefix, ...symbolPrefix, ...baseSubstring, ...symbolSubstring].slice(
		0,
		limit,
	)
}

/**
 * Split a Binance pair symbol into (base, quote) using a known-quotes heuristic, sorted longest
 * first so 'BTCFDUSD' splits as BTC+FDUSD rather than BTCFD+USD. Falls back to null for symbols
 * with quote currencies we don't recognize — caller decides whether to display raw or hide.
 */
const KNOWN_QUOTES = [
	'FDUSD',
	'IDRT',
	'EURI',
	'USD1',
	'USDT',
	'USDC',
	'TUSD',
	'BUSD',
	'BIDR',
	'BVND',
	'BTC',
	'ETH',
	'BNB',
	'TRY',
	'EUR',
	'BRL',
	'PLN',
	'ARS',
	'JPY',
	'MXN',
	'IDR',
	'XRP',
	'NGN',
	'RUB',
	'UAH',
	'ZAR',
	'DAI',
	'PAX',
	'UST',
	'GBP',
	'AUD',
	'CZK',
	'RON',
] as const

export function splitCryptoSymbol(symbol: string): { base: string; quote: string } | null {
	const s = symbol.toUpperCase()
	for (const q of KNOWN_QUOTES) {
		if (s.endsWith(q) && s.length > q.length) {
			return { base: s.slice(0, -q.length), quote: q }
		}
	}
	return null
}

/**
 * Display formatter for a crypto pair. Mirrors Binance's pair display:
 *   - USDT pairs show just the base ("ETH" not "ETH/USDT") — USDT is the assumed default
 *   - Other pairs show "BASE/QUOTE" with quote rendered subdued by the consumer
 *   - Unknown quote → primary = raw symbol, suffix = ''
 */
export function formatCryptoDisplay(symbol: string): { primary: string; suffix: string } {
	const split = splitCryptoSymbol(symbol)
	if (!split) return { primary: symbol, suffix: '' }
	if (split.quote === 'USDT') return { primary: split.base, suffix: '' }
	return { primary: split.base, suffix: '/' + split.quote }
}

export async function fetchCryptoKlines(symbol: CryptoSymbol, limit = 365): Promise<CryptoChartData> {
	const res = await binanceFetch(`/klines?symbol=${symbol}&interval=1d&limit=${limit}`)
	if (!res.ok) throw new Error(`Binance API returned ${res.status}`)

	const data: BinanceKline[] = await res.json()

	const candles: CryptoKline[] = data.map((k) => ({
		time: toUTCDate(k[0]),
		open: parseFloat(k[1]),
		high: parseFloat(k[2]),
		low: parseFloat(k[3]),
		close: parseFloat(k[4]),
		volume: parseFloat(k[5]),
	}))

	const changeRate = candles.length >= 2 ? pctChange(candles[0].open, candles.at(-1)!.close) : 0

	return { changeRate, candles }
}
