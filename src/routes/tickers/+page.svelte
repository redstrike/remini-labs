<script lang="ts">
	import {
		useTickers,
		VN_STOCK_FIXED,
		formatVND,
		formatKVND,
		formatPctSigned,
		formatUSDT,
		formatVnIndex,
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
	import { isVnIndex, type IndexQuote, type StockQuote } from './shared/ssi-iboard-client'
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
	const initialVnStockFixed = page.data.vnStockFixed ?? []
	const initialGoldChart = page.data.goldChart ?? null
	const tickers = useTickers({
		metals: initialMetals,
		metalsCachedAt: initialMetalsCachedAt,
		crypto: initialCrypto,
		cryptoCachedAt: initialCryptoCachedAt,
		vnStockFixed: initialVnStockFixed,
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
		VNINDEX: '#b87333', // VN copper — broadest market index, no canonical brand color
		VN30: '#b87333', // Same copper — large-cap index, no canonical brand color
		VNMID: '#b87333', // Same copper — mid-cap index, no canonical brand color
		VCB: '#3a9961', // Vietcombank green (matches VN_BRAND_COLORS['VCB'])
	}

	// Volume "compact" formatter (e.g. 168.5M, 12.3K) — module-scope so we don't construct a
	// fresh Intl.NumberFormat per VN-stock-quote render. Same memoization rationale as
	// `shared/number-format.ts`.
	const compactNumberFormat = new Intl.NumberFormat('vi-VN', { notation: 'compact' })

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
	// Markets card holds two real data-source tabs side-by-side — 'binance' (canonical crypto Spots)
	// + 'vn100' (VN_STOCK_FIXED rows + VN watchlist equities) — plus placeholder pseudo-IDs
	// ('p:1', 'p:2') for blank tabs reserved for future content (per-exchange views, notes/alerts,
	// custom panels, etc.). The freshness dot + refresh button in the card header swap source
	// based on the active tab — same pattern as the Bullion card's metals-vs-forex swap.
	let marketsCardTab = $state<string>('binance')
	let cryptoPlaceholders = $state<number[]>([])
	let nextPlaceholderId = 1
	// Permanent ticker-input rows at the bottom of each tab's grid auto-clear via these keys —
	// any successful pick or Escape bumps them to force-remount the TickerTabInput component
	// (whose internal `query` state doesn't reset on its own after `add` succeeds).
	let cryptoInputKey = $state(0)
	let stockInputKey = $state(0)
	// Ref to the scrollable tab strip so adding a placeholder can scroll the new one into view.
	let marketsCardTabsEl = $state<HTMLDivElement | null>(null)
	// Refs to per-tab body scroll containers — used to auto-scroll the freshly added watchlist row
	// into view (sticky input row can sit on top of the new entry on a long list otherwise).
	let cryptoSpotsScrollEl = $state<HTMLDivElement | null>(null)
	let stockSpotsScrollEl = $state<HTMLDivElement | null>(null)

	// Pairs the fixed BTC/ETH/SOL rows already cover — block them from the picker so the watchlist
	// can never duplicate a fixed major (an "ETH" watchlist row alongside the fixed ETH row would
	// look broken).
	const RESERVED_CRYPTO = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
	// Fixed VN-stock rows (VN_STOCK_FIXED — currently VNINDEX / VN30 / VNMID / VCB) already render at the top of the VN-Stock tab
	// body — block the picker from also adding them as watchlist rows (would render twice).
	// Same role as RESERVED_CRYPTO above for the Binance tab's BTC/ETH/SOL fixed rows. Sourced
	// from `VN_STOCK_FIXED` so the two stay in lock-step.
	const RESERVED_STOCKS = new Set<string>(VN_STOCK_FIXED)

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

	// Brand colors for VN-market equities — applied to the watchlist row's leading dot inside
	// the VN-Stock tab. Hues are slightly desaturated from canonical brand identity to fit the
	// OLED dark palette (same treatment as the crypto `BRAND_COLORS` above). Coverage focuses on
	// the VN30 / VN100 / VNDIAMOND / VNFINLEAD constituents — the high-liquidity names users are
	// most likely to add to their watchlist. Indices (VN30, VNDIAMOND, HNXINDEX, …) are colored
	// by today's direction (up/down/flat) inside `brandForVnRow` instead of getting a brand entry
	// here — there's no "VNDIAMOND brand color" anyway, but a green/red sentiment dot tells the
	// user something useful at a glance. ETFs and unmapped equities fall through to the generic
	// VN copper. New entries: pick the dominant color from the company's wordmark or primary
	// logo, then nudge saturation down ~10–15% so the dot reads as accent, not glare.
	const VN_BRAND_COLORS: Record<string, string> = {
		// Banks — green / blue / red are the dominant tribal colors in VN banking
		VCB: '#3a9961', // Vietcombank green (canonical)
		BID: '#2f9968', // BIDV green-teal — slightly different from VCB to read as distinct
		CTG: '#3878c4', // VietinBank blue
		VPB: '#3aa572', // VPBank green (brighter than VCB)
		MBB: '#d44a4a', // MB Bank red
		TCB: '#e84545', // Techcombank vivid red
		ACB: '#3a78b8', // ACB blue
		HDB: '#e87a3a', // HDBank orange
		TPB: '#7a5cc4', // TPBank purple
		VIB: '#e89a45', // VIB orange
		MSB: '#c44a4a', // Maritime Bank red
		STB: '#5cb5d8', // Sacombank cyan
		SHB: '#d44a3a', // SHB red-orange
		LPB: '#3aaab5', // LienVietPostBank teal
		OCB: '#e88a3a', // OCB orange
		EIB: '#3a78b5', // Eximbank blue
		// Vingroup family — share the iconic Vingroup red
		VIC: '#d4453a',
		VHM: '#d4453a',
		VRE: '#d4453a',
		// Steel / industrials
		HPG: '#d8593a', // Hoa Phat Group red-orange
		HSG: '#3a8db5', // Hoa Sen blue
		NKG: '#98a4b0', // Nam Kim silver-gray
		POM: '#a8a4b0', // Pomina silver
		// Tech / IT
		FPT: '#f17a3a', // FPT orange
		CMG: '#3a6bc4', // CMC blue
		ELC: '#3a8db8', // Elcom blue
		// Energy / Oil & Gas
		GAS: '#3a99c4', // PV Gas blue
		PLX: '#d8a83a', // Petrolimex yellow (the iconic gold-yellow)
		PVS: '#3a5c8f', // PV Tech Services dark blue
		PVD: '#3a6f9f', // PV Drilling
		BSR: '#c44a4a', // Binh Son Refinery red
		POW: '#c84a4a', // PV Power red
		PVT: '#3a78c4', // PV Trans blue
		// Fertilizer / Chemicals
		DGC: '#4aa05c', // Duc Giang Chemicals green
		DCM: '#5cab68', // Ca Mau Fertilizer green
		DPM: '#3a78c4', // Phu My Fertilizer blue
		GVR: '#4aa068', // Vietnam Rubber Group green
		// Cement / Industrial parks / Construction
		BCM: '#c45a4a', // Becamex red
		HT1: '#a8a4b0', // Ha Tien Cement gray
		IDC: '#3a78b5', // Idico blue
		KBC: '#3a8bc4', // Kinh Bac blue
		SZC: '#3aaba0', // Sonadezi teal-green
		BCC: '#a8a4a8', // Bim Son Cement gray
		// Consumer goods / Food / Beverage
		MWG: '#f0c43a', // Mobile World yellow (their signature)
		MSN: '#c44a4a', // Masan red
		VNM: '#3a8fd8', // Vinamilk vibrant blue (post-2023 rebrand)
		SAB: '#e8b53a', // Sabeco / Saigon Beer yellow
		BHN: '#c43a45', // Habeco / Hanoi Beer red
		KDC: '#e89a3a', // Kido orange
		// Aviation
		VJC: '#e8453a', // Vietjet Air red
		HVN: '#3a78a8', // Vietnam Airlines blue (with the cyan-blue tail livery)
		ACV: '#3a99c4', // Airports Corp Vietnam blue
		// Brokers / Securities
		SSI: '#3a9968', // SSI Securities green
		VND: '#e8c43a', // VNDirect yellow
		HCM: '#3a78c4', // HSC blue
		VCI: '#c44a3a', // Viet Capital Securities red
		BSI: '#3a8bc4', // BSC blue
		MBS: '#c44a4a', // MB Securities red (parent MB Bank)
		FTS: '#f17a3a', // FPTS orange (parent FPT)
		// Real estate
		NVL: '#4a9f5a', // Novaland green
		KDH: '#4aa08f', // Khang Dien blue-green
		DXG: '#5cab5c', // Dat Xanh green
		PDR: '#e89a45', // Phat Dat orange
		DIG: '#3a8bc4', // DIC Group blue
		HDG: '#c44a4a', // Ha Do red
		NLG: '#4a9f5a', // Nam Long green
		HDC: '#3a8bb5', // Ho Chi Minh Construction blue
		// Utilities / Power
		REE: '#3a8bc4', // REE blue
		GEX: '#c44a3a', // Gelex red
		PPC: '#3a78b8', // Pha Lai Power blue
		NT2: '#3a99b5', // Nhon Trach 2 Power teal
		// Pharma / Healthcare
		PNJ: '#d8a83a', // PNJ jewelry gold
		DHG: '#4aa05c', // DHG Pharma green
		IMP: '#3aa078', // Imexpharm green-teal
		DBD: '#5cab68', // Binh Dinh Pharma green
		DVN: '#3a99b5', // Vietnam Pharmaceutical teal
		TRA: '#4a9f6a', // Traphaco green
		// Logistics / Transport
		GMD: '#3a78c4', // Gemadept blue
		HAH: '#3a8bb5', // Hai An Transport blue
		VTP: '#e84a3a', // Viettel Post red
		// Retail / Distribution
		FRT: '#f17a3a', // FPT Retail orange (parent FPT)
		DGW: '#3a8bc4', // Digiworld blue
		PET: '#c44a4a', // Petrosetco red
		// Misc large caps
		VEA: '#3a78b8', // VEAM blue
		PHR: '#4aa068', // Phuoc Hoa Rubber green
		DRC: '#a8a4b0', // Da Nang Rubber gray
		CSM: '#3a8bb5', // Casumina blue
		AAA: '#3a8bc4', // An Phat Bioplastics blue
		ANV: '#3a99b5', // Nam Viet Aquaculture teal
		VHC: '#3aa0a8', // Vinh Hoan teal
		HSL: '#4a9f5a', // Hoang Son Luna green
		DPR: '#4aa068', // Dong Phu Rubber green
	}

	/** Dot color for a VN watchlist row. Equities use the brand map (VCB green, FPT orange, …);
	 * indices (VN30, VNDIAMOND, HNXINDEX, …) use today's direction — green for up, red for down,
	 * faint gray for flat / no data. Anything unmapped falls through to the generic VN copper.
	 * `q` is optional so the dot can render a sane copper before the live quote arrives. */
	function brandForVnRow(symbol: string, q: StockQuote | IndexQuote | null | undefined): string {
		if (isVnIndex(symbol)) {
			const pct = q?.pctChange
			if (pct === undefined) return 'var(--rl-color-text-faint)'
			if (pct > 0) return 'var(--rl-color-up)'
			if (pct < 0) return 'var(--rl-color-down)'
			return 'var(--rl-color-text-faint)'
		}
		return VN_BRAND_COLORS[symbol] ?? 'var(--rl-color-asset-vn100)'
	}

	// VN-iBoard 5-state price-color rule for the VN-Stock tab. Equity rows ONLY — indices
	// (VNINDEX / VN30 / VNMID / etc.) have no regulatory band, so their Price cell skips this
	// rule and renders plain bright.
	// Order matters: ceiling/floor checks come first so a stock at the band edge isn't misread
	// as "up/down vs ref"; flat (price === refPrice) is the fallthrough.
	function computePriceColor(q: StockQuote): 'ceiling' | 'floor' | 'up' | 'down' | 'flat' {
		if (q.price >= q.ceiling) return 'ceiling'
		if (q.price <= q.floor) return 'floor'
		if (q.price > q.refPrice) return 'up'
		if (q.price < q.refPrice) return 'down'
		return 'flat'
	}

	// Smoothly scroll a container element to the bottom — used after appending a watchlist row
	// so the freshly-added entry lands in the visible window even on a long scrolled-down list.
	// No-op when `el` is null (the bind:this hasn't resolved yet — defensive guard).
	function scrollToBottomSmooth(el: HTMLElement | null): void {
		el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
	}

	function addPlaceholderTab() {
		const id = nextPlaceholderId++
		cryptoPlaceholders = [...cryptoPlaceholders, id]
		marketsCardTab = `p:${id}` // jump to the freshly-created blank tab
		tick().then(() => {
			if (marketsCardTabsEl) marketsCardTabsEl.scrollLeft = marketsCardTabsEl.scrollWidth
		})
	}
	function discardPlaceholderTab(id: number) {
		cryptoPlaceholders = cryptoPlaceholders.filter((i) => i !== id)
		// If the discarded tab was active, fall back to the canonical Binance view.
		if (marketsCardTab === `p:${id}`) marketsCardTab = 'binance'
	}
	function removeCryptoSymbol(symbol: string) {
		tickers.watchlist.removeCrypto(symbol)
	}
	function removeStockSymbol(symbol: string) {
		tickers.watchlist.removeStock(symbol)
	}

	// Chart-tab list — fixed metals/crypto/VN_STOCK_FIXED anchors plus per-watchlist entries. Memoized via
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
		...VN_STOCK_FIXED.map((s) => ({ id: s as string, label: s, accent: CHART_ACCENTS[s] ?? '#b87333' })),
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
					<div class="tickers-card-tabs" bind:this={marketsCardTabsEl} onwheel={horizontalWheel}>
						<button
							class="tickers-card-tab tickers-card-tab-binance"
							class:active={marketsCardTab === 'binance'}
							onclick={() => (marketsCardTab = 'binance')}>
							Binance
						</button>
						<button
							class="tickers-card-tab"
							class:active-vn100={marketsCardTab === 'vn100'}
							style:--vn100-accent="var(--rl-color-asset-vn100)"
							onclick={() => (marketsCardTab = 'vn100')}>
							VN Stock
						</button>
						<!-- Blank tabs reserved for future content (per-exchange views, notes, alerts,
						     custom panels, etc.). Body is intentionally empty until a use case lands. -->
						{#each cryptoPlaceholders as id (id)}
							<span class="tickers-card-tab-wrap" transition:expandX>
								<button
									class="tickers-card-tab"
									class:active={marketsCardTab === `p:${id}`}
									onclick={() => (marketsCardTab = `p:${id}`)}>
									Tab {id}
								</button>
								<button
									class="tickers-card-tab-x"
									onclick={() => discardPlaceholderTab(id)}
									title="Close tab">
									×
								</button>
							</span>
						{/each}
						<!-- + opens a new blank tab (future use cases — notes, alerts, per-exchange views).
						     Watchlist additions happen via the permanent input row inside each data tab,
						     not here. Capped at watchlist.cap to prevent runaway blank-tab accumulation. -->
						{#if cryptoPlaceholders.length < tickers.watchlist.cap}
							<button
								class="tickers-card-tab tickers-card-tab-add"
								onclick={addPlaceholderTab}
								title="Open new tab">
								+
							</button>
						{/if}
					</div>
					<div class="tickers-card-status">
						{#if marketsCardTab === 'vn100'}
							<FreshnessDot elapsed={tickers.stocksElapsed} ttl={tickers.stocksTtl} />
							<button
								class="tickers-card-refresh"
								onclick={() => tickers.refreshStocks()}
								disabled={fetchingStocks}
								title="Refresh VN stocks">
								<SpinnerIcon
									size={10}
									class={fetchingStocks ? 'tickers-spinner' : ''}
									style={fetchingStocks ? `animation-duration: ${STOCKS_SPIN_MS}ms` : ''} />
							</button>
						{:else}
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
						{/if}
					</div>
				</div>

				{#if marketsCardTab === 'binance'}
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
													tick().then(() => scrollToBottomSmooth(cryptoSpotsScrollEl))
												}}
												onClose={() => (cryptoInputKey += 1)}
												minWidthCh={6} />
										{/key}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if marketsCardTab === 'vn100'}
					<div class="tickers-stock-spots-scroll" bind:this={stockSpotsScrollEl}>
						<div class="tickers-stock-spots-grid">
							<!-- Top header (mirrors Bullion / VCB Forex / Binance pattern). Sticky so the
							     legend stays visible while watchlist rows scroll past. -->
							<div class="tickers-table-header tickers-stock-spots-header">
								<span></span>
								<span></span>
								<span class="tickers-table-col-label">Floor</span>
								<span class="tickers-table-col-label">Ceil</span>
								<span class="tickers-table-col-label">Price</span>
								<span class="tickers-table-col-label">%Chg</span>
								<span></span>
							</div>

							<!-- Fixed rows (VN_STOCK_FIXED): VNINDEX, VN30, VNMID, VCB — analog to BTC/ETH/SOL
							     on the Binance tab. Mix of indices (VNINDEX, VN30, VNMID — Floor/Ceil → `—`, plain bright
							     Price) and equities (VCB — Floor/Ceil from StockQuote with the VN-iBoard
							     5-state Price color rule). The brand dot is directional for indices (via
							     brandForVnRow's isVnIndex branch) and brand-colored for equities (VCB green).
							     Col 7 left empty — fixed rows can't be removed via ×. Type-guard via
							     `'price' in q` mirrors the watchlist row block below. -->
							{#each VN_STOCK_FIXED as symbol (symbol)}
								{@const q = tickers.getStockQuote(symbol)}
								<span class="tickers-stock-spots-dot" style:--dot={brandForVnRow(symbol, q)}></span>
								<span class="tickers-stock-spots-asset">{symbol}</span>
								{#if q && 'price' in q}
									{@const priceColor = computePriceColor(q)}
									<span class="tickers-stock-spots-num">{formatStockPrice(q.floor)}</span>
									<span class="tickers-stock-spots-num">{formatStockPrice(q.ceiling)}</span>
									<span class="tickers-stock-spots-price" data-color={priceColor}>
										{formatStockPrice(q.price)}
									</span>
									<span
										class="tickers-stock-spots-pct"
										class:up={q.pctChange > 0}
										class:down={q.pctChange < 0}>
										{formatPctSigned(q.pctChange)}
									</span>
								{:else if q}
									<span class="tickers-stock-spots-num">—</span>
									<span class="tickers-stock-spots-num">—</span>
									<span class="tickers-stock-spots-price">{formatVnIndex(q.close)}</span>
									<span
										class="tickers-stock-spots-pct"
										class:up={q.change > 0}
										class:down={q.change < 0}>
										{formatPctSigned(q.pctChange)}
									</span>
								{:else}
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-5 w-full" />
									<Skeleton class="h-4 w-full" />
								{/if}
								<span></span><!-- col 7 empty: fixed row, no × -->
							{/each}

							<!-- Rows N+1..: watchlist VN entries — equities (StockQuote) AND indices like VN30
							     / VNDIAMOND (IndexQuote, routed via fetchIndexQuote). Same type-guarded shape
							     as the fixed rows above; the only divergence is col 7 (× button for removal). -->
							{#each tickers.watchlist.stocks as symbol (symbol)}
								{@const q = tickers.getStockQuote(symbol)}
								<span class="tickers-stock-spots-dot" style:--dot={brandForVnRow(symbol, q)}></span>
								<span class="tickers-stock-spots-asset">{symbol}</span>
								{#if q && 'price' in q}
									{@const priceColor = computePriceColor(q)}
									<span class="tickers-stock-spots-num">{formatStockPrice(q.floor)}</span>
									<span class="tickers-stock-spots-num">{formatStockPrice(q.ceiling)}</span>
									<span class="tickers-stock-spots-price" data-color={priceColor}>
										{formatStockPrice(q.price)}
									</span>
									<span
										class="tickers-stock-spots-pct"
										class:up={q.pctChange > 0}
										class:down={q.pctChange < 0}>
										{formatPctSigned(q.pctChange)}
									</span>
								{:else if q}
									<span class="tickers-stock-spots-num">—</span>
									<span class="tickers-stock-spots-num">—</span>
									<span class="tickers-stock-spots-price">{formatVnIndex(q.close)}</span>
									<span
										class="tickers-stock-spots-pct"
										class:up={q.change > 0}
										class:down={q.change < 0}>
										{formatPctSigned(q.pctChange)}
									</span>
								{:else}
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-4 w-full" />
									<Skeleton class="h-5 w-full" />
									<Skeleton class="h-4 w-full" />
								{/if}
								<button
									class="tickers-stock-spots-x"
									onclick={() => removeStockSymbol(symbol)}
									aria-label="Remove {symbol}">
									×
								</button>
							{/each}

							<!-- Permanent input row at the table bottom while watchlist has room. Pick a
							     suggestion → symbol joins the watchlist rows above; input clears via the
							     `{#key}` remount and is ready for the next entry. -->
							{#if tickers.watchlist.stocks.length < tickers.watchlist.cap}
								<div class="tickers-stock-spots-input-row">
									<span class="tickers-stock-spots-input-icon" aria-hidden="true">+</span>
									<div class="tickers-stock-spots-input-wrapper">
										{#key stockInputKey}
											<TickerTabInput
												type="stock"
												add={(symbol) => {
													const ok = tickers.watchlist.addStock(symbol)
													// Single-symbol fetch — re-pulling every existing row would waste two
													// SSI round-trips per current row. Fire-and-forget; the row appears
													// with a Skeleton until ~150–250ms later. fetchOneStock auto-routes
													// indices (VN30, VNDIAMOND, …) to the index endpoint internally.
													if (ok) tickers.fetchOneStock(symbol)
													return ok
												}}
												has={(s) => tickers.watchlist.hasStock(s) || RESERVED_STOCKS.has(s)}
												onPick={() => {
													stockInputKey += 1
													// Auto-scroll the freshly-appended row into view — without this, on
													// a long scrolled-down list the new entry would land below the
													// visible window (sticky input row hides it otherwise).
													tick().then(() => scrollToBottomSmooth(stockSpotsScrollEl))
												}}
												onClose={() => (stockInputKey += 1)}
												minWidthCh={6} />
										{/key}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if marketsCardTab.startsWith('p:')}
					<!-- Blank tab body — empty for now, reserved for future use cases. -->
					<div class="tickers-crypto-blank-tab">
						<span class="tickers-crypto-blank-tab-hint">Empty tab — content coming soon.</span>
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
		/* Flex-column lets a flex:1 child (e.g. .tickers-crypto-spots-scroll on the Markets card)
		   absorb any leftover vertical space when the card hits its max-height cap. Bullion's
		   metal-groups grid stacks from the top and the cap rarely engages thanks to the sub-panel's
		   own internal scroll. */
		display: flex;
		flex-direction: column;
		transition: background var(--rl-duration-short) var(--rl-ease-move);
	}
	/* Cap dashboard cards (Bullion + Markets) at 480px = 3:4 of a 360px mobile viewport — keeps
	   the dashboard's first fold proportional regardless of how packed the watchlist is. Below
	   the cap each card sizes to its own content; above the cap, the inner scrollers take over:
	   Markets via `.tickers-crypto-spots-scroll { flex: 1; min-height: 0 }`, Bullion via the
	   sub-panel's own max-height (sized so the four main rows + sub-panel + footer rarely exceed
	   480px even with the panel expanded). */
	.tickers-cards > .tickers-card {
		max-height: 480px;
	}
	/* Bullion's expanded form (sub-panel showing 10 foreign-currency rows) needs ~530px total —
	   the 480px global cap was clipping the sub-panel to ~7 rows. Raise the first-child cap to
	   540px so 10 sub-rows fit comfortably. Markets (second child) stays at 480 since its scroll
	   container handles overflow internally. */
	.tickers-cards > .tickers-card:first-child {
		max-height: 540px;
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
		/* Fixed 12px — tab labels (Bullion / VCB Forex / Binance / VN Stock) read identically on
		   mobile and desktop. Per the hybrid rem/px policy: dense data UI in viewport-capped
		   layouts opts out of root-font scaling for visual parity. See references/coding-prefs/
		   rem-by-default.md. */
		font-size: 12px;
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
		/* No flex / no scroll — card sizes to its content. The four main rows + sub-panel +
		   footer all stack vertically; the sub-panel's own `max-height: 14rem` + inner scroll
		   keeps the foreign-currency list compact when expanded. */
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
		/* Fixed 11px — locks the metal-name typography to identical rendering on mobile and
		   desktop. Was --rl-text-xs which rendered 11px desktop / 9.6px mobile. Same hybrid-policy
		   reason as the rest of the Bullion card's typography — see references/coding-prefs/
		   rem-by-default.md (px for dense data UI in viewport-capped layouts). */
		font-size: 11px;
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-text);
		letter-spacing: 0.2px;
		line-height: 1.15;
	}
	.tickers-metal-unit {
		/* Fixed 9px — was 0.5625rem (9px desktop / 7.9px mobile). Units are a supporting whisper
		   under each metal label (lượng / kg / chỉ) — deliberately quieter than the metal name
		   but still legible on mobile. 9px is the readability floor for a non-essential label. */
		font-size: 9px;
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
	   they're on the same design grid. Fixed 10px (was --rl-text-2xs = 10px desktop / 8.75px
	   mobile) for cross-viewport parity in dense data UI; see references/coding-prefs/
	   rem-by-default.md. Future tables that adopt this class get the locked typography too. */
	.tickers-table-col-label {
		font-size: 10px;
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
		/* Fixed 12px — locks BUY/SELL/AVG digits to identical width on mobile and desktop. Was
		   --rl-text-sm = 12px desktop / 10.5px mobile; the rem-shrink made VND amounts noticeably
		   harder to read on phones. Same px-fixed reasoning as VCB Forex `.tickers-forex-num`. */
		font-size: 12px;
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
		/* Sized to expose exactly 10 foreign-currency rows. Row pitch ≈ 22.3px @ 11px font +
		   line-height 1.3 + 4+4 pad. 10 × 22.3 + 4 panel padding-top + 1 border-top ≈ 228px.
		   Sub-row font is fixed-px (not rem) so the visible count stays stable across the
		   14px-mobile / 16px-desktop root-font split — same pattern as VCB Forex tab; see
		   references/coding-prefs/rem-by-default.md. The remaining 10 currencies (CHF onward)
		   are reachable via the panel's internal scrollbar. */
		max-height: 228px;
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
		/* line-height: 1.3 keeps the row compact enough to fit exactly 10 sub-rows in the
		   sub-panel viewport (vs the browser default ~1.5 which only fit 7-8). 1.3 is the
		   readability floor — tighter starts to feel squashed for VND amounts that drop below
		   the baseline. Padding stays at 4px (comfortable, matches VCB Forex card's choice). */
		padding: 4px 0;
		line-height: 1.3;
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
		/* Fixed 11px (vs the previous --rl-text-2xs rem token, which scaled to 8.75px on mobile
		   — too small to read comfortably). Same mobile/desktop typography rationale as VCB Forex
		   tab — see references/coding-prefs/rem-by-default.md for the hybrid policy: dense data
		   UI in viewport-capped layouts opts out of root-font scaling for visual parity. */
		font-size: 11px;
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		letter-spacing: 0.3px;
	}
	.tickers-bullion-sub-value {
		font-family: var(--rl-font-mono);
		/* Fixed 11px — same px-fixed reasoning as `.tickers-bullion-sub-code` above. Foreign-
		   currency equivalents like JPY/KRW run 7-digit ("9.344.954"); at 11px they have just
		   enough room without crowding adjacent columns on narrower viewports. */
		font-size: 11px;
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
		/* Fixed 10px — matches the column-header label scale, locking the entire Bullion card's
		   typography to identical rendering on mobile and desktop. */
		font-size: 10px;
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
		/* Sized to expose exactly 10 pair rows (USD–CAD) with no peek of the 11th. At the row
		   pitch of ~27.2px (12px font + line-height 1.2 + 6+6 pad) plus header (~20), first-row
		   margin (4), 9 inter-row borders (9), and the Tier A→B divider extra (~5px), 10 rows
		   land at ~310px exactly — tuning to fit-cleanly without HKD peeking. The remaining 10
		   currencies (HKD, CHF, MYR, INR, DKK, SEK, NOK, SAR, KWD, RUB) are reachable via the
		   table's internal scroll. */
		max-height: 294px;
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
		/* 6px vertical padding + explicit line-height: 1.2 = comfortable density:
		   row content ≈ 14.4px (line-height) + 12px (6+6 pad) → ~26.4px row pitch on desktop.
		   Sized so ~12 rows (USD through CHF, the full Tier A + Tier B set) sit in the 360px
		   table viewport. The line-height: 1.2 (vs the 1.5 browser default) keeps the row tight
		   enough to fit Tier A+B without cramping each individual row. */
		padding: 6px var(--rl-space-sm) 6px 0;
		line-height: 1.2;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}
	/* Header + row live side-by-side in the same flex container, so `.tickers-forex-row:first-child`
	   never matches (the header is the first child). Use the adjacent-sibling combinator to target
	   the row immediately after the header — that's USD, the actual first data row. */
	.tickers-forex-header + .tickers-forex-row {
		/* Margin-top gives USD breathing space under the sticky header so the first data row
		   reads as its own band rather than glued to the label row. Matches the --rl-space-xs
		   rhythm (4px) used for row padding, keeping vertical cadence consistent. */
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
		/* 14×14 (was 18×18) shrinks the row's controlling vertical extent so font line-height
		   becomes the height driver instead of the flag — required for the 10-row fit in 224px.
		   Round-flag identity remains legible at 14px alongside the 3-letter currency code. */
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}
	.tickers-forex-code {
		font-family: var(--rl-font-mono);
		/* Fixed 12px (= --rl-text-sm at 16px desktop root) instead of the rem token so the forex
		   card's typography stays identical between mobile (14px root) and desktop. The rest of
		   the dashboard scales with the project's root-font breakpoint at 720px; this card opts
		   out so its row pitch is identical across viewports — required for a single max-height
		   to clip exactly 10 rows on both. */
		font-size: 12px;
		font-weight: var(--rl-font-bold);
		letter-spacing: -0.2px;
		color: var(--rl-color-text);
	}
	.tickers-forex-num {
		font-family: var(--rl-font-mono);
		font-size: 12px;
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

	/* 24H change cell inside the metal table (column 4). Right-aligned to match the column
	   header and keep numeric rhythm. Colored up/down/flat using the same semantic tokens as
	   the crypto card's 24H change. */
	.tickers-metal-day-cell {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		align-self: center;
		font-family: var(--rl-font-mono);
		/* Fixed 12px — matches `.tickers-metal-value` and `.tickers-forex-num` so the entire
		   Bullion-card numeric grid renders at identical size mobile and desktop. */
		font-size: 12px;
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
		/* Col 1 = 10px (= dot's exact diameter, no right-side breathing strip). The dot→symbol
		   distance is then the column-gap alone (10px) instead of 14px (4px breathing + 10px gap).
		   Donates the freed 4px to the four numeric tracks. Input row's `+` glyph still anchors
		   at col 1's left via `justify-self: start` and visually aligns with the dots above —
		   the `+` is 7–9px in `--rl-text-md` so 10px hosts it cleanly without overflow.
		   Col 2 fixed at 4.5rem (~63px at 14px root, ~72px at 16px root) — sized to fit the
		   longest realistic symbol (`VNDIAMOND` at 9 chars ≈ 63px in mono `--rl-text-sm`) with
		   ~zero buffer; `text-overflow: ellipsis` on the asset cell catches anything wider. A
		   previous 5rem (~80px) was wider than necessary and shrank the four numeric tracks for
		   no content benefit. Fixed width (vs `minmax(2.25rem, auto)`) keeps the numeric tracks
		   invariant across add/remove of long-symbol watchlist rows.
		   Numeric track ratio `1fr 1fr 1fr 0.9fr` (LOW · HIGH · PRICE · 24H). All three numeric
		   tracks are equal because in mono with `font-variant-numeric: tabular-nums`, every digit
		   has the same advance width — Price's bolder weight doesn't widen `$78.477` vs `$76.204`
		   even at the same fontSize, so a Price-only fr bump just leaves dead space inside that
		   cell. 24H is the only consistently-shorter content (`+99,99%` max, ~43px intrinsic at
		   `--rl-text-sm`) and surrenders 10% to keep all numeric cells with comparable slack at
		   both root font sizes (14px mobile / 16px desktop): 25–30px slack at mobile, 3–8px at
		   the tighter desktop 2-column layout.
		   Col 7 = 8px. Sized so the × button (anchored to col 7's right edge via `justify-self:
		   end` + a -4px right margin overflow) lands ~6px right of the %CHG content right edge —
		   close enough to read as "right-end of the row" yet not crowding the percent value. A
		   previous 16px col 7 stacked an extra ~10px gap before the × (col-gap 10 + col 7 16 =
		   26px from %CHG content right to × glyph) which read as wasted space; collapsing to 0
		   put × literally touching the percent sign. 8px is the goldilocks middle. Combined with
		   `scrollbar-gutter: stable` dropped on the parent scroll container, the × sits ~12–17px
		   from the card's outer right edge (vs ~27px before). */
		grid-template-columns: 10px 4.5rem 1fr 1fr 1fr 0.9fr 8px;
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
		/* No `scrollbar-gutter: stable` — reserves ~10px of right-edge dead space even when no
		   scrollbar is rendered, which combined with col 7 + col-gap put the × button uncomfortably
		   far from the card's visual right edge. Trade-off: when the watchlist fills enough rows
		   to scroll, the thin scrollbar appears and the rightmost content (× / %CHG) shifts left
		   by ~10px. That's an acceptable transition signal — it reads as "more rows below". */
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
		/* Fixed 12px — same px-fixed reasoning as the rest of the Markets card; locks identifier
		   typography across mobile and desktop. */
		font-size: 12px;
		font-weight: var(--rl-font-semibold);
		letter-spacing: -0.2px;
		color: var(--rl-color-text);
		white-space: nowrap;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
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
	   muted color. The hierarchy reads as "reference cells" against the brighter PRICE headline.
	   Fixed 12px (was --rl-text-sm) for cross-viewport parity in dense data UI. */
	.tickers-crypto-spots-num {
		font-family: var(--rl-font-mono);
		font-size: 12px;
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
		font-size: 12px;
		font-weight: var(--rl-font-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text);
		text-align: right;
	}
	.tickers-crypto-spots-pct {
		font-family: var(--rl-font-mono);
		font-size: 12px;
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
		/* Fixed 14px — × glyph stays the same tap-size on mobile and desktop. Matches the rest
		   of the Markets card's px-fixed typography. */
		font-size: 14px;
		line-height: 1;
		color: var(--rl-color-text-faint);
		background: transparent;
		border: none;
		padding: 4px;
		/* Anchor at col 7's right edge (= grid right, since col 7 has 0 width). The negative
		   right margin pulls the visible glyph 4px past the grid's right edge to absorb the
		   button's hit-area padding so the × glyph reads as flush right rather than 4px inset. */
		justify-self: end;
		margin: -4px -4px -4px 0;
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

	/* ───── VN-Stock tab grid (Markets card 2nd tab) ─────
	   Parallel to .tickers-crypto-spots-* — 7-col grid with VN_STOCK_FIXED rows at top, VN
	   watchlist equities below, permanent input row at the bottom. Same dimensions as crypto so the cards
	   read as siblings (`14px minmax(2.25rem, auto) 1fr 1fr 1fr 1fr 16px`, 10px col gap, 12px row
	   gap). The structural twin lives a few hundred lines above; merge into a shared base once
	   the rule-of-three fires (Bullion would be the third). */
	.tickers-stock-spots-grid {
		display: grid;
		/* Col 1 = 10px (matches the dot's diameter exactly, no right-side breathing strip) so the
		   dot→symbol distance is the column-gap alone (10px) instead of 14px. See the equivalent
		   block on `.tickers-crypto-spots-grid` for the full rationale; this grid mirrors it
		   (col 1, col 2 = 4.5rem, numeric ratios, col 7 = 8 + scrollbar-gutter dropped on scroll). */
		grid-template-columns: 10px 4.5rem 1fr 1fr 1fr 0.9fr 8px;
		column-gap: 10px;
		row-gap: 12px;
		align-items: center;
	}
	.tickers-stock-spots-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		/* `scrollbar-gutter: stable` dropped — see the equivalent block on
		   `.tickers-crypto-spots-scroll` for the full rationale (right-edge reclaim for ×). */
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
	}
	.tickers-stock-spots-header {
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
	.tickers-card:hover .tickers-stock-spots-header,
	.tickers-card:hover .tickers-stock-spots-input-row {
		background: #1f1f1f;
	}
	.tickers-stock-spots-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--dot, var(--rl-color-text-faint));
		justify-self: start;
	}
	.tickers-stock-spots-asset {
		font-family: var(--rl-font-mono);
		/* Fixed 12px — same px-fixed reasoning as the Binance tab. */
		font-size: 12px;
		font-weight: var(--rl-font-semibold);
		letter-spacing: -0.2px;
		color: var(--rl-color-text);
		white-space: nowrap;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tickers-stock-spots-num {
		font-family: var(--rl-font-mono);
		font-size: 12px;
		font-weight: var(--rl-font-medium);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text-subtle);
		text-align: right;
	}
	.tickers-stock-spots-price {
		font-family: var(--rl-font-mono);
		font-size: 12px;
		font-weight: var(--rl-font-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text);
		text-align: right;
	}
	/* VN-iBoard 5-state color rule — equity rows only. Ceiling/floor signal the regulatory band
	   extremes (the most distinctive VN-market UX cue), up/down/flat ride the directional tokens.
	   The fixed index rows (VNINDEX / VN30 / VNMID) omit `data-color` on their price cells →
	   falls through to the default text color above, plain bright. */
	.tickers-stock-spots-price[data-color='ceiling'] {
		color: var(--rl-color-vn-ceiling);
	}
	.tickers-stock-spots-price[data-color='floor'] {
		color: var(--rl-color-vn-floor);
	}
	.tickers-stock-spots-price[data-color='up'] {
		color: var(--rl-color-up);
	}
	.tickers-stock-spots-price[data-color='down'] {
		color: var(--rl-color-down);
	}
	.tickers-stock-spots-price[data-color='flat'] {
		color: var(--rl-color-vn-flat);
	}
	.tickers-stock-spots-pct {
		font-family: var(--rl-font-mono);
		font-size: 12px;
		font-weight: var(--rl-font-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--rl-color-text-faint);
		text-align: right;
	}
	.tickers-stock-spots-pct.up {
		color: var(--rl-color-up);
	}
	.tickers-stock-spots-pct.down {
		color: var(--rl-color-down);
	}
	.tickers-stock-spots-x {
		font-family: var(--rl-font-mono);
		font-size: 14px;
		line-height: 1;
		color: var(--rl-color-text-faint);
		background: transparent;
		border: none;
		padding: 4px;
		justify-self: end;
		margin: -4px -4px -4px 0;
		cursor: pointer;
		border-radius: 4px;
		transform: translateY(-2px);
		transition:
			color var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out),
			background var(--rl-duration-micro, 120ms) var(--rl-ease-move, ease-out);
	}
	.tickers-stock-spots-x:hover {
		color: var(--rl-color-text);
		background: var(--rl-color-surface-raised);
	}
	.tickers-stock-spots-input-row {
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
	.tickers-stock-spots-input-icon {
		justify-self: start;
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md);
		font-weight: var(--rl-font-bold);
		line-height: 1;
		color: var(--rl-color-text-faint);
	}
	.tickers-stock-spots-input-wrapper {
		grid-column: 2 / -1;
		display: flex;
		align-items: center;
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
