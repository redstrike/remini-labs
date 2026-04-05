import { browser } from '$app/environment'
import { createEventBus } from '$lib/event-bus'

import type { CryptoTicker, CryptoSymbol } from './api/binance-client'
import type { PriceTable, ChartData } from './api/phuquy-client'

type FetchResult = { ok: true } | { ok: false; error: string }

type TickersEvents = {
	'metals:fetching': void
	'metals:fetched': FetchResult
	'crypto:fetching': void
	'crypto:fetched': FetchResult
}

// Polling intervals — how often to fetch fresh data
const METALS_POLL_MS = 15 * 60 * 1000 // 15 min — Phu Quy prices move slowly
const CRYPTO_POLL_MS = 5 * 60 * 1000 // 5 min — Binance prices move faster

// Freshness thresholds — dot turns amber/red when exceeded
const METALS_STALE_MS = METALS_POLL_MS // fresh within one poll cycle
const CRYPTO_STALE_MS = CRYPTO_POLL_MS

// Visibility fetch — debounce when tab becomes visible again
const VISIBILITY_DEBOUNCE_MS = 10 * 1000 // 10s — matches server-side debounce TTL

// Tick interval — how often to re-evaluate freshness state
const FRESHNESS_TICK_MS = 60 * 1000 // 1 min — sufficient for 5-15 min stale thresholds

// Chart loading delay — prevent flash on fast fetches
const LOADING_DELAY_MS = 250 // 250ms — show loading only if fetch takes longer

type CryptoId = 'BTC' | 'ETH' | 'SOL'

const CRYPTO_SYMBOLS: Record<CryptoId, CryptoSymbol> = {
	BTC: 'BTCUSDT',
	ETH: 'ETHUSDT',
	SOL: 'SOLUSDT',
}

interface TickersData {
	table: PriceTable | null
	crypto: CryptoTicker[] | null
}

export function useTickers(initialData: TickersData) {
	const bus = createEventBus<TickersEvents>()
	let priceTable = $state<PriceTable | null>(initialData.table)
	let loading = $state(!initialData.table)
	let error = $state<string | null>(null)
	let selectedSilverIdx = $state(0)

	// Pure data fetch — emits events, no UI state
	async function fetchMetals() {
		bus.emit('metals:fetching', undefined as void)
		try {
			const res = await fetch('/tickers/api/spots/metals')
			if (res.ok) {
				priceTable = await res.json()
				lastFetchedAt = Date.now()
				error = null
				bus.emit('metals:fetched', { ok: true })
			} else {
				bus.emit('metals:fetched', { ok: false, error: `API returned ${res.status}` })
			}
		} catch (e) {
			console.error('Tickers poll error:', e)
			if (!priceTable) error = 'Unable to fetch prices'
			bus.emit('metals:fetched', { ok: false, error: (e as Error).message })
		}
	}

	// Poll metals every 15 min — client only
	$effect(() => {
		if (!browser) return
		const interval = setInterval(fetchMetals, METALS_POLL_MS)
		return () => clearInterval(interval)
	})

	// Poll crypto every 5 min — client only
	$effect(() => {
		if (!browser) return
		const interval = setInterval(fetchCryptoTickers, CRYPTO_POLL_MS)
		return () => clearInterval(interval)
	})

	// Fetch all data when tab becomes visible again (debounced)
	$effect(() => {
		if (!browser) return
		function onVisible() {
			if (document.visibilityState !== 'visible') return
			const now = Date.now()
			if (now - lastFetchedAt >= VISIBILITY_DEBOUNCE_MS) fetchMetals()
			if (now - lastCryptoFetchedAt >= VISIBILITY_DEBOUNCE_MS) fetchCryptoTickers()
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => document.removeEventListener('visibilitychange', onVisible)
	})

	// Gold: SJC from table API (prices are per chỉ, × 10 for per lượng)
	const sjcTable = $derived(priceTable?.gold.find((i) => i.productType === 'SJC') ?? null)
	const goldItem = $derived(
		sjcTable
			? {
					buyChi: sjcTable.buyPrice,
					sellChi: sjcTable.sellPrice,
					buyLuong: sjcTable.buyPrice * 10,
					sellLuong: sjcTable.sellPrice * 10,
					buyDirection: sjcTable.buyDirection,
					sellDirection: sjcTable.sellDirection,
					updatedAt: sjcTable.updatedAt,
				}
			: null,
	)

	// Silver: PQ 999 bar only (no my nghe), small unit first (lượng → kg)
	const silverItems = $derived(
		(priceTable?.silver ?? [])
			.filter((i) => i.productType !== 'BM1OZ' && !i.name.includes('miếng'))
			.sort((a, b) => {
				// luong first (small), kg second (big)
				const aIsKg = a.unit?.toLowerCase().includes('kg') ? 1 : 0
				const bIsKg = b.unit?.toLowerCase().includes('kg') ? 1 : 0
				return aIsKg - bIsKg
			}),
	)

	const selectedSilver = $derived(silverItems[selectedSilverIdx] ?? silverItems[0] ?? null)

	// Crypto tickers
	let cryptoTickers = $state<CryptoTicker[]>(initialData.crypto ?? [])

	function getCryptoTicker(id: CryptoId): CryptoTicker | null {
		return cryptoTickers.find((t) => t.symbol === CRYPTO_SYMBOLS[id]) ?? null
	}

	let lastCryptoFetchedAt = $state(Date.now())

	async function fetchCryptoTickers() {
		bus.emit('crypto:fetching', undefined as void)
		try {
			const res = await fetch('/tickers/api/spots/crypto')
			if (res.ok) {
				cryptoTickers = await res.json()
				lastCryptoFetchedAt = Date.now()
				bus.emit('crypto:fetched', { ok: true })
			} else {
				bus.emit('crypto:fetched', { ok: false, error: `API returned ${res.status}` })
			}
		} catch (e) {
			console.error('Crypto ticker fetch error:', e)
			bus.emit('crypto:fetched', { ok: false, error: (e as Error).message })
		}
	}

	let lastFetchedAt = $state(Date.now())
	let now = $state(Date.now())

	const metalsElapsed = $derived(now - lastFetchedAt)
	const cryptoElapsed = $derived(now - lastCryptoFetchedAt)

	$effect(() => {
		if (!browser) return
		const timer = setInterval(() => {
			now = Date.now()
		}, FRESHNESS_TICK_MS)
		return () => clearInterval(timer)
	})

	// Force refresh all data: clears chart cache, re-fetches prices + current chart
	let refreshing = $state(false)

	async function forceRefreshAll() {
		refreshing = true
		error = null
		chartCache.clear()
		try {
			await Promise.all([fetchMetals(), fetchCryptoTickers()])
		} finally {
			refreshing = false
		}
		if (chartData) {
			fetchChart(chartAsset, chartDuration, true)
		}
	}

	function selectSilver(idx: number) {
		selectedSilverIdx = idx
	}

	// Chart helpers (pure functions, no state deps — must be above state init)
	type ChartAsset = 'gold' | 'silver' | CryptoId
	type ChartDuration = '7D' | '15D' | '1M' | '3M' | '6M' | '1Y'

	const DURATION_DAYS: Record<ChartDuration, number | null> = {
		'7D': 7,
		'15D': 15,
		'1M': 30,
		'3M': 90,
		'6M': 180,
		'1Y': null,
	}

	function filterToNDays(data: ChartData, days: number): ChartData {
		const cutoff = new Date()
		cutoff.setDate(cutoff.getDate() - days)

		// Candle-based path (crypto)
		if (data.candles?.length) {
			const cutoffStr = cutoff.toISOString().split('T')[0]
			const filtered = data.candles.filter((c) => c.time >= cutoffStr)
			let changeRate = data.changeRate
			if (filtered.length >= 2) {
				const first = filtered[0].open
				const last = filtered[filtered.length - 1].close
				changeRate = first ? ((last - first) / first) * 100 : 0
			}
			return { changeRate, points: [], candles: filtered }
		}

		// Points-based path (metals)
		const cutoffStr = cutoff.toISOString()
		const filtered = data.points.filter((p) => p.timestamp >= cutoffStr)
		let changeRate = data.changeRate
		if (filtered.length >= 2) {
			const first = filtered[0].sellPrice
			const last = filtered[filtered.length - 1].sellPrice
			changeRate = first ? ((last - first) / first) * 100 : 0
		}
		return { changeRate, points: filtered }
	}

	function sliceToWindow(data: ChartData, duration: ChartDuration): ChartData {
		const days = DURATION_DAYS[duration]
		return days !== null ? filterToNDays(data, days) : data
	}

	// Chart state
	let chartAsset = $state<ChartAsset>('gold')
	let chartDuration = $state<ChartDuration>('1M')
	let chartData = $state<ChartData | null>(null)
	let chartLoading = $state(true)
	let chartError = $state<string | null>(null)

	// Always fetch 1Y per asset — all shorter durations are sliced client-side.
	// One cache entry per asset; switching timeframes is instant after first load.
	interface CacheEntry {
		data: ChartData
		fetchedAt: number
	}
	const chartCache = new Map<string, CacheEntry>()
	const CHART_CACHE_TTL = 30 * 60 * 1000 // 30 min — client-side chart data cache

	function getCached(asset: ChartAsset): ChartData | null {
		const entry = chartCache.get(asset)
		if (!entry) return null
		if (Date.now() - entry.fetchedAt > CHART_CACHE_TTL) {
			chartCache.delete(asset)
			return null
		}
		return entry.data
	}

	function setCache(asset: ChartAsset, data: ChartData) {
		chartCache.set(asset, { data, fetchedAt: Date.now() })
	}

	// Load default chart on mount — client only
	$effect(() => {
		if (!browser) return
		if (priceTable && !chartData) {
			fetchChart('gold', '1M')
		}
	})

	let loadingTimer: ReturnType<typeof setTimeout> | null = null

	async function fetchChart(asset: ChartAsset, duration: ChartDuration, bypassCache = false) {
		chartAsset = asset
		chartDuration = duration

		// Check cache — always keyed by asset only (1Y data)
		if (!bypassCache) {
			const cached = getCached(asset)
			if (cached) {
				if (loadingTimer) {
					clearTimeout(loadingTimer)
					loadingTimer = null
				}
				chartLoading = false
				chartData = sliceToWindow(cached, duration)
				return
			}
		}

		// Delay loading indicator — fast fetches (<250ms) show no loading state
		if (loadingTimer) clearTimeout(loadingTimer)
		loadingTimer = setTimeout(() => {
			chartLoading = true
		}, LOADING_DELAY_MS)
		chartError = null
		try {
			let data: ChartData

			if (asset in CRYPTO_SYMBOLS) {
				const symbol = CRYPTO_SYMBOLS[asset as CryptoId]
				const res = await fetch(`/tickers/api/charts/crypto?symbol=${symbol}`)
				if (!res.ok) throw new Error(`API returned ${res.status}`)
				const raw = await res.json()
				data = { changeRate: raw.changeRate, points: [], candles: raw.candles }
			} else {
				const categoryId = asset === 'gold' ? 1 : 2
				const type = asset === 'gold' ? 1 : 2
				const unit = asset === 'silver' ? 'kg' : 'chi'
				const res = await fetch(
					`/tickers/api/charts/metals?categoryId=${categoryId}&type=${type}&duration=1Y&unit=${unit}`,
				)
				if (!res.ok) throw new Error(`API returned ${res.status}`)
				data = await res.json()
			}

			// Always cache the result (useful even if user switched away)
			setCache(asset, data)
			// Only update the view if this asset is still the active one
			if (chartAsset !== asset) return
			chartData = sliceToWindow(data, duration)
		} catch (e) {
			if (chartAsset !== asset) return
			if (!chartData) chartError = 'Unable to load chart data'
			console.error('Chart fetch error:', e)
		} finally {
			if (chartAsset === asset) {
				if (loadingTimer) {
					clearTimeout(loadingTimer)
					loadingTimer = null
				}
				chartLoading = false
			}
		}
	}

	return {
		get priceTable() {
			return priceTable
		},
		get loading() {
			return loading
		},
		get error() {
			return error
		},
		get goldItem() {
			return goldItem
		},
		get silverItems() {
			return silverItems
		},
		get selectedSilver() {
			return selectedSilver
		},
		getCryptoTicker,
		get isCryptoAsset() {
			return chartAsset in CRYPTO_SYMBOLS
		},
		get metalsElapsed() {
			return metalsElapsed
		},
		get cryptoElapsed() {
			return cryptoElapsed
		},
		metalsTtl: METALS_STALE_MS,
		cryptoTtl: CRYPTO_STALE_MS,
		get chartAsset() {
			return chartAsset
		},
		get chartDuration() {
			return chartDuration
		},
		get chartData() {
			return chartData
		},
		get chartLoading() {
			return chartLoading
		},
		get chartError() {
			return chartError
		},
		get refreshing() {
			return refreshing
		},
		bus,
		forceRefreshAll,
		refreshMetals: fetchMetals,
		refreshCrypto: fetchCryptoTickers,
		selectSilver,
		fetchChart,
	}
}

const vndFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export function formatVND(value: number): string {
	return vndFmt.format(value)
}

export function formatSpread(buy: number, sell: number): string {
	return formatVND(sell - buy)
}

const usdFmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const usdFmt1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const usdFmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Tiered decimal precision: < 100 → 2dp, 100–999 → 1dp, >= 1000 → 0dp
function usdPrecision(value: number) {
	const abs = Math.abs(value)
	if (abs >= 1_000) return usdFmt0
	if (abs >= 100) return usdFmt1
	return usdFmt2
}

export function formatUSDT(value: number): string {
	return '$' + usdPrecision(value).format(value)
}

export function formatUSDTCompact(value: number): string {
	const abs = Math.abs(value)
	if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
	if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
	return formatUSDT(value)
}

export function formatUSDTAxis(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
	return usdPrecision(value).format(value)
}

export const USDT_FORMATTER = {
	format: formatUSDT,
	formatCompact: formatUSDTCompact,
	formatAxis: formatUSDTAxis,
}
