// Binance mirrors — api-gcp is primary (reliably reachable from CF Workers); api (AWS)
// is the documented fallback. Either can flip to IP-pool-blocked without notice, so we
// try the active one, retry the other on block signals, and stick on whichever succeeded.
const BASES = ['https://api-gcp.binance.com', 'https://api.binance.com']

// Sticky preferred-base index, per V8 isolate. Flips on fallback success; a new isolate
// starts at 0 and re-learns on first block. Cost of re-learn: one extra fetch per isolate
// per outage — negligible at our traffic, and it's the only layer we need since the Cache
// API debounce absorbs within-colo bursts anyway.
let activeIdx = 0

const HEADERS = {
	Accept: 'application/json',
}

const FETCH_TIMEOUT_MS = 5000

// --- Types ---

export type CryptoSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'

export interface CryptoTicker {
	symbol: CryptoSymbol
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

// 403/451 = CF egress block signature from Binance's edge. 429/5xx are Binance-side and
// shared by both mirrors, so we do NOT fall back on those.
function isBlockStatus(status: number): boolean {
	return status === 403 || status === 451
}

// AbortError = our timeout tripped; TypeError = Workers fetch surfaced a network failure.
// Either means this mirror is effectively unreachable right now — try the other.
function isNetworkBlock(err: unknown): boolean {
	return err instanceof Error && (err.name === 'AbortError' || err.name === 'TypeError')
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
			symbol: t.symbol as CryptoSymbol,
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

export async function fetchCryptoKlines(symbol: CryptoSymbol, limit = 365): Promise<CryptoChartData> {
	const res = await binanceFetch(`/klines?symbol=${symbol}&interval=1d&limit=${limit}`)
	if (!res.ok) throw new Error(`Binance API returned ${res.status}`)

	const data: BinanceKline[] = await res.json()

	const candles: CryptoKline[] = data.map((k) => ({
		time: new Date(k[0]).toISOString().split('T')[0],
		open: parseFloat(k[1]),
		high: parseFloat(k[2]),
		low: parseFloat(k[3]),
		close: parseFloat(k[4]),
		volume: parseFloat(k[5]),
	}))

	let changeRate = 0
	if (candles.length >= 2) {
		const first = candles[0].open
		const last = candles[candles.length - 1].close
		changeRate = first ? ((last - first) / first) * 100 : 0
	}

	return { changeRate, candles }
}
