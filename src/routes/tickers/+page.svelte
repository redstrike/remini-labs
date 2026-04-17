<script lang="ts">
	import {
		useTickers,
		formatVND,
		formatSpread,
		formatUSDT,
		formatVN100,
		formatCryptoPrice,
		formatStockPrice,
		USDT_FORMATTER,
		VN100_FORMATTER,
	} from './use-tickers.svelte'
	import { Skeleton } from '$lib/components/shadcn-svelte/skeleton/index.js'
	import { LoadingOverlay } from '$lib/components/remini-labs/loading-overlay/index.js'
	import { FreshnessDot } from '$lib/components/remini-labs/freshness-dot/index.js'
	import { RefreshCw as SpinnerIcon, TriangleAlert } from '@lucide/svelte'
	import { formatCryptoDisplay, splitCryptoSymbol } from './api/binance-client'
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
	let metalTab = $state<'gold' | 'silver'>('gold')
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
			tickers.bus.on('chart:metals:fetching', () => (fetchingMetalsChart = true)),
			tickers.bus.on('chart:metals:fetched', () => (fetchingMetalsChart = false)),
			tickers.bus.on('chart:crypto:fetching', () => (fetchingCryptoChart = true)),
			tickers.bus.on('chart:crypto:fetched', () => (fetchingCryptoChart = false)),
			tickers.bus.on('chart:stocks:fetching', () => (fetchingStocksChart = true)),
			tickers.bus.on('chart:stocks:fetched', () => (fetchingStocksChart = false)),
		]
		return () => unsubs.forEach((fn) => fn())
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
			<!-- Metals Card (Gold / Silver tabs) -->
			<div class="tickers-card">
				<div class="tickers-card-header">
					<div class="tickers-card-tabs" onwheel={horizontalWheel}>
						<button
							class="tickers-card-tab"
							class:active-gold={metalTab === 'gold'}
							onclick={() => (metalTab = 'gold')}>
							SJC Gold
						</button>
						<button
							class="tickers-card-tab"
							class:active-silver={metalTab === 'silver'}
							onclick={() => (metalTab = 'silver')}>
							PQ Silver
						</button>
					</div>
					<div class="tickers-card-status">
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
					</div>
				</div>

				{#if metalTab === 'gold' && tickers.goldItem}
					<div class="tickers-metal-table">
						<div class="tickers-metal-header">
							<span></span>
							<span class="tickers-metal-col-label">Buy</span>
							<span class="tickers-metal-col-label">Sell</span>
						</div>
						<div class="tickers-metal-row">
							<span class="tickers-metal-unit">Chỉ (VND)</span>
							<span class="tickers-metal-value">{formatVND(tickers.goldItem.buyChi)}</span>
							<span class="tickers-metal-value">{formatVND(tickers.goldItem.sellChi)}</span>
						</div>
						<div class="tickers-metal-row">
							<span class="tickers-metal-unit">Lượng (VND)</span>
							<span class="tickers-metal-value">{formatVND(tickers.goldItem.buyLuong)}</span>
							<span class="tickers-metal-value">{formatVND(tickers.goldItem.sellLuong)}</span>
						</div>
					</div>
					<div class="tickers-spread-row">
						<span class="tickers-spread-label">Spread</span>
						<span class="tickers-spread-value">
							{formatSpread(tickers.goldItem.buyChi, tickers.goldItem.sellChi)} / {formatSpread(
								tickers.goldItem.buyLuong,
								tickers.goldItem.sellLuong,
							)}
						</span>
					</div>
				{:else if metalTab === 'silver' && tickers.silverItems.length}
					<div class="tickers-metal-table">
						<div class="tickers-metal-header">
							<span></span>
							<span class="tickers-metal-col-label">Buy</span>
							<span class="tickers-metal-col-label">Sell</span>
						</div>
						{#each tickers.silverItems as item}
							<div class="tickers-metal-row">
								<span class="tickers-metal-unit"
									>{item.unit?.includes('kg') ? 'Kg' : 'Lượng'} (VND)</span>
								<span class="tickers-metal-value">{formatVND(item.buyPrice)}</span>
								<span class="tickers-metal-value">{formatVND(item.sellPrice)}</span>
							</div>
						{/each}
					</div>
					<div class="tickers-spread-row">
						<span class="tickers-spread-label">Spread</span>
						<span class="tickers-spread-value">
							{tickers.silverItems.map((item) => formatSpread(item.buyPrice, item.sellPrice)).join(' / ')}
						</span>
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
									>{formatStockPrice(q.price * 1000)}</span>
								<span class="tickers-price-unit">VND</span>
							</div>
						</div>
						<div class="tickers-price-row">
							<span class="tickers-price-label">Change</span>
							<div class="tickers-price-value-wrap">
								<span class="tickers-crypto-change" class:up class:down={!up}>
									{up ? '+' : ''}{formatStockPrice(q.change * 1000)}
								</span>
								<span class="tickers-crypto-pct" class:up class:down={!up}>
									({up ? '+' : ''}{q.pctChange.toFixed(2)}%)
								</span>
							</div>
						</div>
						<div class="tickers-crypto-range">
							<span class="tickers-crypto-range-pair">
								<span class="tickers-crypto-range-label">Ref</span>
								<span class="tickers-crypto-range-value">{formatStockPrice(q.refPrice * 1000)}</span>
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
						{#each [{ id: 'gold' as string, label: 'Gold', accent: '#c9a84c' }, { id: 'silver', label: 'Silver', accent: '#8a94a8' }, ...CRYPTO.map( (c) => ({ id: c.id, label: c.id, accent: c.accent }), ), { id: 'VN100', label: 'VN100', accent: '#b87333' }, ...tickers.watchlist.crypto.map( (s) => {
									const fmt = formatCryptoDisplay(s)
									return { id: s, label: fmt.primary + fmt.suffix, accent: brandFor(s) ?? '#6b8aad' }
								}, ), ...tickers.watchlist.stocks.map( (s) => ({ id: s, label: s, accent: '#b87333' }), )] as tab (tab.id)}
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
									? VN100_FORMATTER
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

	/* Cards grid: stack on mobile, side-by-side on tablet+ */
	.tickers-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--rl-space-md);
		margin-bottom: var(--rl-space-lg);
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
	.tickers-card-tab.active-gold {
		color: var(--rl-color-asset-gold);
		border-bottom-color: var(--rl-color-asset-gold);
	}
	.tickers-card-tab.active-silver {
		color: var(--rl-color-asset-silver);
		border-bottom-color: var(--rl-color-asset-silver);
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
		padding: 0 4px var(--rl-space-sm);
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

	/* Metal prices — compact table: unit | buy | sell */
	.tickers-metal-table {
		display: grid;
		grid-template-columns: auto 1fr 1fr;
		gap: var(--rl-space-xs) 12px;
		padding: var(--rl-space-sm) 0;
	}
	.tickers-metal-header {
		display: contents;
	}
	.tickers-metal-row {
		display: contents;
	}
	.tickers-metal-col-label {
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		text-align: right;
	}
	.tickers-metal-unit {
		font-size: var(--rl-text-2xs);
		font-weight: var(--rl-font-medium);
		color: var(--rl-color-text-subtle);
		align-self: center;
	}
	.tickers-metal-value {
		font-family: var(--rl-font-mono);
		font-size: var(--rl-text-md);
		font-weight: var(--rl-font-bold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: var(--rl-color-text);
		text-align: right;
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
	.tickers-spread-row {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding-top: var(--rl-space-sm);
		margin-top: var(--rl-space-xs);
		border-top: 1px solid var(--rl-color-border);
		gap: 6px;
	}
	.tickers-spread-label {
		font-size: var(--rl-text-2xs);
		color: var(--rl-color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.tickers-spread-value {
		font-family: var(--rl-font-mono);
		font-size: 13px;
		font-weight: var(--rl-font-semibold);
		color: var(--rl-color-spread);
		font-variant-numeric: tabular-nums;
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
