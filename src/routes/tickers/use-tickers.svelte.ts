import { browser } from '$app/environment'
import type { PriceTable, PriceTableItem, PriceSummary, ChartData } from './api/phuquy-client'

const POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

interface TickersData {
	table: PriceTable | null
	summary: PriceSummary[] | null
}

export function useTickers(initialData: TickersData) {
	let priceTable = $state<PriceTable | null>(initialData.table)
	let priceSummary = $state<PriceSummary[] | null>(initialData.summary)
	let loading = $state(!initialData.table)
	let error = $state<string | null>(null)
	let selectedSilverIdx = $state(0)

	// Poll for fresh data (both table + summary) — client only
	$effect(() => {
		if (!browser) return
		const interval = setInterval(async () => {
			try {
				const [tableRes, summaryRes] = await Promise.all([
					fetch('/tickers/api/table'),
					fetch('/tickers/api/prices'),
				])
				if (tableRes.ok) {
					priceTable = await tableRes.json()
					lastFetchedAt = Date.now()
				}
				if (summaryRes.ok) {
					priceSummary = await summaryRes.json()
				}
				error = null
				fetchFailed = false
			} catch (e) {
				console.error('Tickers poll error:', e)
				fetchFailed = true
				if (!priceTable) error = 'Unable to fetch prices'
			}
		}, POLL_INTERVAL_MS)

		return () => clearInterval(interval)
	})

	// Gold: SJC from summary API (has native luong and chi prices)
	type GoldUnit = 'luong' | 'chi'
	let selectedGoldUnit = $state<GoldUnit>('luong')
	const sjcSummary = $derived(priceSummary?.find((i) => i.id === 'S') ?? null)
	const sjcTable = $derived(priceTable?.gold.find((i) => i.productType === 'SJC') ?? null)
	const goldItem = $derived(
		sjcSummary
			? {
					buyPrice: selectedGoldUnit === 'luong' ? sjcSummary.buyPerLuong : sjcSummary.buyPerChi,
					sellPrice: selectedGoldUnit === 'luong' ? sjcSummary.sellPerLuong : sjcSummary.sellPerChi,
					changePercent: sjcSummary.changePercent,
					buyDirection: sjcTable?.buyDirection ?? null,
					sellDirection: sjcTable?.sellDirection ?? null,
					updatedAt: sjcTable?.updatedAt ?? '',
					unit: selectedGoldUnit === 'luong' ? 'VND/lượng' : 'VND/chỉ',
				}
			: null,
	)

	function selectGoldUnit(unit: GoldUnit) {
		selectedGoldUnit = unit
	}

	// Silver: PQ 999 bar only (no my nghe), kg first then luong
	const silverItems = $derived(
		(priceTable?.silver ?? [])
			.filter((i) => i.productType !== 'BM1OZ' && !i.name.includes('miếng'))
			.sort((a, b) => {
				// kg unit first (big), luong second (small)
				const aIsKg = a.unit?.toLowerCase().includes('kg') ? 0 : 1
				const bIsKg = b.unit?.toLowerCase().includes('kg') ? 0 : 1
				return aIsKg - bIsKg
			}),
	)

	const selectedSilver = $derived(silverItems[selectedSilverIdx] ?? silverItems[0] ?? null)

	// Stale = fetch failed, showing cached data. Green = last fetch succeeded.
	let fetchFailed = $state(false)
	const isStale = $derived(() => fetchFailed && !!priceTable)

	const dateFmt = new Intl.DateTimeFormat('en-GB', {
		day: '2-digit', month: '2-digit', year: 'numeric',
		hour: '2-digit', minute: '2-digit', hour12: false,
		timeZone: 'Asia/Ho_Chi_Minh',
	})

	function fmtDateVN(date: Date): string {
		return dateFmt.format(date) + ' UTC+7'
	}

	let lastFetchedAt = $state(Date.now())
	let now = $state(Date.now())

	$effect(() => {
		if (!browser) return
		const timer = setInterval(() => { now = Date.now() }, 30_000)
		return () => clearInterval(timer)
	})

	const lastFetchedTimeFormatted = $derived(() => {
		const diffMs = now - lastFetchedAt
		const diffMins = Math.floor(diffMs / 60_000)
		if (diffMins < 1) return 'Just now'
		if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
		const diffHours = Math.floor(diffMins / 60)
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
		// Fallback to absolute timestamp after 24h
		const d = new Date(lastFetchedAt)
		return fmtDateVN(d)
	})

	const dataUpdatedAtFormatted = $derived(() => {
		if (!priceTable?.updatedAt) return ''
		const d = new Date(priceTable.updatedAt)
		return `Source: ${fmtDateVN(d)}`
	})

	// Force refresh all data: clears chart cache, re-fetches prices + current chart
	let refreshing = $state(false)

	async function forceRefreshAll() {
		refreshing = true
		error = null
		chartCache.clear()
		try {
			const [tableRes, summaryRes] = await Promise.all([
				fetch('/tickers/api/table'),
				fetch('/tickers/api/prices'),
			])
			if (tableRes.ok) {
				priceTable = await tableRes.json()
				lastFetchedAt = Date.now()
			}
			if (summaryRes.ok) priceSummary = await summaryRes.json()
			if (!tableRes.ok && !summaryRes.ok) throw new Error('Both APIs failed')
			fetchFailed = false
		} catch (e) {
			error = 'Unable to fetch prices'
			fetchFailed = true
			console.error('Tickers refresh error:', e)
		} finally {
			refreshing = false
		}
		// Also re-fetch current chart view
		if (chartData) {
			fetchChart(chartAsset, chartDuration, true)
		}
	}

	function selectSilver(idx: number) {
		selectedSilverIdx = idx
	}

	// Chart data with TTL cache for all durations
	type ChartAsset = 'gold' | 'silver'
	type ChartDuration = '7D' | '15D' | '1M' | '3M' | '6M' | '1Y'
	let chartAsset = $state<ChartAsset>('gold')
	let chartDuration = $state<ChartDuration>('1M')
	let chartData = $state<ChartData | null>(null)
	let chartLoading = $state(false)
	let chartError = $state<string | null>(null)

	// Always fetch 1Y per asset — all shorter durations are sliced client-side.
	// One cache entry per asset; switching timeframes is instant after first load.
	interface CacheEntry { data: ChartData; fetchedAt: number }
	const chartCache = new Map<string, CacheEntry>()
	const CHART_TTL = 30 * 60 * 1000 // 30 min

	function getCached(asset: ChartAsset): ChartData | null {
		const entry = chartCache.get(asset)
		if (!entry) return null
		if (Date.now() - entry.fetchedAt > CHART_TTL) {
			chartCache.delete(asset)
			return null
		}
		return entry.data
	}

	function setCache(asset: ChartAsset, data: ChartData) {
		chartCache.set(asset, { data, fetchedAt: Date.now() })
	}

	// Load default chart (gold 30D) on mount — client only
	$effect(() => {
		if (!browser) return
		if (priceTable && !chartData && !chartLoading) {
			fetchChart('gold', '1M')
		}
	})

	function filterToNDays(data: ChartData, days: number): ChartData {
		const cutoff = new Date()
		cutoff.setDate(cutoff.getDate() - days)
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

	const DURATION_DAYS: Record<ChartDuration, number | null> = {
		'7D': 7, '15D': 15, '1M': 30, '3M': 90, '6M': 180, '1Y': null,
	}

	function sliceToWindow(data: ChartData, duration: ChartDuration): ChartData {
		const days = DURATION_DAYS[duration]
		return days !== null ? filterToNDays(data, days) : data
	}

	async function fetchChart(asset: ChartAsset, duration: ChartDuration, bypassCache = false) {
		chartAsset = asset
		chartDuration = duration

		// Check cache — always keyed by asset only (1Y data)
		if (!bypassCache) {
			const cached = getCached(asset)
			if (cached) {
				chartData = sliceToWindow(cached, duration)
				return
			}
		}

		chartLoading = true
		chartError = null
		try {
			const categoryId = asset === 'gold' ? 1 : 2
			const type = asset === 'gold' ? 1 : 2
			const unit = asset === 'silver' ? 'kg' : 'chi'
			const res = await fetch(
				`/tickers/api/chart?categoryId=${categoryId}&type=${type}&duration=1Y&unit=${unit}`,
			)
			if (!res.ok) throw new Error(`API returned ${res.status}`)
			const data: ChartData = await res.json()

			setCache(asset, data)
			chartData = sliceToWindow(data, duration)
		} catch (e) {
			chartError = 'Unable to load chart data'
			console.error('Chart fetch error:', e)
		} finally {
			chartLoading = false
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
		get goldUnit() {
			return selectedGoldUnit
		},
		get silverItems() {
			return silverItems
		},
		get selectedSilver() {
			return selectedSilver
		},
		get isStale() {
			return isStale()
		},
		get lastFetchedTime() {
			return lastFetchedTimeFormatted()
		},
		get dataUpdatedAt() {
			return dataUpdatedAtFormatted()
		},
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
		forceRefreshAll,
		selectGoldUnit,
		selectSilver,
		fetchChart,
	}
}

export function formatVND(value: number): string {
	return new Intl.NumberFormat('vi-VN').format(value)
}

export function formatSpread(buy: number, sell: number): string {
	return formatVND(sell - buy)
}
