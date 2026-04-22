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

	// Intentionally capture SSR data once — hook takes over with client-side polling
	const initialTable = page.data.table ?? null
	const initialCrypto = page.data.crypto ?? null
	const initialCryptoCachedAt = page.data.cryptoCachedAt ?? 0
	const initialVN100 = page.data.vn100 ?? null
	const tickers = useTickers({
		table: initialTable,
		crypto: initialCrypto,
		cryptoCachedAt: initialCryptoCachedAt,
		vn100: initialVN100,
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
	// Tab IDs are strings: fixed symbols ('BTC', 'ETH', 'SOL', 'VN100'), watchlist symbols
	// ('ETHUSDT', 'FPT'…), or placeholder pseudo-IDs ('p:1', 'p:2'). Chrome-tab UX — clicking +
	// creates a new placeholder tab in-line, becomes active immediately.
	let cryptoTab = $state<string>('BTC')
	let stockTab = $state<string>('VN100')
	let cryptoPlaceholders = $state<number[]>([])
	let stockPlaceholders = $state<number[]>([])
	let nextPlaceholderId = 1
	// Refs to the scrollable tab strips so adding a placeholder can scroll the new one into view.
	let cryptoTabsEl = $state<HTMLDivElement | null>(null)
	let stockTabsEl = $state<HTMLDivElement | null>(null)

	const FIXED_CRYPTO = new Set(['BTC', 'ETH', 'SOL'])
	const FIXED_STOCK = new Set(['VN100'])
	// Pairs the fixed BTC/ETH/SOL tabs already cover — block them from the picker so the strip
	// can never show two "ETH" tabs (one fixed, one watchlist) that would look like duplicates.
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
		cryptoTab = `p:${id}`
		// Wait for DOM update, then scroll the strip so the new placeholder is visible at the right.
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
		// If the discarded placeholder was active, fall back to the first fixed tab.
		if (cryptoTab === `p:${id}`) cryptoTab = 'BTC'
	}
	function discardStockPlaceholder(id: number) {
		stockPlaceholders = stockPlaceholders.filter((i) => i !== id)
		if (stockTab === `p:${id}`) stockTab = 'VN100'
	}
	function commitCryptoPick(placeholderId: number, symbol: string) {
		cryptoPlaceholders = cryptoPlaceholders.filter((i) => i !== placeholderId)
		cryptoTab = symbol // jump to the freshly-filled tab
	}
	function commitStockPick(placeholderId: number, symbol: string) {
		stockPlaceholders = stockPlaceholders.filter((i) => i !== placeholderId)
		stockTab = symbol
	}
	function removeCryptoSymbol(symbol: string) {
		tickers.watchlist.removeCrypto(symbol)
		if (cryptoTab === symbol) cryptoTab = 'BTC'
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
	// row again to collapse, tap a different row to switch.
	let expandedBullion = $state<'gold' | 'silver' | null>(null)
	function toggleBullionExpand(metal: 'gold' | 'silver') {
		expandedBullion = expandedBullion === metal ? null : metal
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
									<span class="tickers-bullion-sub-asset">
										<img src={flagUrl(code)} alt="" width="18" height="12" loading="lazy" />
										<span class="tickers-bullion-sub-code">{code}</span>
									</span>
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

			{#snippet goldRow()}
				{@const stats = tickers.goldDayStats}
				{@const up = stats ? stats.changePercent > 0 : false}
				{@const down = stats ? stats.changePercent < 0 : false}
				{@const pct = stats ? formatPctSigned(stats.changePercent) : '—'}
				{@const isExpanded = expandedBullion === 'gold'}
				{#if tickers.goldItem}
					{@const avg = (tickers.goldItem.buyLuong + tickers.goldItem.sellLuong) / 2}
					<button
						type="button"
						class="tickers-metal-row"
						class:expanded={isExpanded}
						title="SJC — 999.9 vàng miếng · giá per Lượng · tap for foreign-currency prices"
						aria-expanded={isExpanded}
						aria-controls="bullion-sub-gold"
						onclick={() => toggleBullionExpand('gold')}>
						<span class="tickers-metal-flag">
							<img src={metalIconUrl('gold')} alt="SJC gold" width="22" height="22" />
						</span>
						<span class="tickers-metal-label">Gold</span>
						<span class="tickers-metal-value">{formatKVND(tickers.goldItem.buyLuong)}</span>
						<span class="tickers-metal-value">{formatKVND(tickers.goldItem.sellLuong)}</span>
						<span class="tickers-metal-value tickers-metal-avg">{formatKVND(avg)}</span>
						<span class="tickers-metal-day-cell" class:up class:down>
							{pct}
							<span class="tickers-metal-chevron" aria-hidden="true">
								<ChevronDown size={14} />
							</span>
						</span>
					</button>
					{#if isExpanded}
						{@render bullionSubPanel(
							tickers.goldItem.buyLuong,
							tickers.goldItem.sellLuong,
							'bullion-sub-gold',
						)}
					{/if}
				{/if}
			{/snippet}

			{#snippet silverRow()}
				{@const stats = tickers.silverDayStats}
				{@const up = stats ? stats.changePercent > 0 : false}
				{@const down = stats ? stats.changePercent < 0 : false}
				{@const pct = stats ? formatPctSigned(stats.changePercent) : '—'}
				{@const isExpanded = expandedBullion === 'silver'}
				<!-- Show only the Kg row (largest unit). PQ publishes Lượng + Kg; we pick Kg. -->
				{@const kgItem = tickers.silverKgItem}
				{#if kgItem}
					{@const avg = (kgItem.buyPrice + kgItem.sellPrice) / 2}
					<button
						type="button"
						class="tickers-metal-row"
						class:expanded={isExpanded}
						title="Phú Quý — 999 silver ingot · giá per Kg · tap for foreign-currency prices"
						aria-expanded={isExpanded}
						aria-controls="bullion-sub-silver"
						onclick={() => toggleBullionExpand('silver')}>
						<span class="tickers-metal-flag">
							<img src={metalIconUrl('silver')} alt="PQ silver" width="22" height="22" />
						</span>
						<span class="tickers-metal-label">Silver</span>
						<span class="tickers-metal-value">{formatKVND(kgItem.buyPrice)}</span>
						<span class="tickers-metal-value">{formatKVND(kgItem.sellPrice)}</span>
						<span class="tickers-metal-value tickers-metal-avg">{formatKVND(avg)}</span>
						<span class="tickers-metal-day-cell" class:up class:down>
							{pct}
							<span class="tickers-metal-chevron" aria-hidden="true">
								<ChevronDown size={14} />
							</span>
						</span>
					</button>
					{#if isExpanded}
						{@render bullionSubPanel(kgItem.buyPrice, kgItem.sellPrice, 'bullion-sub-silver')}
					{/if}
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
						<div class="tickers-metal-header">
							<span></span>
							<span></span>
							<span class="tickers-metal-col-label">Buy</span>
							<span class="tickers-metal-col-label">Sell</span>
							<span class="tickers-metal-col-label">Avg</span>
							<span class="tickers-metal-col-label">24H</span>
						</div>
						{@render goldRow()}
						{@render silverRow()}
					</div>
					<div class="tickers-metal-footer-note">Gold per Lượng · Silver per Kg · 1 kVND = 1,000 VND</div>
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
								<div class="tickers-forex-header" role="row">
									<span aria-hidden="true"></span>
									<span aria-hidden="true"></span>
									<span role="columnheader" class="tickers-forex-col-num">Buy</span>
									<span role="columnheader" class="tickers-forex-col-num">Sell</span>
									<span role="columnheader" class="tickers-forex-col-num">Avg</span>
									<span role="columnheader" class="tickers-forex-col-num">24h</span>
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

			<!-- Crypto Card (BTC / ETH / SOL tabs) -->
			<div class="tickers-card">
				<div class="tickers-card-header">
					<div class="tickers-card-tabs" bind:this={cryptoTabsEl} onwheel={horizontalWheel}>
						{#each CRYPTO as coin}
							<button
								class="tickers-card-tab"
								class:active-crypto={cryptoTab === coin.id}
								style:--crypto-accent={coin.accent}
								onclick={() => (cryptoTab = coin.id)}>
								{coin.id}
							</button>
						{/each}
						{#each tickers.watchlist.crypto as symbol (symbol)}
							{@const fmt = formatCryptoDisplay(symbol)}
							{@const accent = brandFor(symbol)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<button
									class="tickers-card-tab tickers-card-tab-watchlist"
									class:active={cryptoTab === symbol && !accent}
									class:active-branded={cryptoTab === symbol && accent}
									style:--brand-accent={accent}
									onclick={() => (cryptoTab = symbol)}>
									{fmt.primary}{#if fmt.suffix}<span class="tickers-card-tab-quote">{fmt.suffix}</span
										>{/if}
								</button>
								<button
									class="tickers-card-tab-x"
									onclick={() => removeCryptoSymbol(symbol)}
									title="Remove from watchlist">
									×
								</button>
							</span>
						{/each}
						{#each cryptoPlaceholders as id (id)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<TickerTabInput
									type="crypto"
									add={tickers.watchlist.addCrypto}
									has={(s) => tickers.watchlist.hasCrypto(s) || RESERVED_CRYPTO.has(s)}
									onPick={(symbol) => commitCryptoPick(id, symbol)}
									onClose={() => discardCryptoPlaceholder(id)} />
								<button
									class="tickers-card-tab-x"
									onclick={() => discardCryptoPlaceholder(id)}
									title="Discard">
									×
								</button>
							</span>
						{/each}
						<!-- + sits inside the scroll container with position:sticky so it hugs the rightmost
						     tab when content fits, and docks to the right edge when content overflows.
						     Hidden once the watchlist hits its cap so the user can't open empty placeholders
						     they wouldn't be able to fill. -->
						{#if cryptoSlotsUsed < tickers.watchlist.cap}
							<button
								class="tickers-card-tab tickers-card-tab-add"
								onclick={addCryptoPlaceholder}
								title="Add crypto ticker">
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

				{#if cryptoTab.startsWith('p:')}
					<!-- Empty body while user types in the tab-strip input; popover shows results there. -->
				{:else if !FIXED_CRYPTO.has(cryptoTab)}
					{@const item = tickers.getCryptoTickerBySymbol(cryptoTab)}
					{@const split = splitCryptoSymbol(cryptoTab)}
					{@const quote = split?.quote ?? 'USDT'}
					{#if item}
						{@const up = item.priceChange >= 0}
						<div class="tickers-price-row">
							<span class="tickers-price-label">Price</span>
							<div class="tickers-price-value-wrap">
								<span class="tickers-price-value tickers-crypto-price"
									>{formatCryptoPrice(item.lastPrice, quote)}</span>
								<span class="tickers-price-unit">{quote}</span>
							</div>
						</div>
						<div class="tickers-price-row">
							<span class="tickers-price-label">24H Change</span>
							<div class="tickers-price-value-wrap">
								<span class="tickers-crypto-change" class:up class:down={!up}>
									{up ? '+' : ''}{formatCryptoPrice(item.priceChange, quote)}
								</span>
								<span class="tickers-crypto-pct" class:up class:down={!up}>
									({up ? '+' : ''}{item.priceChangePercent.toFixed(2)}%)
								</span>
							</div>
						</div>
						<div class="tickers-crypto-range">
							<span class="tickers-crypto-range-pair">
								<span class="tickers-crypto-range-label">L</span>
								<span class="tickers-crypto-range-value"
									>{formatCryptoPrice(item.lowPrice, quote)}</span>
							</span>
							<span class="tickers-crypto-range-pair">
								<span class="tickers-crypto-range-label">H</span>
								<span class="tickers-crypto-range-value"
									>{formatCryptoPrice(item.highPrice, quote)}</span>
							</span>
						</div>
					{:else}
						<div class="tickers-price-row">
							<Skeleton class="h-6 w-32" />
						</div>
					{/if}
				{:else if tickers.getCryptoTicker(cryptoTab as 'BTC' | 'ETH' | 'SOL')}
					{@const item = tickers.getCryptoTicker(cryptoTab as 'BTC' | 'ETH' | 'SOL')!}
					{@const up = item.priceChange >= 0}
					<div class="tickers-price-row">
						<span class="tickers-price-label">Price</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value tickers-crypto-price">{formatUSDT(item.lastPrice)}</span>
							<span class="tickers-price-unit">USDT</span>
						</div>
					</div>
					<div class="tickers-price-row">
						<span class="tickers-price-label">24H Change</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-crypto-change" class:up class:down={!up}>
								{up ? '+' : ''}{formatUSDT(item.priceChange)}
							</span>
							<span class="tickers-crypto-pct" class:up class:down={!up}>
								({up ? '+' : ''}{item.priceChangePercent.toFixed(2)}%)
							</span>
						</div>
					</div>
					<div class="tickers-crypto-range">
						<span class="tickers-crypto-range-pair">
							<span class="tickers-crypto-range-label">L</span>
							<span class="tickers-crypto-range-value">{formatUSDT(item.lowPrice)}</span>
						</span>
						<span class="tickers-crypto-range-pair">
							<span class="tickers-crypto-range-label">H</span>
							<span class="tickers-crypto-range-value">{formatUSDT(item.highPrice)}</span>
						</span>
					</div>
				{:else}
					<div class="tickers-price-row">
						<Skeleton class="h-6 w-32" />
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
									>{new Intl.NumberFormat('en-US', { notation: 'compact' }).format(
										q.accumulatedVol,
									)}</span>
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
						{#each [{ id: 'gold' as string, label: 'Gold', accent: '#c9a84c' }, { id: 'silver', label: 'Silver', accent: '#8a94a8' }, ...CRYPTO.map( (c) => ({ id: c.id, label: c.id, accent: c.accent }), ), ...tickers.watchlist.crypto.map( (s) => {
									const fmt = formatCryptoDisplay(s)
									return { id: s, label: fmt.primary + fmt.suffix, accent: brandFor(s) ?? '#6b8aad' }
								}, ), { id: 'VN100', label: 'VN100', accent: '#b87333' }, ...tickers.watchlist.stocks.map( (s) => ({ id: s, label: s, accent: '#b87333' }), )] as tab (tab.id)}
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

			<LoadingOverlay loading={tickers.chartLoading} accentColor={CHART_ACCENTS[tickers.chartAsset] ?? '#4a9eff'}>
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
	.tickers-card:hover {
		background: var(--rl-color-surface-raised);
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
	.tickers-card-tab.active-crypto {
		color: var(--crypto-accent);
		border-bottom-color: var(--crypto-accent);
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
	/* Branded active state — base asset matches a known token; tint both label and underline. */
	.tickers-card-tab-watchlist.active-branded {
		color: var(--brand-accent);
		border-bottom-color: var(--brand-accent);
	}
	/* Quote suffix on watchlist tabs ("/BTC", "/USDC") — Binance-mobile style: smaller, muted, but
	   tracks the parent's hover/active so it doesn't feel inert next to a brightening base label. */
	.tickers-card-tab-quote {
		font-size: 0.78em;
		color: var(--rl-color-text-faint);
		font-weight: var(--rl-font-normal);
		transition: color var(--rl-duration-micro) var(--rl-ease-move);
	}
	.tickers-card-tab-watchlist:hover .tickers-card-tab-quote,
	.tickers-card-tab-watchlist.active .tickers-card-tab-quote,
	.tickers-card-tab-watchlist.active-branded .tickers-card-tab-quote {
		color: var(--rl-color-text-subtle);
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
		/* Numeric columns are `1fr` (proportional) — defined tracks, so subgrid sub-rows
		   cannot push them wider no matter how long a value like "9.396.914" (KRW) gets.
		   That keeps BUY/SELL/AVG/24H pinned while expanding/collapsing the sub-forex
		   panel, and the grid naturally fills the card width so the 24H column anchors
		   to the card's right edge at every viewport (phone, 2-col tablet, desktop). */
		grid-template-columns: 22px 3rem 1fr 1fr 1fr 1fr;
		column-gap: 10px;
		row-gap: var(--rl-space-xs);
		padding: var(--rl-space-sm) 0 0;
	}
	/* Header, data rows, AND sub-rows are each their own subgrid inheriting the parent's
	   6 tracks. Subgrid preserves column alignment automatically — main row "Gold 167.500"
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
	button.tickers-metal-row:hover {
		background: rgba(255, 255, 255, 0.03);
	}
	button.tickers-metal-row:focus-visible {
		outline: 2px solid var(--rl-color-border-strong);
		outline-offset: -2px;
	}
	/* Flag cell — ingot icon occupying the 18px fixed-width leading column. Same column
	   position the VCB Forex flag column claims, so when the sub-panel renders country
	   flags below, they line up in the same track. Source attribution (SJC / Phú Quý)
	   lives on the row's `title` tooltip instead of stealing horizontal space on mobile. */
	.tickers-metal-flag {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.tickers-metal-flag img {
		display: block;
		width: 22px;
		height: 22px;
	}
	.tickers-metal-label {
		font-size: var(--rl-text-xs);
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text);
		letter-spacing: 0.2px;
	}
	.tickers-metal-header {
		padding: var(--rl-space-xs) 0;
		border-bottom: 1px solid var(--rl-color-border);
		/* Matches .tickers-forex-header — header stays at --rl-color-surface while the card
		   lifts to --rl-color-surface-raised on hover, producing a subtle band that makes the
		   header pop from the data rows. Same token choice as forex for visual consistency. */
		background: var(--rl-color-surface);
	}
	/* Pull the last column's right-aligned text in from the card edge — matches VCB Forex's
	   `padding-inline-end: var(--rl-space-sm)` treatment on its header+row containers so the
	   rightmost cell doesn't bump the right edge. */
	.tickers-metal-header > :last-child,
	button.tickers-metal-row > :last-child {
		padding-inline-end: var(--rl-space-sm);
	}
	.tickers-metal-col-label {
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		text-align: right;
	}
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
	/* Chevron — tiny visual hint that the row expands. Lives INSIDE the 24H day cell
	   (not a dedicated column), sitting to the right of the `%` value with a small gap.
	   Rotates 180° when the row's `.expanded` class is active. aria-expanded on the row
	   carries the a11y state; class:expanded drives only the rotation. */
	.tickers-metal-chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-inline-start: var(--rl-space-2xs);
		color: var(--rl-color-text-faint);
		transition: transform var(--rl-duration-micro) var(--rl-ease-move);
	}
	button.tickers-metal-row.expanded .tickers-metal-chevron {
		transform: rotate(180deg);
	}
	/* Foreign-currency sub-panel — appears when a metal row is tapped. Spans all 6 parent
	   columns via `grid-column: 1 / -1` AND subgrids to the parent tracks, so sub-row cells
	   land in the exact same columns as the main row above: USD's buy sits under BUY, its
	   sell under SELL, etc. Empty spans in the 24h + chevron slots hold the final two
	   columns open so the subgrid stays aligned.

	   No layout jump: the parent grid's buy/sell tracks are 1fr (proportional, not
	   content-sized), so the sub-panel's long values like "1,022,741" can't push those
	   columns wider. `auto` tracks (label, 24h) are only fed by main rows since sub-rows
	   leave them empty. Scrollbar styling mirrors VCB Forex exactly. */
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
	.tickers-bullion-sub-row > :last-child {
		padding-inline-end: var(--rl-space-sm);
	}
	/* Asset cell — spans the parent's col 1 (ingot) + col 2 (label) and centers the
	   flag+code pair across the combined span. Visually the flag lands right around the
	   col 1/col 2 boundary — between the parent's ingot icon and "Gold"/"Silver" label —
	   which reads as a nested child hanging under its parent's identity slot rather than
	   a competing label. */
	.tickers-bullion-sub-asset {
		grid-column: 1 / 3;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--rl-space-2xs);
	}
	.tickers-bullion-sub-asset img {
		display: block;
		width: 18px;
		height: 12px;
		border-radius: 1px;
	}
	.tickers-bullion-sub-code {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		letter-spacing: 0.3px;
	}
	.tickers-bullion-sub-value {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-xs);
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
		max-height: 19rem;
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
		/* Symmetric vertical padding so header text sits centered in its band instead of hugging
		   the scroll container's top edge. padding-inline-end mirrors the same reservation on rows
		   below — without it, the rightmost header label (24h) sits flush against the scrollbar. */
		padding: var(--rl-space-xs) var(--rl-space-sm) var(--rl-space-xs) 0;
		border-bottom: 1px solid var(--rl-color-border);
		/* Sticky inside the scroll container — keeps column labels visible as rows scroll. */
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--rl-color-surface);
	}
	.tickers-forex-col-num {
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		text-align: right;
	}
	.tickers-forex-row {
		/* padding-inline-end matches the header — keeps the 24h column from sitting flush against
		   the scrollbar gutter reserved by scrollbar-gutter:stable on the container. Vertical
		   10px opens breathing room between rows (previously 6px felt cramped for 20+ rows). */
		padding: 10px var(--rl-space-sm) 10px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}
	.tickers-forex-row:first-child {
		border-top: none;
	}
	/* Hairline divider between Tier A (pinned 5) and Tier B — strong enough to register the
	   group change without a label. Uses border-strong (gray-600) rather than border (gray-700)
	   so it reads above the near-invisible inter-row rule at rgba(255,255,255,0.04). */
	.tickers-forex-row.tickers-forex-tier-divider {
		border-top: 1px solid var(--rl-color-border-strong);
		margin-top: 4px;
		padding-top: 10px;
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

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
