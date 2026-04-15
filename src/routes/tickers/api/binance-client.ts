// Binance's GCP mirror — other hosts are unreliable from our Cloudflare Workers runtime.
// Used for both browser and server calls so SSR and live-polled prices stay consistent.
const BASE_URL = 'https://api-gcp.binance.com/api/v3'

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

// --- Public API ---

export const ALL_SYMBOLS: CryptoSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']

export async function fetchCryptoTickers(symbols: CryptoSymbol[] = ALL_SYMBOLS): Promise<CryptoTicker[]> {
	const encoded = encodeURIComponent(JSON.stringify(symbols))
	const res = await withTimeout(`${BASE_URL}/ticker/24hr?symbols=${encoded}`)
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
	const res = await withTimeout(`${BASE_URL}/klines?symbol=${symbol}&interval=1d&limit=${limit}`)
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
