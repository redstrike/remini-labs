import { browser } from '$app/environment'
import { createEventBus } from '$lib/event-bus'
import { useEventListener } from 'runed'

import {
	fetchCryptoTickers as fetchBinanceTickers,
	fetchCryptoKlines,
	type CryptoTicker,
	type CryptoSymbol,
} from './shared/binance-client'
import { formatTiered } from './shared/number-format'
import type { PriceTable, ChartData } from './shared/phuquy-client'
import type { IndexQuote, StockQuote } from './shared/ssi-iboard-client'
import { fetchVcbSnapshot, toVcbDateParam, vcbYesterday, type VcbSnapshot } from './shared/vcb-forex-client'
import { createWatchlist } from './use-watchlist.svelte'
import { STOCKS_POLL_MS, computeNextPollTime, msUntilNextPoll } from './vn-stock-schedule'

type FetchResult = { ok: true } | { ok: false; error: string }

type TickersEvents = {
	'metals:fetching': void
	'metals:fetched': FetchResult
	'crypto:fetching': void
	'crypto:fetched': FetchResult
	'stocks:fetching': void
	'stocks:fetched': FetchResult
	'forex:fetching': void
	'forex:fetched': FetchResult
	'chart:metals:fetching': void
	'chart:metals:fetched': FetchResult
	'chart:crypto:fetching': void
	'chart:crypto:fetched': FetchResult
	'chart:stocks:fetching': void
	'chart:stocks:fetched': FetchResult
}

// Polling intervals — how often to fetch fresh data
const METALS_POLL_MS = 15 * 60 * 1000 // 15 min — Phu Quy prices move slowly
const CRYPTO_POLL_MS = 5 * 60 * 1000 // 5 min — Binance prices move faster
const FOREX_POLL_MS = 60 * 60 * 1000 // 60 min — VCB publishes a daily snapshot at 23:00 ICT
// plus a handful of intraday updates (morning, mid-day, afternoon, end of business). No
// documented schedule; hourly polling matches the cadence without overwhelming VCB.
// STOCKS_POLL_MS — imported from vn-stock-schedule. Phase-aware schedule:
// 5 min during trading; drains until next 09:00 ICT / 21:00 EOD otherwise.

// Single VN stock symbol the app tracks — becomes state when watchlist lands.
const STOCK_SYMBOL = 'VN100'

// Freshness thresholds — dot turns amber/red when exceeded
const METALS_STALE_MS = METALS_POLL_MS // fresh within one poll cycle
const CRYPTO_STALE_MS = CRYPTO_POLL_MS
const FOREX_STALE_MS = FOREX_POLL_MS

// Visibility fetch — debounce when tab becomes visible again
const VISIBILITY_DEBOUNCE_MS = 10 * 1000 // 10s — matches server-side debounce TTL

// How often to update `now` — drives freshness dot state transitions
const NOW_TICK_MS = 6_000 // 6s, 10 updates/min

// Chart loading delay — prevent flash on fast fetches
const LOADING_DELAY_MS = 250 // 250ms — show loading only if fetch takes longer

type CryptoId = 'BTC' | 'ETH' | 'SOL'

const CRYPTO_SYMBOLS: Record<CryptoId, CryptoSymbol> = {
	BTC: 'BTCUSDT',
	ETH: 'ETHUSDT',
	SOL: 'SOLUSDT',
}

interface TickersData {
	metals: PriceTable | null
	crypto: CryptoTicker[] | null
	cryptoCachedAt: number // epoch ms from SSR's X-Cached-At; 0 when SSR errored
	vn100: IndexQuote | null
	// Streamed from +page.ts. Pending promise on first paint, resolves to the gold 1Y series
	// once the server's chart fetch settles (or null on failure → falls back to client fetch).
	goldChart: Promise<ChartData | null> | null
}

// Matches server's DEBOUNCE_TTL. An SSR response older than this means the server served
// a stale-fallback (both Binance mirrors were unreachable during SSR) — trigger an
// immediate refetch on mount to try again from the client's IP.
const SSR_FRESHNESS_MS = 60 * 1000

export function useTickers(initialData: TickersData) {
	const bus = createEventBus<TickersEvents>()
	const watchlist = createWatchlist()
	let priceTable = $state<PriceTable | null>(initialData.metals)
	let loading = $state(!initialData.metals)
	let error = $state<string | null>(null)
	let selectedSilverIdx = $state(0)

	// Pure data fetch — emits events, no UI state
	async function fetchMetals() {
		bus.emit('metals:fetching', undefined as void)
		try {
			const res = await fetch('/tickers/api/spots/metals')
			if (res.ok) {
				priceTable = await res.json()
				lastMetalsFetchedAt = Date.now()
				error = null
				bus.emit('metals:fetched', { ok: true })
				if (chartAsset === 'gold' || chartAsset === 'silver') autoRefreshChart()
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

	// Poll crypto every 5 min — client only. Initial data comes from SSR.
	// On mount: if SSR data is stale (older than server's debounce window) or missing
	// (SSR errored), trigger an immediate Binance fetch rather than wait for the poll.
	$effect(() => {
		if (!browser) return
		const ssrStale = !initialData.cryptoCachedAt || Date.now() - initialData.cryptoCachedAt > SSR_FRESHNESS_MS
		if (ssrStale) fetchCryptoTickers()
		const interval = setInterval(fetchCryptoTickers, CRYPTO_POLL_MS)
		return () => clearInterval(interval)
	})

	// Poll VN100 on the VN market schedule — client only. Self-rescheduling setTimeout
	// fires at each meaningful transition (5-min tick during trading, 21:00 EOD weekdays,
	// Mon 09:00 on weekends). Zero wasted wakes during closed windows.
	// `cancelled` flag closes the cleanup-during-await race: if the component unmounts
	// while `fetchStocks()` is in flight, the post-await `scheduleNext()` would otherwise
	// reassign `timer` to a fresh setTimeout that cleanup never sees.
	$effect(() => {
		if (!browser) return
		// Immediate fetch on mount so watchlist stock quotes populate without waiting for
		// the VN market schedule (which might be hours away during off-hours).
		if (watchlist.stocks.length > 0) fetchStocks()
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null
		function scheduleNext() {
			timer = setTimeout(async () => {
				if (cancelled) return
				await fetchStocks()
				if (!cancelled) scheduleNext()
			}, msUntilNextPoll())
		}
		scheduleNext()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	})

	// Forex (VCB) — +page.svelte kicks off the first fetch on mount. `forexPollActive` gates
	// the polling effect so the setInterval only starts once data has landed (prevents
	// polling while cold / on refetch-loop if the first fetch fails).
	// Yesterday's snapshot only changes at ICT midnight — cached indefinitely and only
	// refetched when the calendar day rolls over.
	let forexToday = $state<VcbSnapshot | null>(null)
	let forexYesterday = $state<VcbSnapshot | null>(null)
	let lastForexFetchedAt = $state(Date.now())
	let forexPollActive = $state(false)

	async function fetchForex() {
		bus.emit('forex:fetching', undefined as void)
		try {
			const todayDate = new Date()
			const yesterdayDate = vcbYesterday(todayDate)
			const yesterdayKey = toVcbDateParam(yesterdayDate)
			const needYesterday = !forexYesterday || forexYesterday.date !== yesterdayKey
			const [todaySnap, yesterdaySnap] = await Promise.all([
				fetchVcbSnapshot(todayDate),
				needYesterday ? fetchVcbSnapshot(yesterdayDate) : Promise.resolve(forexYesterday),
			])
			forexToday = todaySnap
			forexYesterday = yesterdaySnap
			lastForexFetchedAt = Date.now()
			if (!forexPollActive) forexPollActive = true
			bus.emit('forex:fetched', { ok: true })
		} catch (e) {
			console.error('Forex fetch error:', e)
			bus.emit('forex:fetched', { ok: false, error: (e as Error).message })
		}
	}

	// Poll forex only after first successful fetch — keeps cold tabs from hitting VCB.
	$effect(() => {
		if (!browser || !forexPollActive) return
		const interval = setInterval(fetchForex, FOREX_POLL_MS)
		return () => clearInterval(interval)
	})

	let now = $state(Date.now())

	// Fetch all data when tab becomes visible again (debounced). useEventListener
	// wraps its listener body in $effect internally — client-only by definition,
	// so no `if (!browser)` guard needed here. Auto-cleanup on component unmount.
	useEventListener(
		() => document,
		'visibilitychange',
		() => {
			if (document.visibilityState !== 'visible') return
			now = Date.now()
			if (now - lastMetalsFetchedAt >= VISIBILITY_DEBOUNCE_MS) fetchMetals()
			if (now - lastCryptoFetchedAt >= VISIBILITY_DEBOUNCE_MS) fetchCryptoTickers()
			// Stocks: refetch only once scheduled next-poll time has passed — skip closed days.
			const nextStocksPoll = computeNextPollTime(new Date(lastStocksFetchedAt)).getTime()
			if (now >= nextStocksPoll) fetchStocks()
			// Forex: only revive if user has opened the tab at least once this session.
			if (forexPollActive && now - lastForexFetchedAt >= VISIBILITY_DEBOUNCE_MS) fetchForex()
		},
	)

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
	const isKgUnit = (i: { unit?: string | null }) => !!i.unit?.toLowerCase().includes('kg')
	const silverItems = $derived(
		(priceTable?.silver ?? [])
			.filter((i) => i.productType !== 'BM1OZ' && !i.name.includes('miếng'))
			.sort((a, b) => (isKgUnit(a) ? 1 : 0) - (isKgUnit(b) ? 1 : 0)),
	)

	const selectedSilver = $derived(silverItems[selectedSilverIdx] ?? silverItems[0] ?? null)

	// Hoisted so the `.find()` doesn't run on every +page.svelte render / NOW_TICK tick.
	const silverKgItem = $derived(silverItems.find(isKgUnit) ?? null)
	const silverLuongItem = $derived(silverItems.find((i) => !isKgUnit(i)) ?? null)

	// 24h summary — unit-normalize each metal to the unit shown in its FIRST card row, so
	// L/H visually align with the price the user glances at first.
	//
	// Gold: Phu Quy's 1D chart uses SJC summary prices which come per-LUONG (not per-chi).
	// Gold card's first row is Chỉ (per-chi), so divide by 10.
	//
	// Silver: Phu Quy's chart points come per-CHI (raw). Silver card's first row is Lượng
	// (per-luong = per-chi × 10), so multiply.
	const goldDayStats = $derived(
		priceTable?.dayStats?.gold
			? {
					changePercent: priceTable.dayStats.gold.changePercent,
					low: priceTable.dayStats.gold.low / 10,
					high: priceTable.dayStats.gold.high / 10,
				}
			: null,
	)
	const silverDayStats = $derived(
		priceTable?.dayStats?.silver
			? {
					changePercent: priceTable.dayStats.silver.changePercent,
					low: priceTable.dayStats.silver.low * 10,
					high: priceTable.dayStats.silver.high * 10,
				}
			: null,
	)

	// VCB USD/VND mid used to approximate Avg (USD) on the gold/silver cards. Intentionally
	// VCB avg rather than street/chợ đen: VCB's mid is LOWER than the street mid in the
	// current regime, and a lower VND-per-USD rate gives a LARGER USD equivalent. Showing the
	// larger USD number is the conservative/pessimistic reference for a retail gold buyer
	// thinking "how much USD would this cost me" — biased toward overestimation rather than
	// the optimistic (cheaper) street-rate conversion.
	const usdVndAvg = $derived(priceTable?.usdVndAvg ?? null)

	// Crypto tickers — SSR-primed; client polls Binance directly every CRYPTO_POLL_MS.
	let cryptoTickers = $state<CryptoTicker[]>(initialData.crypto ?? [])

	function getCryptoTicker(id: CryptoId): CryptoTicker | null {
		return cryptoTickers.find((t) => t.symbol === CRYPTO_SYMBOLS[id]) ?? null
	}

	// Seeded from SSR's X-Cached-At so the freshness dot reflects actual data age.
	// Falls back to Date.now() when SSR errored (immediate refetch will correct it).
	let lastCryptoFetchedAt = $state(initialData.cryptoCachedAt || Date.now())

	async function fetchCryptoTickers() {
		bus.emit('crypto:fetching', undefined as void)
		try {
			// Merge fixed symbols with watchlist — dedup in case user added a fixed pair alias
			const allSymbols = [...new Set([...Object.values(CRYPTO_SYMBOLS), ...watchlist.crypto])]
			cryptoTickers = await fetchBinanceTickers(allSymbols)
			lastCryptoFetchedAt = Date.now()
			bus.emit('crypto:fetched', { ok: true })
			if (chartAsset in CRYPTO_SYMBOLS || watchlist.crypto.includes(chartAsset)) autoRefreshChart()
		} catch (e) {
			console.error('Crypto ticker fetch error:', e)
			bus.emit('crypto:fetched', { ok: false, error: (e as Error).message })
		}
	}

	function getCryptoTickerBySymbol(symbol: string): CryptoTicker | null {
		return cryptoTickers.find((t) => t.symbol === symbol) ?? null
	}

	// VN100 spot quote + watchlist stock quotes
	let vn100Quote = $state<IndexQuote | null>(initialData.vn100 ?? null)
	let stockQuotes = $state<Map<string, StockQuote>>(new Map())
	let lastStocksFetchedAt = $state(Date.now())

	function getStockQuote(symbol: string): StockQuote | null {
		return stockQuotes.get(symbol) ?? null
	}

	async function fetchStocks() {
		bus.emit('stocks:fetching', undefined as void)
		try {
			const res = await fetch(`/tickers/api/spots/stocks?symbol=${STOCK_SYMBOL}`)
			if (res.ok) {
				vn100Quote = await res.json()
			}

			// Watchlist stocks — parallel via the cached server route
			if (watchlist.stocks.length > 0) {
				const results = await Promise.allSettled(
					watchlist.stocks.map((s) =>
						fetch(`/tickers/api/stocks/quote?symbol=${s}`).then((r) => (r.ok ? r.json() : null)),
					),
				)
				const newMap = new Map<string, StockQuote>()
				results.forEach((result, i) => {
					if (result.status === 'fulfilled' && result.value) {
						newMap.set(watchlist.stocks[i], result.value)
					}
				})
				stockQuotes = newMap
			}

			lastStocksFetchedAt = Date.now()
			bus.emit('stocks:fetched', { ok: true })
			if (chartAsset === 'VN100' || watchlist.stocks.includes(chartAsset)) autoRefreshChart()
		} catch (e) {
			console.error('Stocks fetch error:', e)
			bus.emit('stocks:fetched', { ok: false, error: (e as Error).message })
		}
	}

	let lastMetalsFetchedAt = $state(Date.now())

	const metalsElapsed = $derived(now - lastMetalsFetchedAt)
	const cryptoElapsed = $derived(now - lastCryptoFetchedAt)
	const stocksElapsed = $derived(now - lastStocksFetchedAt)
	const forexElapsed = $derived(now - lastForexFetchedAt)

	$effect(() => {
		if (!browser) return
		const timer = setInterval(() => {
			now = Date.now()
		}, NOW_TICK_MS)
		return () => clearInterval(timer)
	})

	// Force refresh all data: clears chart cache, re-fetches prices + current chart
	let refreshing = $state(false)

	async function forceRefreshAll() {
		refreshing = true
		error = null
		chartCache.clear()
		try {
			// Forex only included once first-fetched (lazy tab) — avoid hitting VCB for users who never open it.
			const jobs: Promise<unknown>[] = [fetchMetals(), fetchCryptoTickers(), fetchStocks()]
			if (forexPollActive) jobs.push(fetchForex())
			await Promise.all(jobs)
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
	// Widened to string to accept watchlist symbols (e.g. 'ADAUSDT', 'FPT') alongside fixed assets.
	type ChartAsset = string
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

	function chartCacheTtl(asset: ChartAsset, fetchedAt: number = Date.now()): number {
		if (asset === 'VN100' || watchlist.stocks.includes(asset)) {
			return computeNextPollTime(new Date(fetchedAt)).getTime() - fetchedAt
		}
		if (asset in CRYPTO_SYMBOLS || watchlist.crypto.includes(asset)) return CRYPTO_STALE_MS
		return METALS_STALE_MS
	}

	const chartElapsed = $derived(now - (chartCache.get(chartAsset)?.fetchedAt ?? now))
	const chartTtl = $derived(chartCacheTtl(chartAsset))

	function getCached(asset: ChartAsset): ChartData | null {
		const entry = chartCache.get(asset)
		if (!entry) return null
		if (Date.now() - entry.fetchedAt > chartCacheTtl(asset, entry.fetchedAt)) {
			chartCache.delete(asset)
			return null
		}
		return entry.data
	}

	function setCache(asset: ChartAsset, data: ChartData) {
		now = Date.now()
		chartCache.set(asset, { data, fetchedAt: now })
	}

	// Load default chart on mount — client only.
	// Streamed `goldChart` is the gold 1Y series — the longest window we ever request, so it
	// covers every duration slice (7D/15D/30D/90D/180D/1M/1Y) via sliceToWindow. Seed the
	// cache unconditionally; the data is good for any later return-to-gold click. Drive the
	// chart UI as long as the user is still on gold — respect whichever duration they're
	// currently on, since the same payload satisfies all of them.
	$effect(() => {
		if (!browser) return
		if (priceTable && !chartData) {
			Promise.resolve(initialData.goldChart).then((data) => {
				if (data) setCache('gold', data)
				if (chartAsset !== 'gold') return
				fetchChart('gold', chartDuration)
			})
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
		const isStockChart = asset === 'VN100' || watchlist.stocks.includes(asset)
		const isCryptoChart = asset in CRYPTO_SYMBOLS || watchlist.crypto.includes(asset)
		const chartSource = isStockChart ? 'stocks' : isCryptoChart ? 'crypto' : 'metals'
		bus.emit(`chart:${chartSource}:fetching` as const, undefined as void)
		try {
			let data: ChartData

			if (isStockChart) {
				const res = await fetch(`/tickers/api/charts/stocks?symbol=${asset}`)
				if (!res.ok) throw new Error(`API returned ${res.status}`)
				const raw = await res.json()
				data = { changeRate: raw.changeRate, points: [], candles: raw.candles }
			} else if (isCryptoChart) {
				const symbol = asset in CRYPTO_SYMBOLS ? CRYPTO_SYMBOLS[asset as CryptoId] : asset
				const raw = await fetchCryptoKlines(symbol)
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
			bus.emit(`chart:${chartSource}:fetched` as const, { ok: true })
		} catch (e) {
			if (chartAsset !== asset) return
			if (!chartData) chartError = 'Unable to load chart data'
			console.error('Chart fetch error:', e)
			bus.emit(`chart:${chartSource}:fetched` as const, { ok: false, error: (e as Error).message })
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

	// Auto-refresh chart when spot poll fires for the matching data source
	function autoRefreshChart() {
		if (!chartData) return
		fetchChart(chartAsset, chartDuration, true)
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
		get silverKgItem() {
			return silverKgItem
		},
		get silverLuongItem() {
			return silverLuongItem
		},
		get goldDayStats() {
			return goldDayStats
		},
		get silverDayStats() {
			return silverDayStats
		},
		get usdVndAvg() {
			return usdVndAvg
		},
		getCryptoTicker,
		getCryptoTickerBySymbol,
		get vn100Quote() {
			return vn100Quote
		},
		getStockQuote,
		get isCryptoAsset() {
			return chartAsset in CRYPTO_SYMBOLS || watchlist.crypto.includes(chartAsset)
		},
		get isStockAsset() {
			return chartAsset === 'VN100' || watchlist.stocks.includes(chartAsset)
		},
		get metalsElapsed() {
			return metalsElapsed
		},
		get cryptoElapsed() {
			return cryptoElapsed
		},
		get stocksElapsed() {
			return stocksElapsed
		},
		get forexElapsed() {
			return forexElapsed
		},
		get forexToday() {
			return forexToday
		},
		get forexYesterday() {
			return forexYesterday
		},
		metalsTtl: METALS_STALE_MS,
		cryptoTtl: CRYPTO_STALE_MS,
		forexTtl: FOREX_STALE_MS,
		get stocksTtl() {
			// FreshnessDot ratio = elapsed / ttl. During trading ttl ≈ 5 min;
			// during closed hours ttl stretches to the next scheduled fetch so
			// the dot stays green until new data arrives.
			return Math.max(
				STOCKS_POLL_MS,
				computeNextPollTime(new Date(lastStocksFetchedAt)).getTime() - lastStocksFetchedAt,
			)
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
		get chartElapsed() {
			return chartElapsed
		},
		get chartTtl() {
			return chartTtl
		},
		get refreshing() {
			return refreshing
		},
		bus,
		watchlist,
		forceRefreshAll,
		refreshMetals: fetchMetals,
		refreshCrypto: fetchCryptoTickers,
		refreshStocks: fetchStocks,
		refreshForex: fetchForex,
		selectSilver,
		fetchChart,
		refreshChart: () => fetchChart(chartAsset, chartDuration, true),
	}
}

const vndFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export function formatVND(value: number): string {
	return vndFmt.format(value)
}

// Gold card uses kVND (1 k = 1,000 VND) to keep the 6-column grid readable at phone widths —
// "16.875" fits where "16.875.000" crowds the adjacent USD column. Integer-rounded because gold
// per-chi prices are already at the 10M+ scale; sub-thousand precision is below display noise.
// Silver card stays on raw VND (its per-luong values fit without the compaction).
export function formatKVND(value: number): string {
	return vndFmt.format(Math.round(value / 1000))
}

const pctSignedFmt = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	signDisplay: 'always',
})

// Sign-prefixed percent. Returns "—" when the value rounds to 0.00% — for metal 24h, a flat
// zero is almost always the "current tick = prior close, no movement yet" state (pre-open,
// or immediately after a matching trade). Showing "—" is more honest than a confident 0.00%.
// Differs from VCB's formatDelta on purpose: forex rolls over daily at 23:00 with crisp
// snapshots, so genuine flat days happen and 0.00% there is real. Metals trade intraday and
// 0.00% there overwhelmingly means "no reference comparison yet".
export function formatPctSigned(value: number): string {
	if (Math.abs(value) < 0.005) return '—'
	return pctSignedFmt.format(value) + '%'
}

// USDT (stablecoin-pegged USD) formatters — tiered decimals via the shared convention
// so a $78,719 price reads cleanly while a $0.42 value keeps two decimals. Compact/Axis
// variants collapse to K/M suffixes for chart axes where full-precision labels crowd.
export function formatUSDT(value: number): string {
	return '$' + formatTiered(value)
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
	return formatTiered(value)
}

export const USDT_FORMATTER = {
	format: formatUSDT,
	formatCompact: formatUSDTCompact,
	formatAxis: formatUSDTAxis,
}

const vn100Fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatVN100(value: number): string {
	return vn100Fmt.format(value)
}

export const STOCK_FORMATTER = {
	format: formatVN100,
	formatCompact: formatVN100,
	formatAxis: formatVN100,
}

// Adaptive precision for any crypto pair. Stablecoin quotes (USDT/USDC/…) route through
// `formatUSDT` for the $ prefix; everything else renders raw via the shared tiered helper.
// Same ladder — the ladder's 0.0001 / 8dp floor covers satoshi-scale micro-priced tokens.
const STABLECOIN_QUOTES = new Set(['USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI'])

export function formatCryptoPrice(value: number, quote: string): string {
	if (STABLECOIN_QUOTES.has(quote)) return formatUSDT(value)
	if (value === 0) return '0'
	return formatTiered(value)
}

export function formatStockPrice(value: number): string {
	return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)
}
