<script lang="ts">
	import {
		useTickers,
		formatVND,
		formatKVND,
		formatPctSigned,
		formatUSDT,
		formatVN100,
		formatCryptoPrice,
		formatStockPrice,
		USDT_FORMATTER,
		STOCK_FORMATTER,
	} from './use-tickers.svelte'
	import { Skeleton } from '$lib/components/shadcn-svelte/skeleton/index.js'
	import { LoadingOverlay } from '$lib/components/remini-labs/loading-overlay/index.js'
	import { DEFAULT_PROGRESS_ACCENT } from '$lib/components/remini-labs/progress-bar/index.js'
	import { FreshnessDot } from '$lib/components/remini-labs/freshness-dot/index.js'
	import { RefreshCw as SpinnerIcon, TriangleAlert, ChevronDown } from '@lucide/svelte'
	import { formatCryptoDisplay, splitCryptoSymbol } from './shared/binance-client'
	import {
		VCB_CURRENCY_ORDER,
		VCB_TIER_DIVIDER_INDICES,
		flagUrl,
		formatForexPrice,
		formatDelta,
		formatForeign,
		computeDelta24h,
		type VcbCurrencyCode,
	} from './shared/vcb-forex-client'
	import { metalIconUrl } from './shared/metal-icons'
	import PriceChart, { type CandleSize } from './price-chart.svelte'
	import TickerTabInput from './ticker-tab-input.svelte'
	import { page } from '$app/state'
	import { tick } from 'svelte'
	import { cubicOut } from 'svelte/easing'

	// Chrome-style new-tab expansion: the wrap span animates from 0 width to its measured width
	// (left to right). On exit, reverses for a graceful collapse. Built as a custom transition so
	// we can read the natural width at apply-time and animate to/from it.
	function expandX(node: HTMLElement, params: { duration?: number } = {}) {
		const targetWidth = node.getBoundingClientRect().width
		return {
			duration: params.duration ?? 180,
			easing: cubicOut,
			css: (t: number) => `width: ${t * targetWidth}px; min-width: 0; overflow: hidden;`,
		}
	}

	// Intentionally capture SSR data once — hook takes over with client-side polling.
	// `goldChart` is a streamed promise from +page.ts; pass it through verbatim so the hook
	// can await it and seed the chart cache.
	const initialMetals = page.data.metals ?? null
	const initialMetalsCachedAt = page.data.metalsCachedAt ?? 0
	const initialCrypto = page.data.crypto ?? null
	const initialCryptoCachedAt = page.data.cryptoCachedAt ?? 0
	const initialVN100 = page.data.vn100 ?? null
	const initialVN100CachedAt = page.data.vn100CachedAt ?? 0
	const initialGoldChart = page.data.goldChart ?? null
	const tickers = useTickers({
		metals: initialMetals,
		metalsCachedAt: initialMetalsCachedAt,
		crypto: initialCrypto,
		cryptoCachedAt: initialCryptoCachedAt,
		vn100: initialVN100,
		vn100CachedAt: initialVN100CachedAt,
		goldChart: initialGoldChart,
	})

	// Spinner duration tuned to avg API latency — one full rotation ≈ one fetch
	const METALS_SPIN_MS = 500 // Phu Quy avg ~400ms
	const CRYPTO_SPIN_MS = 200 // Binance avg ~120ms
	const STOCKS_SPIN_MS = 400 // VNDirect avg ~300ms
	const FOREX_SPIN_MS = 450 // VCB avg ~300–400ms

	const CRYPTO = [
		{ id: 'BTC' as const, name: 'Bitcoin', accent: '#e8993a' },
		{ id: 'ETH' as const, name: 'Ethereum', accent: '#5b80e8' },
		{ id: 'SOL' as const, name: 'Solana', accent: '#a566cf' },
	]

	const CHART_ACCENTS: Record<string, string> = {
		gold: '#d4a03a',
		silver: '#a0a8b8',
		BTC: '#e8993a',
		ETH: '#5b80e8',
		SOL: '#a566cf',
		VN100: '#b87333',
	}

	// Volume "compact" formatter (e.g. 168.5M, 12.3K) — module-scope so we don't construct a
	// fresh Intl.NumberFormat per VN-stock-quote render. Same memoization rationale as
	// `shared/number-format.ts`.
	const compactNumberFormat = new Intl.NumberFormat('en-US', { notation: 'compact' })

	const durations = [
		{ label: '7D', value: '7D' as const },
		{ label: '15D', value: '15D' as const },
		{ label: '30D', value: '1M' as const },
		{ label: '90D', value: '3M' as const },
		{ label: '180D', value: '6M' as const },
		{ label: '1Y', value: '1Y' as const },
	]

	const candleSizes: { label: string; value: CandleSize }[] = [
		{ label: '1D', value: '1D' },
		{ label: '3D', value: '3D' },
		{ label: '1W', value: '1W' },
	]
	let candleSize = $state<CandleSize>('1D')
	let metalTab = $state<'metals' | 'forex'>('metals')
	// Crypto card tabs: 'binance' is the canonical Spots view (consolidated grid). Placeholder
	// pseudo-IDs ('p:1', 'p:2') are blank tabs reserved for future content (per-exchange views,
	// custom panels, etc.). Stock card tabs: 'VN100' or watchlist symbols ('FPT'…) or placeholder
	// pseudo-IDs as their existing chrome-tab UX.
	let cryptoTab = $state<string>('binance')
	let stockTab = $state<string>('VN100')
	let cryptoPlaceholders = $state<number[]>([])
	let stockPlaceholders = $state<number[]>([])
	let nextPlaceholderId = 1
	// Permanent ticker-input row at the bottom of the Binance grid auto-clears via this key —
	// any successful pick or Escape bumps it to force-remount the TickerTabInput component
	// (whose internal `query` state doesn't reset on its own after `add` succeeds).
	let cryptoInputKey = $state(0)
	// Refs to the scrollable tab strips so adding a placeholder can scroll the new one into view.
	let cryptoTabsEl = $state<HTMLDivElement | null>(null)
	let stockTabsEl = $state<HTMLDivElement | null>(null)
	// Ref to the Binance scroll container — used to auto-scroll the freshly added watchlist row
	// into view (sticky input row can sit on top of the new entry on a long list otherwise).
	let cryptoSpotsScrollEl = $state<HTMLDivElement | null>(null)

	const FIXED_STOCK = new Set(['VN100'])
	// Pairs the fixed BTC/ETH/SOL rows already cover — block them from the picker so the watchlist
	// can never duplicate a fixed major (an "ETH" watchlist row alongside the fixed ETH row would
	// look broken).
	const RESERVED_CRYPTO = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])

	// Brand accent per popular base asset — applied to the active watchlist tab when the base
	// matches. Hues are slightly desaturated from the canonical brand to fit the OLED dark palette
	// (matches the existing BTC/ETH/SOL accents in CRYPTO above).
	const BRAND_COLORS: Record<string, string> = {
		BTC: '#e8993a',
		ETH: '#5b80e8',
		SOL: '#a566cf',
		USDT: '#4dab8c',
		USDC: '#4f8cc9',
		BNB: '#d4a829',
		XRP: '#5e9bc7',
		ADA: '#4877c7',
		DOGE: '#c4a644',
		AVAX: '#d8595a',
		TRX: '#c45050',
		LINK: '#5377c5',
		MATIC: '#8e6cc4',
		POL: '#8e6cc4',
		DOT: '#c4528d',
		LTC: '#8b9aa8',
		NEAR: '#4cbf86',
		ATOM: '#7479a8',
		TON: '#4d9bc7',
		ARB: '#4d8cc7',
		OP: '#d8595a',
		APT: '#3ec8b3',
		SUI: '#5badd9',
		INJ: '#3ec8d8',
		PEPE: '#5fb35a',
		SHIB: '#d8893a',
		HBAR: '#a8a8b0',
		FIL: '#4d9bc7',
	}

	function brandFor(symbol: string): string | undefined {
		const split = splitCryptoSymbol(symbol)
		return split ? BRAND_COLORS[split.base] : undefined
	}

	function addCryptoPlaceholder() {
		const id = nextPlaceholderId++
		cryptoPlaceholders = [...cryptoPlaceholders, id]
		cryptoTab = `p:${id}` // jump to the freshly-created blank tab
		tick().then(() => {
			if (cryptoTabsEl) cryptoTabsEl.scrollLeft = cryptoTabsEl.scrollWidth
		})
	}
	function addStockPlaceholder() {
		const id = nextPlaceholderId++
		stockPlaceholders = [...stockPlaceholders, id]
		stockTab = `p:${id}`
		tick().then(() => {
			if (stockTabsEl) stockTabsEl.scrollLeft = stockTabsEl.scrollWidth
		})
	}
	function discardCryptoPlaceholder(id: number) {
		cryptoPlaceholders = cryptoPlaceholders.filter((i) => i !== id)
		// If the discarded tab was active, fall back to the canonical Binance view.
		if (cryptoTab === `p:${id}`) cryptoTab = 'binance'
	}
	function discardStockPlaceholder(id: number) {
		stockPlaceholders = stockPlaceholders.filter((i) => i !== id)
		if (stockTab === `p:${id}`) stockTab = 'VN100'
	}
	function commitStockPick(placeholderId: number, symbol: string) {
		stockPlaceholders = stockPlaceholders.filter((i) => i !== placeholderId)
		stockTab = symbol
	}
	function removeCryptoSymbol(symbol: string) {
		tickers.watchlist.removeCrypto(symbol)
	}
	function removeStockSymbol(symbol: string) {
		tickers.watchlist.removeStock(symbol)
		if (stockTab === symbol) stockTab = 'VN100'
	}

	// Total open slots = filled watchlist tabs + transient placeholders. Used to gate the +
	// button so users can't open empty placeholders they couldn't fill anyway. Placeholders
	// being still-empty count against the cap too — ten new-tabs is enough to be drowning in.
	const cryptoSlotsUsed = $derived(tickers.watchlist.crypto.length + cryptoPlaceholders.length)
	const stockSlotsUsed = $derived(tickers.watchlist.stocks.length + stockPlaceholders.length)

	// Chart-tab list — fixed metals/crypto/VN100 anchors plus per-watchlist entries. Memoized via
	// $derived so re-renders unrelated to the watchlist don't rebuild the array (and the
	// `{#each}` keyed by id can stable-diff on identity).
	const chartTabs = $derived([
		{ id: 'gold' as string, label: 'Gold', accent: '#c9a84c' },
		{ id: 'silver', label: 'Silver', accent: '#8a94a8' },
		...CRYPTO.map((c) => ({ id: c.id, label: c.id, accent: c.accent })),
		...tickers.watchlist.crypto.map((s) => {
			const fmt = formatCryptoDisplay(s)
			return { id: s, label: fmt.primary + fmt.suffix, accent: brandFor(s) ?? '#6b8aad' }
		}),
		{ id: 'VN100', label: 'VN100', accent: '#b87333' },
		...tickers.watchlist.stocks.map((s) => ({ id: s, label: s, accent: '#b87333' })),
	])

	// Convert vertical wheel into horizontal scroll on the tab strips. Only intercepts when the
	// strip actually has overflow — otherwise the page scrolls normally. Skips horizontal-native
	// inputs (shift+wheel, trackpads with horizontal delta) so we don't double up.
	function horizontalWheel(e: WheelEvent) {
		if (e.deltaY === 0) return
		const el = e.currentTarget as HTMLElement
		if (el.scrollWidth <= el.clientWidth) return
		e.preventDefault()
		el.scrollLeft += e.deltaY
	}

	// UI reacts to fetch events — spinner state owned by the page, not the data layer
	let fetchingMetals = $state(false)
	let fetchingCrypto = $state(false)
	let fetchingStocks = $state(false)
	let fetchingForex = $state(false)
	let fetchingMetalsChart = $state(false)
	let fetchingCryptoChart = $state(false)
	let fetchingStocksChart = $state(false)
	const fetchingChart = $derived(
		tickers.isCryptoAsset ? fetchingCryptoChart : tickers.isStockAsset ? fetchingStocksChart : fetchingMetalsChart,
	)

	$effect(() => {
		const unsubs = [
			tickers.bus.on('metals:fetching', () => (fetchingMetals = true)),
			tickers.bus.on('metals:fetched', () => (fetchingMetals = false)),
			tickers.bus.on('crypto:fetching', () => (fetchingCrypto = true)),
			tickers.bus.on('crypto:fetched', () => (fetchingCrypto = false)),
			tickers.bus.on('stocks:fetching', () => (fetchingStocks = true)),
			tickers.bus.on('stocks:fetched', () => (fetchingStocks = false)),
			tickers.bus.on('forex:fetching', () => (fetchingForex = true)),
			tickers.bus.on('forex:fetched', () => (fetchingForex = false)),
			tickers.bus.on('chart:metals:fetching', () => (fetchingMetalsChart = true)),
			tickers.bus.on('chart:metals:fetched', () => (fetchingMetalsChart = false)),
			tickers.bus.on('chart:crypto:fetching', () => (fetchingCryptoChart = true)),
			tickers.bus.on('chart:crypto:fetched', () => (fetchingCryptoChart = false)),
			tickers.bus.on('chart:stocks:fetching', () => (fetchingStocksChart = true)),
			tickers.bus.on('chart:stocks:fetched', () => (fetchingStocksChart = false)),
		]
		return () => unsubs.forEach((fn) => fn())
	})

	// Eager-fetch VCB forex on mount so the Bullion expand-on-tap has foreign-currency
	// rates ready the moment the user taps a metal row. Guarded by a one-shot flag so a
	// failed fetch doesn't retrigger on every `fetchingForex` flip — after the first
	// success, the 10-min poll inside use-tickers takes over.
	let forexEagerFired = false
	$effect(() => {
		if (forexEagerFired || tickers.forexToday || fetchingForex) return
		forexEagerFired = true
		tickers.refreshForex()
	})

	// Bullion expand-on-tap — tapping a metal row reveals its Buy/Sell in every VCB
	// currency. Exclusive (one row at a time) so the card stays compact; tap the same
	// row again to collapse, tap a different row to switch. Keys include the unit since
	// the card now renders 4 rows (per-metal × per-unit: Lượng / Kg / Chỉ).
	type BullionKey = 'gold-luong' | 'silver-kg' | 'gold-chi' | 'silver-luong'
	let expandedBullion = $state<BullionKey | null>(null)
	function toggleBullionExpand(key: BullionKey) {
		expandedBullion = expandedBullion === key ? null : key
	}

	// Rows in VCB_CURRENCY_ORDER-order, enriched with today/yesterday rates + Δ%.
	// Null entries kept so the row layout stays stable while partial data streams in.
	//
	// Stale-snapshot detection: VCB publishes one snapshot per business day (~23:00 ICT) and
	// silently rolls unpublished future dates forward to the latest snapshot. During overnight /
	// pre-business hours, `?date=today` and `?date=yesterday` both return the same underlying
	// snapshot with identical `UpdatedDate`. Computing a delta against ourselves would yield a
	// misleading 0.00% across all rows — so when updatedAt matches, treat yesterday as unknown
	// and display "—" (null delta → formatDelta's 'unknown' sign).
	const forexRows = $derived.by(() => {
		const today = tickers.forexToday
		const yesterday = tickers.forexYesterday
		const snapshotsStale = !!today && !!yesterday && today.updatedAt === yesterday.updatedAt
		return VCB_CURRENCY_ORDER.map((code: VcbCurrencyCode) => {
			const t = today?.rates.get(code)
			const y = snapshotsStale ? undefined : yesterday?.rates.get(code)
			return {
				code,
				buy: t?.buy ?? null,
				sell: t?.sell ?? null,
				avg: t?.avg ?? null,
				delta: t ? computeDelta24h(t, y) : null,
			}
		})
	})
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600;700&display=swap" />
</svelte:head>

<div class="tickers">
	{#if tickers.error && !tickers.priceTable}
		<div class="tickers-error-card">
			<TriangleAlert size={20} />
			<p>{tickers.error}</p>
			<button class="tickers-retry" onclick={() => tickers.forceRefreshAll()}>Retry</button>
		</div>
	{:else if !tickers.priceTable}
		<div class="tickers-cards">
			<div class="tickers-card">
				<Skeleton class="mb-4 h-4 w-24" />
				<Skeleton class="mb-2 h-8 w-48" />
				<Skeleton class="h-8 w-48" />
			</div>
			<div class="tickers-card">
				<Skeleton class="mb-4 h-4 w-24" />
				<Skeleton class="mb-2 h-8 w-48" />
				<Skeleton class="h-8 w-48" />
			</div>
		</div>
	{:else}
		<!-- Price Cards: side-by-side on tablet+ -->
		<div class="tickers-cards">
			<!-- ─── Bullion Card — tabs [Bullion] [VCB Forex]. One row per metal (SJC gold
			     Lượng, PQ silver Kg). 5-col grid: asset(icon + label) · buy · sell · 24h ·
			     chevron. Tap a row to expand a scrollable sub-panel showing Buy/Sell in every
			     VCB currency — progressive disclosure for foreign visitors who want a quick
			     reference in their own currency. The sub-panel mirrors VCB Forex's thin
			     scrollbar + 14rem max-height pattern so the card can't tower over the rest
			     of the page. To add a third metal (platinum, palladium), drop in another row
			     snippet and render it here. ─── -->
			{#snippet bullionSubPanel(vndBuy: number, vndSell: number, panelId: string)}
				{@const vndAvg = (vndBuy + vndSell) / 2}
				<div class="tickers-bullion-sub-panel" id={panelId} role="region">
					{#if tickers.forexToday}
						{#each VCB_CURRENCY_ORDER as code (code)}
							{@const rate = tickers.forexToday.rates.get(code)}
							{#if rate?.avg}
								<div class="tickers-bullion-sub-row">
									<span class="tickers-bullion-sub-flag">
										<img src={flagUrl(code)} alt="" width="18" height="12" loading="lazy" />
									</span>
									<span class="tickers-bullion-sub-code">{code}</span>
									<span class="tickers-bullion-sub-value">
										{formatForeign(vndBuy, rate.avg)}
									</span>
									<span class="tickers-bullion-sub-value">
										{formatForeign(vndSell, rate.avg)}
									</span>
									<span class="tickers-bullion-sub-value tickers-bullion-sub-avg">
										{formatForeign(vndAvg, rate.avg)}
									</span>
									<span></span>
									<span></span>
								</div>
							{/if}
						{/each}
					{:else if fetchingForex}
						<div class="tickers-bullion-sub-empty">Loading foreign-currency rates…</div>
					{:else}
						<div class="tickers-bullion-sub-empty">Rates unavailable — tap VCB Forex to retry.</div>
					{/if}
				</div>
			{/snippet}

			<!-- Row sizes anchor on Gold Chỉ (0.875rem); Lượng scales by mass cube-root (≈2.154×);
			     Silver Kg is capped well below physical (true ≈6.44×) to fit the row grid. -->
			{#snippet bullionRow(row: {
				metal: 'gold' | 'silver'
				unit: 'lượng' | 'kg' | 'chỉ'
				iconSize: string
				buy: number
				sell: number
				stats: { changePercent: number } | null
				key: BullionKey
				title: string
			})}
				{@const up = row.stats ? row.stats.changePercent > 0 : false}
				{@const down = row.stats ? row.stats.changePercent < 0 : false}
				{@const pct = row.stats ? formatPctSigned(row.stats.changePercent) : '—'}
				{@const isExpanded = expandedBullion === row.key}
				{@const avg = (row.buy + row.sell) / 2}
				{@const metalLabel = row.metal === 'gold' ? 'Gold' : 'Silver'}
				{@const panelId = `bullion-sub-${row.key}`}
				<button
					type="button"
					class="tickers-metal-row"
					class:expanded={isExpanded}
					title={row.title}
					aria-expanded={isExpanded}
					aria-controls={panelId}
					onclick={() => toggleBullionExpand(row.key)}>
					<span class="tickers-metal-flag" style="--ingot-size: {row.iconSize}">
						<img src={metalIconUrl(row.metal)} alt="{row.metal === 'gold' ? 'SJC' : 'PQ'} {row.metal}" />
					</span>
					<span class="tickers-metal-label">
						{metalLabel}
						<span class="tickers-metal-unit">{row.unit}</span>
					</span>
					<span class="tickers-metal-value">{formatKVND(row.buy)}</span>
					<span class="tickers-metal-value">{formatKVND(row.sell)}</span>
					<span class="tickers-metal-value tickers-metal-avg">{formatKVND(avg)}</span>
					<span class="tickers-metal-day-cell" class:up class:down>{pct}</span>
					<span class="tickers-metal-chevron" aria-hidden="true">
						<ChevronDown size={14} />
					</span>
				</button>
				{#if isExpanded}
					{@render bullionSubPanel(row.buy, row.sell, panelId)}
				{/if}
			{/snippet}

			<div class="tickers-card">
				<div class="tickers-card-header">
					<div class="tickers-card-tabs" onwheel={horizontalWheel}>
						<button
							class="tickers-card-tab"
							class:active-metals={metalTab === 'metals'}
							onclick={() => (metalTab = 'metals')}>
							Bullion
						</button>
						<button
							class="tickers-card-tab"
							class:active-forex={metalTab === 'forex'}
							onclick={() => (metalTab = 'forex')}>
							VCB Forex
						</button>
					</div>
					<div class="tickers-card-status">
						{#if metalTab === 'forex'}
							<FreshnessDot elapsed={tickers.forexElapsed} ttl={tickers.forexTtl} />
							<button
								class="tickers-card-refresh"
								onclick={() => tickers.refreshForex()}
								disabled={fetchingForex}
								title="Refresh forex">
								<SpinnerIcon
									size={10}
									class={fetchingForex ? 'tickers-spinner' : ''}
									style={fetchingForex ? `animation-duration: ${FOREX_SPIN_MS}ms` : ''} />
							</button>
						{:else}
							<FreshnessDot elapsed={tickers.metalsElapsed} ttl={tickers.metalsTtl} />
							<button
								class="tickers-card-refresh"
								onclick={() => tickers.refreshMetals()}
								disabled={fetchingMetals}
								title="Refresh metals">
								<SpinnerIcon
									size={10}
									class={fetchingMetals ? 'tickers-spinner' : ''}
									style={fetchingMetals ? `animation-duration: ${METALS_SPIN_MS}ms` : ''} />
							</button>
						{/if}
					</div>
				</div>

				{#if metalTab === 'metals'}
					<div class="tickers-metal-groups">
						<div class="tickers-table-header tickers-metal-header">
							<span></span>
							<span></span>
							<span class="tickers-table-col-label">Buy</span>
							<span class="tickers-table-col-label">Sell</span>
							<span class="tickers-table-col-label">Avg</span>
							<span class="tickers-table-col-label">24H</span>
							<span></span>
						</div>
						<!-- Fixed order: Gold Lượng (~168M) → Silver Kg (~11M) → Gold Chỉ (~16M, but
						     structurally "smaller unit of the biggest metal") → Silver Lượng (~410K).
						     User-specified: not dynamic; silver kg is between gold lượng and gold chỉ. -->
						{#if tickers.goldItem}
							{@render bullionRow({
								metal: 'gold',
								unit: 'lượng',
								iconSize: '1.875rem',
								buy: tickers.goldItem.buyLuong,
								sell: tickers.goldItem.sellLuong,
								stats: tickers.goldDayStats,
								key: 'gold-luong',
								title: 'SJC — 999.9 vàng miếng · giá per lượng · tap for foreign-currency prices',
							})}
						{/if}
						{#if tickers.silverKgItem}
							{@render bullionRow({
								metal: 'silver',
								unit: 'kg',
								iconSize: '2.25rem',
								buy: tickers.silverKgItem.buyPrice,
								sell: tickers.silverKgItem.sellPrice,
								stats: tickers.silverDayStats,
								key: 'silver-kg',
								title: 'Phú Quý — 999 silver ingot · giá per kg · tap for foreign-currency prices',
							})}
						{/if}
						{#if tickers.goldItem}
							{@render bullionRow({
								metal: 'gold',
								unit: 'chỉ',
								iconSize: '0.875rem',
								buy: tickers.goldItem.buyChi,
								sell: tickers.goldItem.sellChi,
								stats: tickers.goldDayStats,
								key: 'gold-chi',
								title: 'SJC — 999.9 vàng miếng · giá per chỉ · tap for foreign-currency prices',
							})}
						{/if}
						{#if tickers.silverLuongItem}
							{@render bullionRow({
								metal: 'silver',
								unit: 'lượng',
								iconSize: '1.875rem',
								buy: tickers.silverLuongItem.buyPrice,
								sell: tickers.silverLuongItem.sellPrice,
								stats: tickers.silverDayStats,
								key: 'silver-luong',
								title: 'Phú Quý — 999 silver ingot · giá per lượng · tap for foreign-currency prices',
							})}
						{/if}
					</div>
					<div class="tickers-metal-footer-note">1 kVND = 1.000 VND</div>
				{:else if metalTab === 'forex'}
					<div class="tickers-forex">
						{#if !tickers.forexToday && fetchingForex}
							<div class="tickers-forex-loading">
								<Skeleton class="mb-2 h-6 w-full" />
								<Skeleton class="mb-2 h-6 w-full" />
								<Skeleton class="mb-2 h-6 w-full" />
								<Skeleton class="mb-2 h-6 w-full" />
								<Skeleton class="h-6 w-full" />
							</div>
						{:else if !tickers.forexToday}
							<div class="tickers-forex-empty">Tap refresh to load rates.</div>
						{:else}
							<div class="tickers-forex-table" role="table" aria-label="VCB exchange rates (VND)">
								<div class="tickers-table-header tickers-forex-header" role="row">
									<span aria-hidden="true"></span>
									<span aria-hidden="true"></span>
									<span role="columnheader" class="tickers-table-col-label">Buy</span>
									<span role="columnheader" class="tickers-table-col-label">Sell</span>
									<span role="columnheader" class="tickers-table-col-label">Avg</span>
									<span role="columnheader" class="tickers-table-col-label">24h</span>
								</div>
								{#each forexRows as row, i (row.code)}
									{@const d = formatDelta(row.delta)}
									<div
										class="tickers-forex-row"
										class:tickers-forex-tier-divider={VCB_TIER_DIVIDER_INDICES.includes(i)}
										role="row">
										<span class="tickers-forex-flag" aria-hidden="true">
											<img src={flagUrl(row.code)} alt="" width="18" height="18" loading="lazy" />
										</span>
										<span class="tickers-forex-code" role="cell">{row.code}</span>
										<span class="tickers-forex-num" role="cell">
											{row.buy !== null ? formatForexPrice(row.buy) : '—'}
										</span>
										<span class="tickers-forex-num" role="cell">
											{row.sell !== null ? formatForexPrice(row.sell) : '—'}
										</span>
										<span class="tickers-forex-num tickers-forex-avg" role="cell">
											{row.avg !== null ? formatForexPrice(row.avg) : '—'}
										</span>
										<span
											class="tickers-forex-num tickers-forex-delta"
											class:up={d.sign === 'up'}
											class:down={d.sign === 'down'}
											class:flat={d.sign === 'flat'}
											class:unknown={d.sign === 'unknown'}
											role="cell">
											{d.text}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Crypto Card (Binance Spots grid + future blank tabs) -->
			<div class="tickers-card">
				<div class="tickers-card-header">
					<div class="tickers-card-tabs" bind:this={cryptoTabsEl} onwheel={horizontalWheel}>
						<button
							class="tickers-card-tab tickers-card-tab-binance"
							class:active={cryptoTab === 'binance'}
							onclick={() => (cryptoTab = 'binance')}>
							Binance
						</button>
						<!-- Blank tabs reserved for future content (per-exchange views, etc.). Body is
						     intentionally empty until a use case lands. -->
						{#each cryptoPlaceholders as id (id)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<button
									class="tickers-card-tab"
									class:active={cryptoTab === `p:${id}`}
									onclick={() => (cryptoTab = `p:${id}`)}>
									Tab {id}
								</button>
								<button
									class="tickers-card-tab-x"
									onclick={() => discardCryptoPlaceholder(id)}
									title="Close tab">
									×
								</button>
							</span>
						{/each}
						<!-- + creates a new blank tab (future use cases). Adding crypto symbols to the
						     watchlist is handled by the permanent input row at the Binance grid bottom. -->
						{#if cryptoSlotsUsed < tickers.watchlist.cap}
							<button
								class="tickers-card-tab tickers-card-tab-add"
								onclick={addCryptoPlaceholder}
								title="Open new tab">
								+
							</button>
						{/if}
					</div>
					<div class="tickers-card-status">
						<FreshnessDot elapsed={tickers.cryptoElapsed} ttl={tickers.cryptoTtl} />
						<button
							class="tickers-card-refresh"
							onclick={() => tickers.refreshCrypto()}
							disabled={fetchingCrypto}
							title="Refresh crypto">
							<SpinnerIcon
								size={10}
								class={fetchingCrypto ? 'tickers-spinner' : ''}
								style={fetchingCrypto ? `animation-duration: ${CRYPTO_SPIN_MS}ms` : ''} />
						</button>
					</div>
				</div>

				{#if cryptoTab === 'binance'}
					<div class="tickers-crypto-spots-scroll" bind:this={cryptoSpotsScrollEl}>
						<div class="tickers-crypto-spots-grid">
							<!-- Top header (mirrors Bullion / VCB Forex pattern). Sticky so the legend
							     stays visible while watchlist rows scroll past. -->
							<div class="tickers-table-header tickers-crypto-spots-header">
								<span></span>
								<span></span>
								<span class="tickers-table-col-label">Low</span>
								<span class="tickers-table-col-label">High</span>
								<span class="tickers-table-col-label">Price</span>
								<span class="tickers-table-col-label">24H</span>
								<span></span>
							</div>

							<!-- Rows 1–3: fixed majors (BTC / ETH / SOL) -->
							{#each CRYPTO as coin (coin.id)}
								{@const item = tickers.getCryptoTicker(coin.id)}
								<span class="tickers-crypto-spots-dot" style:--dot={coin.accent}></span>
								<span class="tickers-crypto-spots-asset">{coin.id}</span>
								{#if item}
									<span class="tickers-crypto-spots-num">{formatUSDT(item.lowPrice)}</span>
									<span class="tickers-crypto-spots-num">{formatUSDT(item.highPrice)}</span>
									<span class="tickers-crypto-spots-price">{formatUSDT(item.lastPrice)}</span>
									<span
										class="tickers-crypto-spots-pct"
										class:up={item.priceChangePercent > 0}
										class:down={item.priceChangePercent < 0}>
										{formatPctSigned(item.priceChangePercent)}
									</span>
								{:else}
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-5 w-full" />
									<Skeleton class="h-4 w-full" />
								{/if}
								<span></span>
							{/each}

							<!-- Rows 4..N: watchlist symbols -->
							{#each tickers.watchlist.crypto as symbol (symbol)}
								{@const fmt = formatCryptoDisplay(symbol)}
								{@const split = splitCryptoSymbol(symbol)}
								{@const quote = split?.quote ?? 'USDT'}
								{@const item = tickers.getCryptoTickerBySymbol(symbol)}
								{@const accent = brandFor(symbol) ?? '#6b8aad'}
								<span class="tickers-crypto-spots-dot" style:--dot={accent}></span>
								<span class="tickers-crypto-spots-asset">
									{fmt.primary}{#if fmt.suffix}<span class="tickers-crypto-spots-asset-quote"
											>{fmt.suffix}</span
										>{/if}
								</span>
								{#if item}
									<span class="tickers-crypto-spots-num"
										>{formatCryptoPrice(item.lowPrice, quote)}</span>
									<span class="tickers-crypto-spots-num"
										>{formatCryptoPrice(item.highPrice, quote)}</span>
									<span class="tickers-crypto-spots-price"
										>{formatCryptoPrice(item.lastPrice, quote)}</span>
									<span
										class="tickers-crypto-spots-pct"
										class:up={item.priceChangePercent > 0}
										class:down={item.priceChangePercent < 0}>
										{formatPctSigned(item.priceChangePercent)}
									</span>
								{:else}
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-5 w-full" />
									<Skeleton class="h-4 w-full" />
								{/if}
								<button
									class="tickers-crypto-spots-x"
									onclick={() => removeCryptoSymbol(symbol)}
									aria-label="Remove {symbol}">
									×
								</button>
							{/each}

							<!-- Permanent input row — always present at the table bottom while watchlist has
						     room. Pick a suggestion → symbol joins the watchlist rows above; input clears
						     via the `{#key}` remount and is ready for the next entry. -->
							{#if tickers.watchlist.crypto.length < tickers.watchlist.cap}
								<div class="tickers-crypto-spots-input-row">
									<span class="tickers-crypto-spots-input-icon" aria-hidden="true">+</span>
									<div class="tickers-crypto-spots-input-wrapper">
										{#key cryptoInputKey}
											<TickerTabInput
												type="crypto"
												add={(symbol) => {
													const ok = tickers.watchlist.addCrypto(symbol)
													// Fetch ONLY the new pair — Binance's /ticker/24hr weight scales with the
													// symbols list size, and the existing rows' data is at most 5 min stale, so
													// re-pulling them all would be wasted. Fire-and-forget; the row appears with
													// a skeleton placeholder until this resolves (~120ms typically).
													if (ok) tickers.fetchOneCrypto(symbol)
													return ok
												}}
												has={(s) => tickers.watchlist.hasCrypto(s) || RESERVED_CRYPTO.has(s)}
												onPick={() => {
													cryptoInputKey += 1
													// Scroll the freshly-appended row into view — without this, on a long
													// scrolled-down list the new entry would land below the visible window.
													tick().then(() => {
														cryptoSpotsScrollEl?.scrollTo({
															top: cryptoSpotsScrollEl.scrollHeight,
															behavior: 'smooth',
														})
													})
												}}
												onClose={() => (cryptoInputKey += 1)}
												minWidthCh={6} />
										{/key}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if cryptoTab.startsWith('p:')}
					<!-- Blank tab body — empty for now, reserved for future use cases. -->
					<div class="tickers-crypto-blank-tab">
						<span class="tickers-crypto-blank-tab-hint">Empty tab — content coming soon.</span>
					</div>
				{/if}
			</div>

			<!-- VN100 Card -->
			<div class="tickers-card">
				<div class="tickers-card-header">
					<div class="tickers-card-tabs" bind:this={stockTabsEl} onwheel={horizontalWheel}>
						<button
							class="tickers-card-tab"
							class:active-vn100={stockTab === 'VN100'}
							style:--vn100-accent="var(--rl-color-asset-vn100)"
							onclick={() => (stockTab = 'VN100')}>
							VN100
						</button>
						{#each tickers.watchlist.stocks as symbol (symbol)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<button
									class="tickers-card-tab tickers-card-tab-watchlist"
									class:active={stockTab === symbol}
									onclick={() => (stockTab = symbol)}>
									{symbol}
								</button>
								<button
									class="tickers-card-tab-x"
									onclick={() => removeStockSymbol(symbol)}
									title="Remove from watchlist">
									×
								</button>
							</span>
						{/each}
						{#each stockPlaceholders as id (id)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<TickerTabInput
									type="stock"
									add={tickers.watchlist.addStock}
									has={tickers.watchlist.hasStock}
									onPick={(symbol) => commitStockPick(id, symbol)}
									onClose={() => discardStockPlaceholder(id)} />
								<button
									class="tickers-card-tab-x"
									onclick={() => discardStockPlaceholder(id)}
									title="Discard">
									×
								</button>
							</span>
						{/each}
						{#if stockSlotsUsed < tickers.watchlist.cap}
							<button
								class="tickers-card-tab tickers-card-tab-add"
								onclick={addStockPlaceholder}
								title="Add VN ticker">
								+
							</button>
						{/if}
					</div>
					<div class="tickers-card-status">
						<FreshnessDot elapsed={tickers.stocksElapsed} ttl={tickers.stocksTtl} />
						<button
							class="tickers-card-refresh"
							onclick={() => tickers.refreshStocks()}
							disabled={fetchingStocks}
							title="Refresh VN100">
							<SpinnerIcon
								size={10}
								class={fetchingStocks ? 'tickers-spinner' : ''}
								style={fetchingStocks ? `animation-duration: ${STOCKS_SPIN_MS}ms` : ''} />
						</button>
					</div>
				</div>

				{#if stockTab.startsWith('p:')}
					<!-- Empty body while user types in the tab-strip input; popover shows results there. -->
				{:else if !FIXED_STOCK.has(stockTab)}
					{@const q = tickers.getStockQuote(stockTab)}
					{#if q}
						{@const up = q.pctChange >= 0}
						<div class="tickers-price-row">
							<span class="tickers-price-label">Price</span>
							<div class="tickers-price-value-wrap">
								<span class="tickers-price-value tickers-crypto-price"
									>{formatStockPrice(q.price)}</span>
								<span class="tickers-price-unit">VND</span>
							</div>
						</div>
						<div class="tickers-price-row">
							<span class="tickers-price-label">Change</span>
							<div class="tickers-price-value-wrap">
								<span class="tickers-crypto-change" class:up class:down={!up}>
									{up ? '+' : ''}{formatStockPrice(q.change)}
								</span>
								<span class="tickers-crypto-pct" class:up class:down={!up}>
									({up ? '+' : ''}{q.pctChange.toFixed(2)}%)
								</span>
							</div>
						</div>
						<div class="tickers-crypto-range">
							<span class="tickers-crypto-range-pair">
								<span class="tickers-crypto-range-label">Ref</span>
								<span class="tickers-crypto-range-value">{formatStockPrice(q.refPrice)}</span>
							</span>
							<span class="tickers-crypto-range-pair">
								<span class="tickers-crypto-range-label">Vol</span>
								<span class="tickers-crypto-range-value"
									>{compactNumberFormat.format(q.accumulatedVol)}</span>
							</span>
						</div>
					{:else}
						<div class="tickers-price-row">
							<Skeleton class="h-6 w-32" />
						</div>
					{/if}
				{:else if tickers.vn100Quote}
					{@const q = tickers.vn100Quote}
					{@const up = q.change >= 0}
					<div class="tickers-price-row">
						<span class="tickers-price-label">Close</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value tickers-crypto-price">{formatVN100(q.close)}</span>
							<span class="tickers-price-unit">PTS</span>
						</div>
					</div>
					<div class="tickers-price-row">
						<span class="tickers-price-label">Change</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-crypto-change" class:up class:down={!up}>
								{up ? '+' : ''}{formatVN100(q.change)}
							</span>
							<span class="tickers-crypto-pct" class:up class:down={!up}>
								({up ? '+' : ''}{q.pctChange.toFixed(2)}%)
							</span>
						</div>
					</div>
					<div class="tickers-crypto-range">
						<span class="tickers-crypto-range-pair">
							<span class="tickers-crypto-range-label">L</span>
							<span class="tickers-crypto-range-value">{formatVN100(q.low)}</span>
						</span>
						<span class="tickers-crypto-range-pair">
							<span class="tickers-crypto-range-label">H</span>
							<span class="tickers-crypto-range-value">{formatVN100(q.high)}</span>
						</span>
					</div>
				{:else}
					<div class="tickers-price-row">
						<Skeleton class="h-6 w-32" />
					</div>
				{/if}
			</div>
		</div>

		<!-- Historical Chart -->
		<div class="tickers-chart-section">
			<div class="tickers-chart-header">
				<div class="tickers-chart-tabs">
					<div class="tickers-chart-tabs-scroll" onwheel={horizontalWheel}>
						{#each chartTabs as tab (tab.id)}
							<button
								class="tickers-chart-tab"
								class:active={tickers.chartAsset === tab.id}
								style:--tab-accent={tab.accent}
								onclick={() => tickers.fetchChart(tab.id, tickers.chartDuration)}>
								{tab.label}
							</button>
						{/each}
					</div>
					<div class="tickers-chart-status">
						<FreshnessDot elapsed={tickers.chartElapsed} ttl={tickers.chartTtl} />
						<button
							class="tickers-card-refresh"
							onclick={() => tickers.refreshChart()}
							disabled={fetchingChart}
							title="Refresh chart">
							<SpinnerIcon
								size={10}
								class={fetchingChart ? 'tickers-spinner' : ''}
								style={fetchingChart ? 'animation-duration: 500ms' : ''} />
						</button>
					</div>
				</div>
				<div class="tickers-chart-sub-controls">
					<div class="tickers-candle-sizes">
						<span class="tickers-candle-label">Candle</span>
						<div class="tickers-candle-chips">
							{#each candleSizes as s}
								<button
									class="tickers-candle-chip"
									class:active={candleSize === s.value}
									onclick={() => (candleSize = s.value)}>
									{s.label}
								</button>
							{/each}
						</div>
					</div>
					<div class="tickers-chart-intervals">
						<span class="tickers-interval-label">Interval</span>
						<div class="tickers-chart-durations">
							{#each durations as d}
								<button
									class="tickers-duration-chip"
									class:active={tickers.chartDuration === d.value && tickers.chartData}
									onclick={() => tickers.fetchChart(tickers.chartAsset, d.value)}>
									{d.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<LoadingOverlay
				loading={tickers.chartLoading}
				accentColor={CHART_ACCENTS[tickers.chartAsset] ?? DEFAULT_PROGRESS_ACCENT}>
				<div class="tickers-chart-body">
					{#if tickers.chartError && !tickers.chartData}
						<div class="tickers-chart-placeholder">
							{tickers.chartError}
						</div>
					{:else if tickers.chartData}
						<PriceChart
							data={tickers.chartData}
							accentColor={CHART_ACCENTS[tickers.chartAsset] ?? '#e8e6e3'}
							priceFormatter={tickers.isCryptoAsset
								? USDT_FORMATTER
								: tickers.isStockAsset
									? STOCK_FORMATTER
									: undefined}
							{candleSize} />
					{:else}
						<div class="tickers-chart-placeholder">
							{#if tickers.chartLoading}
								<SpinnerIcon class="tickers-spinner" size={16} />
								<span>Loading chart...</span>
							{:else}
								Select a timeframe to view price history
							{/if}
						</div>
					{/if}
				</div>
			</LoadingOverlay>
		</div>
	{/if}
</div>

<style>
	.tickers {
		max-width: 860px;
		margin: 0 auto;
		padding: var(--rl-space-lg) var(--rl-space-md);
		font-family: var(--rl-font-sans);
		color: var(--rl-color-text);
	}

	:global(.tickers-spinner) {
		animation: spin 1s linear infinite;
	}

	/* Cards grid: stack on mobile, side-by-side on tablet+.
	   align-items:start so each card sizes to its own content. Default stretch behavior coupled
	   row-sibling heights — expanding the forex tab's ~19rem table forced the crypto card to
	   match, breaking the standalone-card feel. min-height on .tickers-card still floors any
	   body that would otherwise collapse below the header band (new-tab placeholder state). */
	.tickers-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--rl-space-md);
		margin-bottom: var(--rl-space-lg);
		align-items: start;
	}
	@media (min-width: 640px) {
		.tickers-cards {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* Card */
	.tickers-card {
		background: var(--rl-color-surface);
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-lg);
		padding: 20px;
		/* Grid items default to min-width: auto (= content size), which lets a long tab strip blow
		   past the column width. Overriding to 0 keeps the card pinned to its grid cell so the
		   inner overflow-x: auto on .tickers-card-tabs actually clips and scrolls. */
		min-width: 0;
		/* Reserve a natural footprint so an empty-body state (new-tab placeholder active) doesn't
		   collapse to header-height. CSS Grid only cross-stretches row-siblings, so a card alone
		   in its row (stock card at the 2-col breakpoint, any card on mobile) has nothing to match
		   against. 215px ≈ the filled metals/crypto body height — see +page.svelte body rendering. */
		min-height: 215px;
		transition: background var(--rl-duration-short) var(--rl-ease-move);
	}
	/* Hard-cap the dashboard's top-row pair (Bullion + Binance) at 20rem (320px) so the two
	   cards sit pixel-flush regardless of content density. `:nth-child(-n+2)` targets only
	   the first two children of `.tickers-cards` (= row 1 at the 640px+ 2-col breakpoint);
	   the VN100 card (3rd child, row 2 at 1fr 1fr) keeps its natural content-driven height.
	   flex-column lets the body slot fill any leftover space — Binance's scroll container
	   takes it via `flex: 1`, Bullion's groups stack from the top and a tiny tail of empty
	   space (~2px) sits below the footer-note. */
	.tickers-cards > .tickers-card:nth-child(-n + 2) {
		height: 20rem;
		display: flex;
		flex-direction: column;
	}
	/* Halfway lift between `--rl-color-surface` (#171717) and `--rl-color-surface-raised`
	   (#262626). The full raised value was crowding the row:hover overlay (7% white), leaving
	   the pointed-at row indistinguishable from the rest of the card. A gentler card lift keeps
	   elevation affordance while leaving headroom for the row's local focal highlight. */
	.tickers-card:hover {
		background: #1f1f1f;
	}

	/* Card header: tabs left, status right */
	.tickers-card-header {
		display: flex;
		/* flex-start so the freshness dot + refresh button stay docked to the top-right corner
		   even when the tabs row grows to multiple lines (lots of watchlist tabs / placeholders). */
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--rl-space-md);
		margin-bottom: var(--rl-space-md);
		border-bottom: 1px solid var(--rl-color-border);
	}
	.tickers-card-status {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
		/* Padding-bottom keeps the status above the header's bottom border line; padding-top nudges
		   the dot down to the visual midline of the first tab row. */
		padding: 2px 0 var(--rl-space-sm);
	}
	.tickers-card-refresh {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 3px;
		border: none;
		background: transparent;
		color: var(--rl-color-text-faint);
		cursor: pointer;
		transition: all var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-card-refresh:hover {
		color: var(--rl-color-text);
		background: rgba(255, 255, 255, 0.05);
	}
	.tickers-card-refresh:disabled {
		cursor: not-allowed;
	}

	/* Card tabs — underline style to differentiate from unit chips. Horizontal scroll (no wrap)
	   so adding watchlist tabs never grows the header height; mirrors the chart-tabs-scroll pattern. */
	.tickers-card-tabs {
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		gap: var(--rl-space-md);
		align-items: flex-end;
		overflow-x: auto;
		overflow-y: hidden;
		/* Reserve 2px below the tabs' content edge so their margin-bottom:-1px borders don't get
		   clipped by overflow-y:hidden. Without this the placeholder underline (3px) was unevenly
		   clipped — visible ~2.2px in stock card vs ~1.4px in crypto card due to subpixel layout. */
		padding-bottom: 2px;
		/* Scrollbar fully hidden on both axes — scroll still works (wheel handler, touch swipe,
		   programmatic scrollLeft) but no chrome is ever painted. */
		scrollbar-width: none;
	}
	.tickers-card-tabs::-webkit-scrollbar {
		display: none;
	}
	/* Tabs hold their natural width — no shrink-to-fit. The strip's overflow-x:auto + custom
	   wheel handler take over when many tabs are added; cleaner than mid-shrink in-between widths. */
	.tickers-card-tab,
	.tickers-card-tab-wrap,
	.tickers-card-tab-x,
	.tickers-card-tab-add {
		flex-shrink: 0;
	}
	.tickers-card-tab {
		font-family: var(--rl-font-sans);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		letter-spacing: 0.3px;
		/* Min-width equalizes 3-char tabs (BTC/ETH/SOL) and the placeholder to one footprint. */
		min-width: 25px;
		text-align: center;
		padding: 0 0 var(--rl-space-sm);
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		color: var(--rl-color-text-faint);
		background: transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-card-tab:hover {
		color: var(--rl-color-text-subtle);
	}
	/* Metals tab — active color reuses --rl-color-asset-gold. Gold is the primary precious
	   metal in VN retail so the combined "Metals" tab borrows the gold accent; silver is
	   a minor secondary and its palette is only used in Option A (below). */
	.tickers-card-tab.active-metals {
		color: var(--rl-color-asset-gold);
		border-bottom-color: var(--rl-color-asset-gold);
	}
	/* Option A prep — uncomment these + split the "Metals" button into Gold/Silver to
	   expose both metals as standalone tabs (see the snippet-switch guide in the template).
	.tickers-card-tab.active-gold {
		color: var(--rl-color-asset-gold);
		border-bottom-color: var(--rl-color-asset-gold);
	}
	.tickers-card-tab.active-silver {
		color: var(--rl-color-asset-silver);
		border-bottom-color: var(--rl-color-asset-silver);
	}
	*/
	.tickers-card-tab.active-forex {
		color: var(--rl-color-asset-forex);
		border-bottom-color: var(--rl-color-asset-forex);
	}
	.tickers-card-tab.active-vn100 {
		color: var(--vn100-accent);
		border-bottom-color: var(--vn100-accent);
	}
	/* Wrap holds tab + ✕ as one strip-cell so the divider and removal control share alignment. */
	.tickers-card-tab-wrap {
		display: inline-flex;
		align-items: stretch;
	}
	.tickers-card-tab-watchlist {
		font-family: var(--rl-font-mono);
		letter-spacing: -0.2px;
		padding-right: 2px;
	}
	.tickers-card-tab-watchlist.active {
		color: var(--rl-color-text);
		border-bottom-color: var(--rl-color-border-strong);
	}
	/* Placeholder tab is now rendered by TickerTabInput (inline input + popover suggestions).
	   The old .tickers-card-tab-placeholder button class is no longer used. */
	.tickers-card-tab-x {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md); /* bumped from sm — × is a hit target, deserves a bit more weight */
		line-height: 1;
		/* Left-padding only. A right-pad stacks with the flex gap-md between wraps, making
		   custom→custom gaps (FPT × FOX) visibly wider than fixed→fixed (BTC ETH). Keeping 0
		   on the right so gap-md alone controls inter-tab spacing — consistent across tab kinds. */
		padding: 0 0 var(--rl-space-sm) 4px;
		margin-left: 2px;
		color: var(--rl-color-text-faint);
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-card-tab-x:hover {
		color: var(--rl-color-danger);
	}
	.tickers-card-tab-add {
		/* Drop tab characteristics (underline rail, min-width, negative margin) — + is an icon button. */
		border: none;
		margin-bottom: 0;
		min-width: 0;
		/* Circular Chrome-style new-tab button: invisible at rest, circle bg appears on hover.
		   18px is small enough for the glyph center to sit at ~tab-text-center (within ~2px) when
		   top-aligned, while still big enough to feel like a clickable button. */
		width: 18px;
		height: 18px;
		border-radius: 50%;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* Top-align so the + glyph sits at the same vertical band as tab text (which is at the top
		   of its box because tabs use bottom-padding for the underline rail). align-self:center
		   visibly drops + below tab text since tab text is NOT centered in its own box. */
		align-self: flex-start;
		/* Tighter gap from the rightmost tab — the gap-md (16px) flex-gap plus the previous +8px
		   margin felt too distant. Negative margin pulls + closer (effective gap ≈ 10px). */
		margin-left: calc(-1 * var(--rl-space-2xs));
		/* Glyph */
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md);
		font-weight: var(--rl-font-bold);
		line-height: 1;
		color: var(--rl-color-text-subtle);
		/* Sticky to the right edge — opaque card-bg masks tabs scrolling underneath. */
		position: sticky;
		right: 0;
		background: var(--rl-color-surface);
		transition:
			background var(--rl-duration-short) var(--rl-ease-move),
			color var(--rl-duration-short) var(--rl-ease-move);
	}
	.tickers-card-tab-add:hover {
		background: var(--rl-color-surface-raised);
		color: var(--rl-color-text);
	}
	/* Match the card's hover bg so + circle stays invisible-by-default while card is being hovered. */
	.tickers-card:hover .tickers-card-tab-add {
		background: var(--rl-color-surface-raised);
	}
	.tickers-card:hover .tickers-card-tab-add:hover {
		background: var(--rl-color-border);
	}
	/* Filled-tab body stub — minimal, just enough to confirm the tab→body link works. Step 4 swaps it for real spot data. */
	/* Old stub styles removed — watchlist tabs now render real price data. */

	/* Bullion table — 6-col structure. Tracks:

	      flag (18px) · label (3rem) · buy (4.5rem) · sell (4.5rem) · avg (4.5rem) · 24h (3.5rem)

	   ALL tracks are FIXED widths — no `1fr` and no `auto`. This is deliberate: sub-row
	   foreign-currency values like JPY/KRW "1.022.741" are wider than main row VND values
	   like "168.750", and `1fr` with subgrid auto-sizing would let sub-row content push
	   Buy/Sell/Avg tracks wider than main row needs, visibly jumping BUY header position
	   on toggle. Fixed tracks = tracks sized for the widest expected content in either
	   context = no jump, ever.

	   The chevron indicator now lives INSIDE the 24H cell (right after the `%` value) so
	   there's no dedicated chevron column stealing horizontal space past the 24H value.
	   The 24H column now runs all the way to the card's inner right edge, matching the
	   right-alignment rhythm of the other price columns.

	   4.5rem (72px) price cols accommodate the widest sub-row content after we switch the
	   sub-panel to vi-VN locale (dot-thousands): "9.537.167" KRW ≈ 63px fits with padding.
	   Avg is included because the VN bullion market has a real mid: street/OTC/P2P trades
	   happen at prices between the posted Buy and Sell, so mid is actionable, not
	   theoretical. */
	.tickers-metal-groups {
		display: grid;
		/* Col 1 at 2.5rem — matches the biggest ingot (Silver Kg = 2.5rem). Smaller-unit icons
		   center inside the same track; the excess column space around smaller ingots is the
		   visual cue that those units carry less material.
		   Col 7 is `auto`-sized for the toggle chevron — dedicated column anchored to the card's
		   right edge, consistent position across collapsed + expanded states.
		   Numeric cols (3–6) use `minmax(0, 1fr)` — the `0` minimum is critical vs bare `1fr`
		   (which defaults to `minmax(auto, 1fr)` and lets long sub-row values like KRW's
		   "9.396.914" push the track wider, causing re-layout on expand/collapse). The `0` floor
		   pins tracks to equal 1fr shares regardless of sub-content width, so columns stay
		   rock-steady when toggling the foreign-currency sub-panel. */
		grid-template-columns: 2rem 2.25rem minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(3rem, 0.7fr) auto;
		column-gap: 10px;
		row-gap: var(--rl-space-xs);
		padding: var(--rl-space-sm) 0 0;
		/* No negative margin — the table stays inside the card's 20px padding. Expand/collapse
		   stability still holds thanks to the `minmax(0, 1fr)` track definition above, which
		   prevents sub-row content from growing columns. The card's padding gives the numeric
		   columns a visible gutter from the card border, and the chevron (col 7) lands at the
		   card's inner padding edge rather than pressed against the border. */
	}
	/* Header, data rows, AND sub-rows are each their own subgrid inheriting the parent's
	   7 tracks. Subgrid preserves column alignment automatically — main row "Gold 167.500"
	   lines up with sub row "USD 6,383.38" in the same Buy column, etc. */
	.tickers-metal-header,
	.tickers-metal-row {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
	}
	/* Row is a <button> for a11y (native keyboard + aria-expanded). Reset browser chrome so
	   it inherits the card's typography and spacing; keep the pointer cursor + hover/focus
	   affordances. `text-align: inherit` lets child spans keep their per-cell alignment. */
	button.tickers-metal-row {
		appearance: none;
		background: transparent;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: inherit;
		width: 100%;
		cursor: pointer;
		padding: 6px 0;
		border-radius: var(--rl-radius-sm);
		transition: background var(--rl-duration-micro) var(--rl-ease-move);
	}
	/* Row hover must out-step the card's own `:hover` (which raises to `surface-raised`).
	   At 3% white the row overlay disappeared on top of the raised card — bumped to 7% so the
	   pointed-at row reads clearly as a foreground element against the already-elevated card. */
	button.tickers-metal-row:hover {
		background: rgba(255, 255, 255, 0.07);
	}
	button.tickers-metal-row:focus-visible {
		outline: 2px solid var(--rl-color-border-strong);
		outline-offset: -2px;
	}
	/* Flag cell — ingot icon occupying the col 1 (2.5rem) leading column. Same column
	   position the VCB Forex flag column claims, so when the sub-panel renders country
	   flags below, they line up in the same track. Source attribution (SJC / Phú Quý)
	   lives on the row's `title` tooltip instead of stealing horizontal space on mobile.
	   Per-row icon size flows through the `--ingot-size` custom property set inline on the
	   flag cell — rem values (0.875 / 1.875 / 2.5rem) scale with the root-font-size breakpoint
	   at ≤720px, keeping physical-ratio cues proportionate across desktop and mobile. */
	.tickers-metal-flag {
		display: inline-flex;
		align-items: center;
		/* Right-justify the ingot within its 2.5rem track so smaller icons (Lượng 1.875rem, Chỉ
		   0.875rem) sit adjacent to the label column rather than centered in empty space. The
		   biggest icon (Silver Kg at 2.5rem) fills the track and lands flush to the right edge
		   regardless. Net effect: ingot + metal name read as a single asset identity unit. */
		justify-content: flex-end;
	}
	.tickers-metal-flag img {
		display: block;
		width: var(--ingot-size);
		height: var(--ingot-size);
		/* Silver Kg's `--ingot-size` (2.25rem) exceeds col-1's 2rem track by ~4px at 16root.
		   Override Tailwind preflight's `max-width: 100%` so the ingot renders at the declared
		   rem rather than clamping to the track width. `flex-end` on the parent anchors it to
		   col 1's right edge; the ~4px spillover bleeds leftward through the card's internal
		   padding (20px), which has room. */
		max-width: none;
	}
	/* Stacked label: metal name bold on top, unit name muted below. Stacked (not inline)
	   because the 3rem label track is too narrow to fit "Gold Lượng" on one line at
	   readable font-sizes — vertical stacking keeps the column width unchanged and gives
	   each unit row a self-describing label without stealing from the price columns. */
	.tickers-metal-label {
		display: flex;
		flex-direction: column;
		font-size: var(--rl-text-xs);
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text);
		letter-spacing: 0.2px;
		line-height: 1.15;
	}
	.tickers-metal-unit {
		/* 0.5625rem — one notch below `--rl-text-2xs` (0.625rem / 10px desktop, 8.75px mobile).
		   Rem-based so the unit hint scales in lockstep with the rest of the type system when the
		   root drops to 14px at ≤720px. Units are a supporting whisper under each metal label
		   (lượng / kg / chỉ) — deliberately quieter than the smallest token so the metal name
		   stays the clear anchor of the row's identity. */
		font-size: 0.5625rem;
		font-weight: var(--rl-font-normal);
		color: var(--rl-color-text-subtle);
		letter-spacing: 0.3px;
	}
	/* Shared table-header base — bullion + forex both apply .tickers-table-header alongside
	   their specific class. Padding, border, and background live here so the two cards' header
	   bands render at identical height (2px vertical padding = 18-19px total). Sticky / column
	   gutter details stay on the specific class since only forex scrolls. */
	.tickers-table-header {
		padding: 2px 0;
		border-bottom: 1px solid var(--rl-color-border);
		/* Header stays at --rl-color-surface while the card lifts to --rl-color-surface-raised on
		   hover, producing a subtle band that makes the header pop from the data rows. */
		background: var(--rl-color-surface);
	}
	/* Shared table column label — same typography in bullion + forex so the two cards feel like
	   they're on the same design grid. Kept generic so future tables can reuse. */
	.tickers-table-col-label {
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		text-align: right;
	}
	/* No padding-inline-end on the last cell — the chevron now owns its own column at the
	   card's right edge, and the groups container's negative margin-inline + the 10px column
	   gap provide enough breathing room naturally. */
	.tickers-metal-value {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-medium);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text-subtle);
		text-align: right;
	}
	/* Avg (mid-market) is the headline — promoted to match VCB Forex's .tickers-forex-avg
	   treatment. Buy/Sell stay muted as reference points; the midpoint is what the user
	   glances at first when "what's the market price today?" is the question. The street /
	   P2P bullion market genuinely trades around mid, so the highlight encodes a real
	   reference, not a theoretical one. */
	.tickers-metal-avg {
		color: var(--rl-color-text);
		font-weight: var(--rl-font-semibold);
	}
	/* Chevron — tiny visual hint that the row expands. Lives in its own grid column (col 7),
	   anchored to the card's right edge via the groups container's negative margin-inline.
	   Fixed position across collapsed + expanded states so the user's eye can target the same
	   spot repeatedly. Rotates 180° when the row's `.expanded` class is active. aria-expanded
	   on the row carries the a11y state; class:expanded drives only the rotation. */
	.tickers-metal-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--rl-color-text-faint);
		transition: transform var(--rl-duration-micro) var(--rl-ease-move);
	}
	button.tickers-metal-row.expanded .tickers-metal-chevron {
		transform: rotate(180deg);
	}
	/* Foreign-currency sub-panel — appears when a metal row is tapped. Spans all 7 parent
	   columns via `grid-column: 1 / -1` AND subgrids to the parent tracks, so sub-row cells
	   land in the exact same columns as the main row above: USD's buy sits under BUY, its
	   sell under SELL, etc. Two empty spans at the end hold the 24h + chevron columns open
	   so the subgrid stays aligned.

	   No layout jump on expand/collapse: the parent grid's numeric tracks are `minmax(0, 1fr)`
	   (equal shares with a 0 floor), so long sub-row values like "9.396.914" (KRW) can't push
	   those columns wider. That's what keeps the main row's BUY/SELL/AVG/24H pinned while the
	   sub-panel animates in and out. Scrollbar styling mirrors VCB Forex exactly. */
	.tickers-bullion-sub-panel {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		max-height: 14rem;
		overflow-y: auto;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
		margin-top: 2px;
		padding: var(--rl-space-xs) 0 0;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.tickers-bullion-sub-row {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		padding: 4px 0;
	}
	/* Flag cell — lives in col 1 like the parent row's ingot, right-justified so the flag's
	   right edge sits flush against the col 1/col 2 boundary. This mirrors `.tickers-metal-flag`
	   exactly (same justify), making each sub-row a visual echo of the parent's identity slot.
	   `translate` nudges the flag into the col-gap by 4px so the 18px-wide flag clusters visually
	   with the code (~6px apparent gap), without changing col-1's track width or the code's col-2
	   left-edge alignment. The parent's wider ingot (~28px) doesn't need this lift because its
	   larger mass already fills col 1's visual weight. */
	.tickers-bullion-sub-flag {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		translate: 4px 0;
	}
	.tickers-bullion-sub-flag img {
		display: block;
		width: 18px;
		height: 12px;
		border-radius: 1px;
	}
	/* Currency code — sits in col 2, left-aligned (default text flow), so its left edge lines up
	   with the parent row's metal-name left edge. Typography matches the other sub-panel labels;
	   flex-align center keeps it vertically centered alongside the flag. */
	.tickers-bullion-sub-code {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		letter-spacing: 0.3px;
	}
	.tickers-bullion-sub-value {
		font-family: var(--rl-font-mono);
		/* 2xs (10px desktop / 8.75px mobile) — one notch below main row values. Foreign-currency
		   equivalents like JPY/KRW run 7-digit ("9.344.954"), and at text-xs (11px) they brushed
		   against adjacent columns on narrower viewports. 2xs gives the tabular-nums layout room
		   to breathe without looking out of scale — the foreign figures are supplementary context,
		   not primary data. */
		font-size: var(--rl-text-2xs);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.2px;
		color: var(--rl-color-text-subtle);
		text-align: right;
		white-space: nowrap;
	}
	/* Sub-row Avg mirrors the main row's Avg highlight — one bright reference value per
	   row at the sub-table level too, so the eye has a focal anchor when scanning 20
	   currencies' worth of mid-market equivalents. */
	.tickers-bullion-sub-avg {
		color: var(--rl-color-text);
		font-weight: var(--rl-font-semibold);
	}
	.tickers-bullion-sub-empty {
		grid-column: 1 / -1;
		text-align: center;
		color: var(--rl-color-text-faint);
		font-size: var(--rl-text-xs);
		padding: var(--rl-space-sm) 0;
	}
	/* Footer note on the Bullion card — explains the kVND unit in the smallest available
	   text size. Column headers drop "(VND)" to save horizontal space; this note carries the
	   unit definition once and anchors to the card's bottom-right corner so it reads as a
	   persistent legend rather than a floating annotation.

	   Anchoring via flex-column on the card + `margin-top: auto` on the footnote pushes it
	   to the bottom when the card's `min-height: 215px` exceeds content height (common now
	   that the table compacts to 2 rows). Scoped via `:has()` so only the card containing
	   this footnote flips to flex-column; other cards (crypto, stocks) keep block layout. */
	.tickers-card:has(.tickers-metal-footer-note) {
		display: flex;
		flex-direction: column;
	}
	.tickers-metal-footer-note {
		margin-top: auto;
		font-size: var(--rl-text-2xs);
		color: var(--rl-color-text-faint);
		padding-top: var(--rl-space-xs);
		letter-spacing: 0.3px;
		text-align: right;
	}

	/* ─── VCB Forex table ─────────────────────────────────────────────────
	   Dense 6-column table: flag · code · buy · sell · avg · 24h.
	   Tier A (top 5) is separated from B+C by a hairline divider; the full
	   table scrolls natively when overflow exceeds the card height. */
	.tickers-forex {
		padding: var(--rl-space-sm) 0 0;
	}
	.tickers-forex-loading {
		padding: var(--rl-space-sm) 0;
	}
	.tickers-forex-empty {
		padding: var(--rl-space-md) 0;
		color: var(--rl-color-text-faint);
		font-size: var(--rl-text-xs);
		text-align: center;
	}
	/* Single scroll container: header (sticky) + rows share the same grid so the
	   scrollbar-gutter reservation keeps header columns aligned with row cells
	   regardless of whether the scrollbar is actually rendered. */
	.tickers-forex-table {
		display: flex;
		flex-direction: column;
		/* 18rem targets exactly 10 visible pair rows at desktop's 16px root (288px) with CAD as
		   the last fully-visible row and a tiny sliver of HKD peeking to signal the table scrolls.
		   On mobile (14px root) this shrinks to 252px, showing ~9–10 rows — acceptable since the
		   phone viewport has ample vertical space for scrolling when the user wants more. */
		max-height: 18rem;
		overflow-y: auto;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		/* Subtle translucent thumb on transparent track — the default light-gray rail pulled the
		   eye more than the data itself, especially against the card's dark surface. */
		scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
	}
	/* 6-col grid: flag | code | buy | sell | avg | 24h. Matches Bullion's rhythm — all four
	   numeric columns are 1fr (buy/sell/avg/24h balanced evenly) and column-gap is 10px
	   (= Bullion), which also tightens flag↔code into a visual pair instead of floating. */
	.tickers-forex-header,
	.tickers-forex-row {
		display: grid;
		/* Col 1 is 22px (= Bullion ingot column) with the 18px flag centered inside —
		   a 2px inset per side so the flag's center aligns with the Bullion ingot's
		   center when the two cards stack. */
		grid-template-columns: 22px minmax(2.25rem, auto) 1fr 1fr 1fr 1fr;
		gap: var(--rl-space-xs) 10px;
		align-items: center;
	}
	.tickers-forex-header {
		/* Forex-specific additions on top of .tickers-table-header: padding-inline-end to keep
		   the rightmost label (24h) clear of the scrollbar gutter reserved on rows below, plus
		   sticky positioning so the header stays visible while rows scroll. */
		padding-inline-end: var(--rl-space-sm);
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.tickers-forex-row {
		/* Token-based 4px (--rl-space-xs = 0.25rem) vertical padding — dense enough to surface
		   ≥10 currency pairs at first sight, comfortable enough to read cleanly. Rows are
		   non-interactive (no tap target), so density wins over padding comfort, but 2px was too
		   cramped. padding-inline-end still matches the header so the 24h column stays clear of
		   the scrollbar gutter. */
		padding: var(--rl-space-xs) var(--rl-space-sm) var(--rl-space-xs) 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}
	/* Header + row live side-by-side in the same flex container, so `.tickers-forex-row:first-child`
	   never matches (the header is the first child). Use the adjacent-sibling combinator to target
	   the row immediately after the header — that's USD, the actual first data row. */
	.tickers-forex-header + .tickers-forex-row {
		/* Margin-top gives USD breathing space under the sticky header's bottom border so the
		   first data row reads as its own band rather than glued to the label row. Matches the
		   --rl-space-xs rhythm used for row padding, keeping vertical cadence consistent. */
		border-top: none;
		margin-top: var(--rl-space-xs);
	}
	/* Hairline divider between Tier A (pinned 5) and Tier B — visual grouping cue without a
	   label. Dotted style softens the mark so it doesn't compete with the header's solid bottom
	   rule: header = structural boundary, tier divider = gentle grouping hint. Same color token
	   keeps the hierarchy legible while the stroke pattern encodes the weight difference. */
	.tickers-forex-row.tickers-forex-tier-divider {
		border-top: 1px dotted var(--rl-color-border);
		margin-top: 1px;
		padding-top: var(--rl-space-xs);
	}
	.tickers-forex-flag {
		display: inline-flex;
		align-items: center;
		/* 4px inset from col 1's left edge — optical nudge: round flags need a slightly
		   larger inset than the rectangular ingot to read as aligned across cards. */
		justify-content: flex-start;
		padding-inline-start: 4px;
	}
	.tickers-forex-flag img {
		display: block;
		width: 18px;
		height: 18px;
		border-radius: 50%;
	}
	.tickers-forex-code {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-bold);
		letter-spacing: -0.2px;
		color: var(--rl-color-text);
	}
	.tickers-forex-num {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-medium);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text-subtle);
		text-align: right;
	}
	/* Avg (mid-market) is the headline — promoted above buy/sell, which stay muted as reference
	   points. Buy/sell spread matters less than the unbiased mid for quick FX glances. */
	.tickers-forex-avg {
		color: var(--rl-color-text);
		font-weight: var(--rl-font-semibold);
	}
	.tickers-forex-delta.up {
		color: var(--rl-color-up);
	}
	.tickers-forex-delta.down {
		color: var(--rl-color-down);
	}
	.tickers-forex-delta.flat,
	.tickers-forex-delta.unknown {
		color: var(--rl-color-text-faint);
	}

	/* Price rows */
	.tickers-price-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 10px 0;
	}
	.tickers-price-row + .tickers-price-row {
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}
	.tickers-price-label {
		font-size: var(--rl-text-xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		min-width: 40px;
	}
	.tickers-price-value-wrap {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.tickers-price-value {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xl);
		font-weight: var(--rl-font-bold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.5px;
		color: var(--rl-color-text);
	}
	@media (min-width: 640px) {
		.tickers-price-value {
			font-size: 22px;
		}
	}
	.tickers-price-unit {
		font-size: var(--rl-text-2xs);
		color: var(--rl-color-text-subtle);
	}

	/* Spread */
	/* 24H change cell inside the metal table (column 4). Right-aligned to match the column
	   header and keep numeric rhythm. Colored up/down/flat using the same semantic tokens as
	   the crypto card's 24H change. */
	.tickers-metal-day-cell {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		align-self: center;
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text-faint);
		font-variant-numeric: tabular-nums;
	}
	.tickers-metal-day-cell.up {
		color: var(--rl-color-up);
	}
	.tickers-metal-day-cell.down {
		color: var(--rl-color-down);
	}

	/* Chart section */
	.tickers-chart-section {
		background: var(--rl-color-chart-bg);
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-lg);
		padding: 20px;
	}
	@media (max-width: 639px) {
		.tickers-chart-section {
			margin-left: calc(-1 * var(--rl-space-md));
			margin-right: calc(-1 * var(--rl-space-md));
			border-radius: 0;
			border-left: none;
			border-right: none;
			padding: 10px;
		}
	}
	.tickers-chart-section :global(.tv-lightweight-charts td:nth-child(3)) {
		position: relative !important;
		left: 5px !important;
	}
	.tickers-chart-header {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		margin-bottom: var(--rl-space-md);
		gap: 10px;
	}
	.tickers-chart-sub-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--rl-space-sm);
	}
	.tickers-chart-intervals {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tickers-interval-label {
		font-family: var(--rl-font-sans);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}
	.tickers-chart-tabs {
		display: flex;
		background: var(--rl-color-surface);
		margin: -20px -20px 0;
		padding: var(--rl-space-md) 20px 12px;
		border-radius: var(--rl-radius-lg) var(--rl-radius-lg) 0 0;
		border-bottom: 1px solid var(--rl-color-border);
		gap: 0;
	}
	/* Scrollable tab group — keeps status indicator pinned on overflow */
	.tickers-chart-tabs-scroll {
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}
	.tickers-chart-tabs-scroll::-webkit-scrollbar {
		display: none;
	}
	.tickers-chart-status {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-left: auto;
		flex-shrink: 0;
	}
	@media (max-width: 639px) {
		.tickers-chart-tabs {
			margin: -10px -10px 0;
			padding: 12px 10px 10px;
			border-radius: 0;
		}
	}
	.tickers-candle-sizes {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tickers-candle-label {
		font-family: var(--rl-font-sans);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-faint);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}
	.tickers-candle-chips {
		display: flex;
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-sm);
		overflow: hidden;
	}
	.tickers-candle-chip {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		padding: 5px 9px;
		border: none;
		border-right: 1px solid var(--rl-color-border);
		border-radius: 0;
		color: var(--rl-color-text-subtle);
		background: transparent;
		cursor: pointer;
		transition: all var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-candle-chip:last-child {
		border-right: none;
	}
	.tickers-candle-chip:hover {
		background: rgba(255, 255, 255, 0.03);
		color: var(--rl-color-text);
	}
	.tickers-candle-chip.active {
		background: rgba(232, 230, 227, 0.08);
		color: var(--rl-color-text);
		font-weight: var(--rl-font-semibold);
	}
	.tickers-chart-tab {
		flex-shrink: 0;
		font-family: var(--rl-font-sans);
		font-size: var(--rl-text-xs);
		font-weight: var(--rl-font-medium);
		padding: 6px 12px;
		border: 1px solid var(--rl-color-border);
		border-right: none;
		border-radius: 0;
		color: var(--rl-color-text-subtle);
		background: transparent;
		cursor: pointer;
		transition: all var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-chart-tab:first-child {
		border-radius: var(--rl-radius-sm) 0 0 var(--rl-radius-sm);
	}
	.tickers-chart-tab:last-child {
		border-radius: 0 var(--rl-radius-sm) var(--rl-radius-sm) 0;
		border-right: 1px solid var(--rl-color-border);
	}
	.tickers-chart-tab:hover {
		background: rgba(255, 255, 255, 0.03);
		color: var(--rl-color-text);
	}
	.tickers-chart-tab.active {
		background: color-mix(in srgb, var(--tab-accent) 15%, transparent);
		color: var(--tab-accent);
		border-color: color-mix(in srgb, var(--tab-accent) 30%, transparent);
		font-weight: var(--rl-font-semibold);
	}
	.tickers-chart-tab.active + .tickers-chart-tab {
		border-left-color: color-mix(in srgb, var(--tab-accent) 30%, transparent);
	}
	.tickers-chart-durations {
		display: flex;
		border: 1px solid var(--rl-color-border);
		border-radius: var(--rl-radius-sm);
		overflow: hidden;
	}
	.tickers-duration-chip {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		padding: 5px 9px;
		border: none;
		border-right: 1px solid var(--rl-color-border);
		border-radius: 0;
		color: var(--rl-color-text-subtle);
		background: transparent;
		cursor: pointer;
		transition: all var(--rl-duration-micro) var(--rl-ease-move);
		white-space: nowrap;
	}
	.tickers-duration-chip:last-child {
		border-right: none;
	}
	.tickers-duration-chip:hover {
		background: rgba(255, 255, 255, 0.03);
		color: var(--rl-color-text);
	}
	.tickers-duration-chip.active {
		background: rgba(232, 230, 227, 0.08);
		color: var(--rl-color-text);
		font-weight: var(--rl-font-semibold);
	}

	.tickers-chart-body {
		min-height: 340px;
	}

	.tickers-chart-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--rl-space-sm);
		min-height: 280px;
		color: var(--rl-color-text-faint);
		font-size: var(--rl-text-sm);
		font-style: italic;
	}

	/* Error / stale */
	.tickers-error-card {
		background: var(--rl-color-danger-bg);
		border: 1px solid rgba(196, 78, 78, 0.2);
		border-radius: var(--rl-radius-lg);
		padding: var(--rl-space-xl) 20px;
		text-align: center;
		color: var(--rl-color-danger);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.tickers-retry {
		font-family: var(--rl-font-sans);
		font-size: 13px;
		font-weight: var(--rl-font-medium);
		padding: var(--rl-space-sm) var(--rl-space-md);
		border-radius: var(--rl-radius-sm);
		border: 1px solid var(--rl-color-border);
		color: var(--rl-color-text);
		background: transparent;
		cursor: pointer;
	}
	.tickers-retry:hover {
		border-color: var(--rl-color-text-faint);
	}

	/* Crypto */
	.tickers-crypto-price {
		font-size: var(--rl-text-xl);
	}
	@media (min-width: 640px) {
		.tickers-crypto-price {
			font-size: var(--rl-text-lg);
		}
	}
	.tickers-crypto-change {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-base);
		font-weight: var(--rl-font-bold);
		font-variant-numeric: tabular-nums;
	}
	.tickers-crypto-change.up {
		color: var(--rl-color-up);
	}
	.tickers-crypto-change.down {
		color: var(--rl-color-down);
	}
	.tickers-crypto-pct {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		font-variant-numeric: tabular-nums;
	}
	.tickers-crypto-pct.up {
		color: var(--rl-color-up);
	}
	.tickers-crypto-pct.down {
		color: var(--rl-color-down);
	}
	.tickers-crypto-range {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--rl-space-md);
		padding-top: 12px;
		margin-top: var(--rl-space-xs);
		border-top: 1px solid var(--rl-color-border);
	}
	.tickers-crypto-range-pair {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.tickers-crypto-range-label {
		font-size: var(--rl-text-2xs);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.tickers-crypto-range-value {
		font-family: var(--rl-font-mono);
		font-size: 13px;
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-spread);
		font-variant-numeric: tabular-nums;
	}

	/* Crypto Spots — consolidated grid: BTC/ETH/SOL fixed rows + watchlist rows + permanent
	   input row at the bottom. 7 cols: dot · symbol · LOW · HIGH · PRICE · 24H% · ×. Col 1
	   is 14px — just enough for the 10px brand dot with a 4px breathing strip on the right.
	   Diverges from Forex's 22px ingot column on purpose: dots are smaller than flags so the
	   wider track left dead space; shrinking it lets the dot and the input row's `+` land at
	   the same left edge AND donates ~8px to the four numeric columns for breathing room.
	   Col 7 (16px) is a dedicated × button column populated only on watchlist rows (empty on
	   fixed rows and the header band). */
	.tickers-crypto-spots-grid {
		display: grid;
		grid-template-columns: 14px minmax(2.25rem, auto) 1fr 1fr 1fr 1fr 16px;
		column-gap: 10px;
		row-gap: 12px;
		align-items: center;
	}
	/* Scroll container — flex-fills the card body (parent .tickers-card is flex-column with a
	   hard 20rem cap). `min-height: 0` is required for a flex child to actually shrink below
	   its content's intrinsic size — without it the scroll container would push the card past
	   its 20rem cap. Sticky header + sticky input row keep the legend and add affordance pinned
	   while data rows scroll between them. `overflow-x: hidden` suppresses the spurious
	   horizontal scrollbar browsers add by default with `overflow-y: auto` — col 7's 16px hard
	   track plus the scrollbar gutter can push the grid 1–2px past the container without it. */
	.tickers-crypto-spots-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
	}
	/* Header lives at the top (mirrors Bullion / VCB Forex). Subgrid inherits the parent's
	   7 col tracks so the labels line up pixel-perfect with the data cells below. Sticky-top
	   so the legend stays visible while watchlist rows scroll past. The bg + transition track
	   the parent card's hover state — without them, the sticky band would visibly diverge from
	   the rest of the card on hover. */
	.tickers-crypto-spots-header {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: center;
		position: sticky;
		top: 0;
		background: var(--rl-color-surface);
		z-index: 1;
		transition: background var(--rl-duration-short) var(--rl-ease-move);
	}
	.tickers-card:hover .tickers-crypto-spots-header,
	.tickers-card:hover .tickers-crypto-spots-input-row {
		background: #1f1f1f;
	}
	/* Dot anchored at col 1's left edge (justify-self: start) so it lines up vertically with
	   the input row's `+` glyph below. With col 1 shrunk to 14px the symbol cell still reads
	   as adjacent to the dot — a 4px trailing strip + 10px column-gap = 14px from dot's right
	   to symbol's left, close enough to scan as one identity unit. */
	.tickers-crypto-spots-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--dot, var(--rl-color-text-faint));
		justify-self: start;
	}
	.tickers-crypto-spots-asset {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		letter-spacing: -0.2px;
		color: var(--rl-color-text);
		white-space: nowrap;
	}
	/* Quote suffix on watchlist rows (e.g. "/BTC", "/USDC") — Binance-mobile style: smaller,
	   muted, sits flush with the base label so the pair reads as one token. */
	.tickers-crypto-spots-asset-quote {
		font-size: 0.78em;
		color: var(--rl-color-text-faint);
		font-weight: var(--rl-font-normal);
		margin-inline-start: 1px;
	}
	/* LOW / HIGH — match Bullion's Buy/Sell treatment: same size as PRICE, lighter weight,
	   muted color. The hierarchy reads as "reference cells" against the brighter PRICE headline. */
	.tickers-crypto-spots-num {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-medium);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text-subtle);
		text-align: right;
	}
	/* PRICE — match Bullion's AVG treatment: same size as LOW/HIGH, semibold + bright. The
	   weight + color delta carries the headline emphasis without a font-size jump (an earlier
	   --rl-text-md bold draft made PRICE visibly larger and broke the row's vertical rhythm). */
	.tickers-crypto-spots-price {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text);
		text-align: right;
	}
	.tickers-crypto-spots-pct {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-sm);
		font-weight: var(--rl-font-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--rl-color-text-faint);
		text-align: right;
	}
	.tickers-crypto-spots-pct.up {
		color: var(--rl-color-up);
	}
	.tickers-crypto-spots-pct.down {
		color: var(--rl-color-down);
	}
	/* × on watchlist rows. Negative margin compensates for hit-area padding so the visible glyph
	   sits at the same x as the empty col-7 placeholders on fixed rows. The 2px upward nudge
	   accounts for the font's baseline-anchored render of `×` — the glyph's optical center
	   lands below the line-box's geometric midline (font ascent/descent split is ~75/25, so
	   `line-height: 1` puts the baseline at ~75% from the top), which makes the button read
	   as sagging onto the row's text baseline rather than sitting on its centerline. */
	.tickers-crypto-spots-x {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md);
		line-height: 1;
		color: var(--rl-color-text-faint);
		background: transparent;
		border: none;
		padding: 4px;
		margin: -4px;
		cursor: pointer;
		border-radius: 4px;
		transform: translateY(-2px);
		transition:
			color var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out),
			background var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out);
	}
	.tickers-crypto-spots-x:hover {
		color: var(--rl-color-text);
		background: var(--rl-color-surface-raised);
	}
	/* Permanent input row — sits at the bottom of the grid, always available for adding the
	   next watchlist symbol (no extra click). Subgrid so the faint + indicator drops into col 1
	   and the TickerTabInput spans cols 2–7 with the same column rhythm as the data rows.
	   Sticky-bottom so a long scrolled watchlist doesn't push the add affordance off-screen —
	   the input always reads as the row that "comes next". No extra padding-block: the row
	   shares the grid's `row-gap: 12px` rhythm with the data rows above, so it reads as a
	   continuation rather than a separated band. The bg + transition track the parent card's
	   hover state via the rule above. */
	.tickers-crypto-spots-input-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-items: center;
		position: sticky;
		bottom: 0;
		background: var(--rl-color-surface);
		z-index: 1;
		transition: background var(--rl-duration-short) var(--rl-ease-move);
	}
	/* `+` glyph anchored at col 1's left edge to match the brand dots above (justify-self:
	   start). Visually they share the same leading column position so the input row reads
	   as a continuation of the data rows, just with an "add" affordance instead of an
	   identity color. */
	.tickers-crypto-spots-input-icon {
		justify-self: start;
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md);
		font-weight: var(--rl-font-bold);
		line-height: 1;
		color: var(--rl-color-text-faint);
	}
	.tickers-crypto-spots-input-wrapper {
		grid-column: 2 / -1;
		display: flex;
		align-items: center;
	}
	/* Empty body shown when a blank tab is active (placeholder for future content). */
	.tickers-crypto-blank-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 140px;
	}
	.tickers-crypto-blank-tab-hint {
		font-size: var(--rl-text-sm);
		color: var(--rl-color-text-faint);
		font-style: italic;
	}
	/* Binance tab — official brand yellow (#F0B90B). Tints the label and underline when active.
	   The grid rows below carry their own per-asset brand colors via the dot column. */
	.tickers-card-tab-binance.active {
		color: #f0b90b;
		border-bottom-color: #f0b90b;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
