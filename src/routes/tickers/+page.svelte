<script lang="ts">
	import {
		useTickers,
		formatVND,
		formatSpread,
		formatUSDT,
		formatVN100,
		USDT_FORMATTER,
		VN100_FORMATTER,
	} from './use-tickers.svelte'
	import { Skeleton } from '$lib/components/ui/skeleton/index.js'
	import { LoadingOverlay } from '$lib/components/ui/loading-overlay/index.js'
	import { FreshnessDot } from '$lib/components/ui/freshness-dot/index.js'
	import { RefreshCw as SpinnerIcon, TriangleAlert } from '@lucide/svelte'
	import PriceChart, { type CandleSize } from './price-chart.svelte'
	import { page } from '$app/state'

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
		{ id: 'ETH' as const, name: 'Ethereum', accent: '#6b7fcc' },
		{ id: 'SOL' as const, name: 'Solana', accent: '#8a6db8' },
	]

	const CHART_ACCENTS: Record<string, string> = {
		gold: '#d4a03a',
		silver: '#a0a8b8',
		BTC: '#e8993a',
		ETH: '#6b7fcc',
		SOL: '#8a6db8',
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
	let cryptoTab = $state<'BTC' | 'ETH' | 'SOL'>('BTC')

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
	<!-- Header -->
	<div class="tickers-header">
		<h1 class="tickers-title">Tickers</h1>
	</div>

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
					<div class="tickers-card-tabs">
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
					<div class="tickers-card-tabs">
						{#each CRYPTO as coin}
							<button
								class="tickers-card-tab"
								class:active-crypto={cryptoTab === coin.id}
								style:--crypto-accent={coin.accent}
								onclick={() => (cryptoTab = coin.id)}>
								{coin.id}
							</button>
						{/each}
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

				{#if tickers.getCryptoTicker(cryptoTab)}
					{@const item = tickers.getCryptoTicker(cryptoTab)!}
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
					<div class="tickers-card-tabs">
						<button class="tickers-card-tab active-vn100" style:--vn100-accent="#b87333"> VN100 </button>
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

				{#if tickers.vn100Quote}
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
					<div class="tickers-chart-tabs-scroll">
						{#each [{ id: 'gold' as const, label: 'Gold', accent: '#c9a84c' }, { id: 'silver' as const, label: 'Silver', accent: '#8a94a8' }, ...CRYPTO.map( (c) => ({ id: c.id, label: c.id, accent: c.accent }), ), { id: 'VN100' as const, label: 'VN100', accent: '#b87333' }] as tab}
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
		padding: 24px 16px;
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		color: #e8e6e3;
	}

	/* Header */
	.tickers-header {
		margin-bottom: 24px;
		padding-bottom: 16px;
		border-bottom: 1px solid #2a2a36;
	}
	.tickers-title {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.2px;
	}
	:global(.tickers-spinner) {
		animation: spin 1s linear infinite;
	}

	/* Cards grid: stack on mobile, side-by-side on tablet+ */
	.tickers-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		margin-bottom: 24px;
	}
	@media (min-width: 640px) {
		.tickers-cards {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* Card */
	.tickers-card {
		background: #1a1a24;
		border: 1px solid #2a2a36;
		border-radius: 12px;
		padding: 20px;
		transition: background 0.15s ease;
	}
	.tickers-card:hover {
		background: #22222e;
	}

	/* Card header: tabs left, status right */
	.tickers-card-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 16px;
		border-bottom: 1px solid #2a2a36;
	}
	.tickers-card-status {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
		padding-bottom: 8px;
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
		color: #6b6b76;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-card-refresh:hover {
		color: #e8e6e3;
		background: rgba(255, 255, 255, 0.05);
	}
	.tickers-card-refresh:disabled {
		cursor: not-allowed;
	}

	/* Card tabs — underline style to differentiate from unit chips */
	.tickers-card-tabs {
		display: flex;
		gap: 16px;
	}
	.tickers-card-tab {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.3px;
		padding: 0 0 8px;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		color: #6b6b76;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-card-tab:hover {
		color: #8a8a96;
	}
	.tickers-card-tab.active-gold {
		color: #d4a03a;
		border-bottom-color: #d4a03a;
	}
	.tickers-card-tab.active-silver {
		color: #a0a8b8;
		border-bottom-color: #a0a8b8;
	}
	.tickers-card-tab.active-crypto {
		color: var(--crypto-accent);
		border-bottom-color: var(--crypto-accent);
	}
	.tickers-card-tab.active-vn100 {
		color: var(--vn100-accent);
		border-bottom-color: var(--vn100-accent);
		cursor: default;
	}

	/* Metal prices — compact table: unit | buy | sell */
	.tickers-metal-table {
		display: grid;
		grid-template-columns: auto 1fr 1fr;
		gap: 4px 12px;
		padding: 8px 0;
	}
	.tickers-metal-header {
		display: contents;
	}
	.tickers-metal-row {
		display: contents;
	}
	.tickers-metal-col-label {
		font-size: 10px;
		font-weight: 500;
		color: #8a8a96;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		text-align: right;
	}
	.tickers-metal-unit {
		font-size: 10px;
		font-weight: 500;
		color: #8a8a96;
		align-self: center;
	}
	.tickers-metal-value {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 16px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.3px;
		color: #e8e6e3;
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
		font-size: 11px;
		font-weight: 500;
		color: #8a8a96;
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
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 24px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.5px;
		color: #e8e6e3;
	}
	@media (min-width: 640px) {
		.tickers-price-value {
			font-size: 22px;
		}
	}
	.tickers-price-unit {
		font-size: 10px;
		color: #8a8a96;
	}

	/* Spread */
	.tickers-spread-row {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding-top: 8px;
		margin-top: 4px;
		border-top: 1px solid #2a2a36;
		gap: 6px;
	}
	.tickers-spread-label {
		font-size: 10px;
		color: #8a8a96;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.tickers-spread-value {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 13px;
		font-weight: 600;
		color: #d4874d;
		font-variant-numeric: tabular-nums;
	}

	/* Chart section */
	.tickers-chart-section {
		background: #121218;
		border: 1px solid #2a2a36;
		border-radius: 12px;
		padding: 20px;
	}
	@media (max-width: 639px) {
		.tickers-chart-section {
			margin-left: -16px;
			margin-right: -16px;
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
		margin-bottom: 16px;
		gap: 10px;
	}
	.tickers-chart-sub-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tickers-chart-intervals {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tickers-interval-label {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 10px;
		font-weight: 500;
		color: #6b6b76;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}
	.tickers-chart-tabs {
		display: flex;
		background: #1a1a24;
		margin: -20px -20px 0;
		padding: 16px 20px 12px;
		border-radius: 12px 12px 0 0;
		border-bottom: 1px solid #2a2a36;
		gap: 0;
	}
	/* Scrollable tab group — keeps status indicator pinned on overflow */
	.tickers-chart-tabs-scroll {
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.tickers-chart-tabs-scroll::-webkit-scrollbar {
		height: 2px;
	}
	.tickers-chart-tabs-scroll::-webkit-scrollbar-thumb {
		background: #2a2a36;
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
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 10px;
		font-weight: 500;
		color: #6b6b76;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}
	.tickers-candle-chips {
		display: flex;
		border: 1px solid #2a2a36;
		border-radius: 4px;
		overflow: hidden;
	}
	.tickers-candle-chip {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 10px;
		font-weight: 500;
		padding: 5px 9px;
		border: none;
		border-right: 1px solid #2a2a36;
		border-radius: 0;
		color: #8a8a96;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-candle-chip:last-child {
		border-right: none;
	}
	.tickers-candle-chip:hover {
		background: rgba(255, 255, 255, 0.03);
		color: #e8e6e3;
	}
	.tickers-candle-chip.active {
		background: rgba(232, 230, 227, 0.08);
		color: #e8e6e3;
		font-weight: 600;
	}
	.tickers-chart-tab {
		flex-shrink: 0;
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		padding: 6px 12px;
		border: 1px solid #2a2a36;
		border-right: none;
		border-radius: 0;
		color: #8a8a96;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-chart-tab:first-child {
		border-radius: 4px 0 0 4px;
	}
	.tickers-chart-tab:last-child {
		border-radius: 0 4px 4px 0;
		border-right: 1px solid #2a2a36;
	}
	.tickers-chart-tab:hover {
		background: rgba(255, 255, 255, 0.03);
		color: #e8e6e3;
	}
	.tickers-chart-tab.active {
		background: color-mix(in srgb, var(--tab-accent) 15%, transparent);
		color: var(--tab-accent);
		border-color: color-mix(in srgb, var(--tab-accent) 30%, transparent);
		font-weight: 600;
	}
	.tickers-chart-tab.active + .tickers-chart-tab {
		border-left-color: color-mix(in srgb, var(--tab-accent) 30%, transparent);
	}
	.tickers-chart-durations {
		display: flex;
		border: 1px solid #2a2a36;
		border-radius: 4px;
		overflow: hidden;
	}
	.tickers-duration-chip {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 10px;
		font-weight: 500;
		padding: 5px 9px;
		border: none;
		border-right: 1px solid #2a2a36;
		border-radius: 0;
		color: #8a8a96;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
		white-space: nowrap;
	}
	.tickers-duration-chip:last-child {
		border-right: none;
	}
	.tickers-duration-chip:hover {
		background: rgba(255, 255, 255, 0.03);
		color: #e8e6e3;
	}
	.tickers-duration-chip.active {
		background: rgba(232, 230, 227, 0.08);
		color: #e8e6e3;
		font-weight: 600;
	}

	.tickers-chart-body {
		min-height: 340px;
	}

	.tickers-chart-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 280px;
		color: #4a4a56;
		font-size: 12px;
		font-style: italic;
	}

	/* Error / stale */
	.tickers-error-card {
		background: rgba(196, 78, 78, 0.1);
		border: 1px solid rgba(196, 78, 78, 0.2);
		border-radius: 12px;
		padding: 32px 20px;
		text-align: center;
		color: #c44e4e;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.tickers-retry {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 13px;
		font-weight: 500;
		padding: 8px 16px;
		border-radius: 4px;
		border: 1px solid #2a2a36;
		color: #e8e6e3;
		background: transparent;
		cursor: pointer;
	}
	.tickers-retry:hover {
		border-color: #6b6b76;
	}

	/* Crypto */
	.tickers-crypto-price {
		font-size: 20px;
	}
	@media (min-width: 640px) {
		.tickers-crypto-price {
			font-size: 18px;
		}
	}
	.tickers-crypto-change {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tickers-crypto-change.up {
		color: #2d9f6f;
	}
	.tickers-crypto-change.down {
		color: #c44e4e;
	}
	.tickers-crypto-pct {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 10px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.tickers-crypto-pct.up {
		color: #2d9f6f;
	}
	.tickers-crypto-pct.down {
		color: #c44e4e;
	}
	.tickers-crypto-range {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 16px;
		padding-top: 12px;
		margin-top: 4px;
		border-top: 1px solid #2a2a36;
	}
	.tickers-crypto-range-pair {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.tickers-crypto-range-label {
		font-size: 10px;
		color: #8a8a96;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.tickers-crypto-range-value {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 13px;
		font-weight: 600;
		color: #d4874d;
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
