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

	// Stale = last fetch failed and we're showing cached data.
	// If a fresh fetch succeeded, data is as fresh as possible — always green.
	let fetchFailed = $state(false)
	const isStale = $derived(() => fetchFailed && !!priceTable)

	const updatedAtFormatted = $derived(() => {
		if (!priceTable?.updatedAt) return ''
		const date = new Date(priceTable.updatedAt)
		return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
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
			if (tableRes.ok) priceTable = await tableRes.json()
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
	type ChartDuration = '1M' | '3M' | '6M' | '1Y'
	let chartAsset = $state<ChartAsset>('gold')
	let chartDuration = $state<ChartDuration>('1M')
	let chartData = $state<ChartData | null>(null)
	let chartLoading = $state(false)
	let chartError = $state<string | null>(null)

	// TTL cache for all chart data. Gold/silver prices update a few times per hour,
	// and historical candles are immutable. 30 min TTL is plenty.
	interface CacheEntry { data: ChartData; fetchedAt: number }
	const chartCache = new Map<string, CacheEntry>()
	const CHART_TTL = 30 * 60 * 1000 // 30 min

	function cacheKey(asset: ChartAsset, apiDuration: string) {
		return `${asset}:${apiDuration}`
	}

	function getCached(asset: ChartAsset, apiDuration: string): ChartData | null {
		const entry = chartCache.get(cacheKey(asset, apiDuration))
		if (!entry) return null
		if (Date.now() - entry.fetchedAt > CHART_TTL) {
			chartCache.delete(cacheKey(asset, apiDuration))
			return null
		}
		return entry.data
	}

	function setCache(asset: ChartAsset, apiDuration: string, data: ChartData) {
		chartCache.set(cacheKey(asset, apiDuration), { data, fetchedAt: Date.now() })
	}

	// Load default chart (gold 30D) on mount — client only
	$effect(() => {
		if (!browser) return
		if (priceTable && !chartData && !chartLoading) {
			fetchChart('gold', '1M')
		}
	})

	function filterTo180Days(fullYear: ChartData): ChartData {
		const cutoff = new Date()
		cutoff.setDate(cutoff.getDate() - 180)
		const cutoffStr = cutoff.toISOString()
		const filtered = fullYear.points.filter((p) => p.timestamp >= cutoffStr)
		let changeRate = fullYear.changeRate
		if (filtered.length >= 2) {
			const first = filtered[0].sellPrice
			const last = filtered[filtered.length - 1].sellPrice
			changeRate = first ? ((last - first) / first) * 100 : 0
		}
		return { changeRate, points: filtered }
	}

	async function fetchChart(asset: ChartAsset, duration: ChartDuration, bypassCache = false) {
		chartAsset = asset
		chartDuration = duration

		// 180D uses 1Y data (Phu Quy's 6M endpoint is broken)
		const apiDuration = (duration === '6M') ? '1Y' : duration

		// Check cache (skip if force refresh)
		if (!bypassCache) {
			const cached = getCached(asset, apiDuration)
			if (cached) {
				chartData = duration === '6M' ? filterTo180Days(cached) : cached
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
				`/tickers/api/chart?categoryId=${categoryId}&type=${type}&duration=${apiDuration}&unit=${unit}`,
			)
			if (!res.ok) throw new Error(`API returned ${res.status}`)
			const data: ChartData = await res.json()

			setCache(asset, apiDuration, data)
			chartData = duration === '6M' ? filterTo180Days(data) : data
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
		get updatedAt() {
			return updatedAtFormatted()
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
