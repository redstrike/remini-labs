<script lang="ts">
	import { useTickers, formatVND, formatSpread } from './use-tickers.svelte'
	import { Skeleton } from '$lib/components/ui/skeleton/index.js'
	import { RefreshCw, TriangleAlert } from '@lucide/svelte'
	import PriceChart from './price-chart.svelte'
	import { page } from '$app/state'

	// Intentionally capture SSR data once — hook takes over with client-side polling
	const initialTable = page.data.table ?? null
	const initialSummary = page.data.summary ?? null
	const tickers = useTickers({ table: initialTable, summary: initialSummary })

	const durations = [
		{ label: '30D', value: '1M' as const },
		{ label: '90D', value: '3M' as const },
		{ label: '180D', value: '6M' as const },
		{ label: '1Y', value: '1Y' as const },
	]
</script>

<svelte:head>
	<title>Tickers</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600;700&display=swap"
	/>
</svelte:head>

<div class="tickers">
	<!-- Header -->
	<div class="tickers-header">
		<h1 class="tickers-title">Tickers</h1>
		<div class="tickers-header-right">
			<div class="tickers-status">
				{#if tickers.loading || tickers.refreshing}
					<RefreshCw class="tickers-spinner" size={14} />
				{:else}
					<span class="tickers-dot" class:stale={tickers.isStale}></span>
				{/if}
				<span class="tickers-status-text">
					{#if tickers.refreshing}
						Refreshing...
					{:else if tickers.loading}
						Loading...
					{:else if tickers.updatedAt}
						{tickers.updatedAt}
					{:else}
						Live
					{/if}
				</span>
			</div>
			<button
				class="tickers-refresh-btn"
				onclick={() => tickers.forceRefreshAll()}
				disabled={tickers.refreshing || tickers.loading}
				title="Refresh all data"
			>
				<RefreshCw size={13} class={tickers.refreshing ? 'tickers-spinner' : ''} />
			</button>
		</div>
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
				<Skeleton class="h-4 w-24 mb-4" />
				<Skeleton class="h-8 w-48 mb-2" />
				<Skeleton class="h-8 w-48" />
			</div>
			<div class="tickers-card">
				<Skeleton class="h-4 w-24 mb-4" />
				<Skeleton class="h-8 w-48 mb-2" />
				<Skeleton class="h-8 w-48" />
			</div>
		</div>
	{:else}
		<!-- Price Cards: side-by-side on tablet+ -->
		<div class="tickers-cards">
			<!-- Gold Card -->
			{#if tickers.goldItem}
				<div class="tickers-card">
					<div class="tickers-card-header">
						<span class="tickers-card-label gold">XAU Gold</span>
					</div>

					<div class="tickers-chips">
						<button
							class="tickers-chip"
							class:active-gold={tickers.goldUnit === 'luong'}
							onclick={() => tickers.selectGoldUnit('luong')}
						>SJC Lượng</button>
						<button
							class="tickers-chip"
							class:active-gold={tickers.goldUnit === 'chi'}
							onclick={() => tickers.selectGoldUnit('chi')}
						>SJC Chỉ</button>
					</div>

					<div class="tickers-price-row">
						<span class="tickers-price-label">Buy</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value">{formatVND(tickers.goldItem.buyPrice)}</span>
							<span class="tickers-price-unit">{tickers.goldItem.unit}</span>
						</div>
					</div>
					<div class="tickers-price-row">
						<span class="tickers-price-label">Sell</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value">{formatVND(tickers.goldItem.sellPrice)}</span>
							<span class="tickers-price-unit">{tickers.goldItem.unit}</span>
						</div>
					</div>
					<div class="tickers-spread-row">
						<span class="tickers-spread-label">Spread</span>
						<span class="tickers-spread-value">
							{formatSpread(tickers.goldItem.buyPrice, tickers.goldItem.sellPrice)}
						</span>
					</div>
				</div>
			{/if}

			<!-- Silver Card -->
			<div class="tickers-card">
				<div class="tickers-card-header">
					<span class="tickers-card-label silver">XAG Silver</span>
				</div>

				<div class="tickers-chips">
					<button
						class="tickers-chip"
						class:active-silver={tickers.selectedSilver === tickers.silverItems[0]}
						onclick={() => tickers.selectSilver(0)}
					>PQ Kg</button>
					{#if tickers.silverItems.length > 1}
						<button
							class="tickers-chip"
							class:active-silver={tickers.selectedSilver === tickers.silverItems[1]}
							onclick={() => tickers.selectSilver(1)}
						>PQ Lượng</button>
					{/if}
				</div>

				{#if tickers.selectedSilver}
					<div class="tickers-price-row">
						<span class="tickers-price-label">Buy</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value">{formatVND(tickers.selectedSilver.buyPrice)}</span>
							<span class="tickers-price-unit">{tickers.selectedSilver.unit}</span>
						</div>
					</div>
					<div class="tickers-price-row">
						<span class="tickers-price-label">Sell</span>
						<div class="tickers-price-value-wrap">
							<span class="tickers-price-value">{formatVND(tickers.selectedSilver.sellPrice)}</span>
							<span class="tickers-price-unit">{tickers.selectedSilver.unit}</span>
						</div>
					</div>
					<div class="tickers-spread-row">
						<span class="tickers-spread-label">Spread</span>
						<span class="tickers-spread-value">
							{formatSpread(tickers.selectedSilver.buyPrice, tickers.selectedSilver.sellPrice)}
						</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Historical Chart -->
		<div class="tickers-chart-section">
			<div class="tickers-chart-header">
				<div class="tickers-chart-tabs">
					<button
						class="tickers-chart-tab"
						class:active-gold={tickers.chartAsset === 'gold'}
						onclick={() => tickers.fetchChart('gold', tickers.chartDuration)}
					>
						Gold
					</button>
					<button
						class="tickers-chart-tab"
						class:active-silver={tickers.chartAsset === 'silver'}
						onclick={() => tickers.fetchChart('silver', tickers.chartDuration)}
					>
						Silver
					</button>
				</div>
				<div class="tickers-chart-durations">
					{#each durations as d}
						<button
							class="tickers-duration-chip"
							class:active={tickers.chartDuration === d.value && tickers.chartData}
							onclick={() => tickers.fetchChart(tickers.chartAsset, d.value)}
						>
							{d.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="tickers-chart-body">
				{#if tickers.chartLoading}
					<div class="tickers-chart-loading">
						<RefreshCw class="tickers-spinner" size={16} />
						<span>Loading chart...</span>
					</div>
				{:else if tickers.chartError}
					<div class="tickers-chart-placeholder">
						{tickers.chartError}
					</div>
				{:else if tickers.chartData}
					<PriceChart
						data={tickers.chartData}
						accentColor={tickers.chartAsset === 'gold' ? '#c9a84c' : '#8a94a8'}
					/>
				{:else}
					<div class="tickers-chart-placeholder">
						Select a timeframe to view price history
					</div>
				{/if}
			</div>
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		padding-bottom: 16px;
		border-bottom: 1px solid #2a2a36;
	}
	.tickers-title {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.2px;
	}
	.tickers-header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.tickers-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #6b6b76;
	}
	.tickers-refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid #2a2a36;
		background: transparent;
		color: #6b6b76;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-refresh-btn:hover {
		border-color: #6b6b76;
		color: #e8e6e3;
		background: rgba(255, 255, 255, 0.03);
	}
	.tickers-refresh-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.tickers-dot {
		width: 5px;
		height: 5px;
		background: #2d9f6f;
		border-radius: 9999px;
		animation: pulse 2s infinite;
	}
	.tickers-dot.stale {
		background: #d4874d;
	}
	:global(.tickers-spinner) {
		animation: spin 1s linear infinite;
		color: #6b6b76;
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

	.tickers-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}
	.tickers-card-label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}
	.tickers-card-label.gold {
		color: #c9a84c;
	}
	.tickers-card-label.silver {
		color: #8a94a8;
	}

	/* Chips */
	.tickers-chips {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}
	.tickers-chip {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 10px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid #2a2a36;
		color: #6b6b76;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-chip:hover {
		border-color: #6b6b76;
	}
	.tickers-chip.active-gold {
		background: #c9a84c;
		color: #0f0f14;
		border-color: #c9a84c;
		font-weight: 600;
	}
	.tickers-chip.active-silver {
		background: #8a94a8;
		color: #0f0f14;
		border-color: #8a94a8;
		font-weight: 600;
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
		color: #6b6b76;
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
		color: #6b6b76;
	}

	/* Spread */
	.tickers-spread-row {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding-top: 12px;
		margin-top: 4px;
		border-top: 1px solid #2a2a36;
		gap: 6px;
	}
	.tickers-spread-label {
		font-size: 10px;
		color: #6b6b76;
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
		background: #1a1a24;
		border: 1px solid #2a2a36;
		border-radius: 12px;
		padding: 20px;
	}
	.tickers-chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		flex-wrap: wrap;
		gap: 12px;
	}
	.tickers-chart-tabs {
		display: flex;
		gap: 4px;
	}
	.tickers-chart-tab {
		font-family: 'Geist', 'Geist Sans', system-ui, sans-serif;
		font-size: 12px;
		font-weight: 500;
		padding: 6px 14px;
		border-radius: 4px;
		border: 1px solid #2a2a36;
		color: #6b6b76;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-chart-tab:hover {
		border-color: #6b6b76;
	}
	.tickers-chart-tab.active-gold {
		background: rgba(201, 168, 76, 0.15);
		color: #c9a84c;
		border-color: rgba(201, 168, 76, 0.3);
		font-weight: 600;
	}
	.tickers-chart-tab.active-silver {
		background: rgba(138, 148, 168, 0.15);
		color: #8a94a8;
		border-color: rgba(138, 148, 168, 0.3);
		font-weight: 600;
	}
	.tickers-chart-durations {
		display: flex;
		gap: 4px;
	}
	.tickers-duration-chip {
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-size: 10px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid #2a2a36;
		color: #6b6b76;
		background: transparent;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.tickers-duration-chip:hover {
		border-color: #6b6b76;
	}
	.tickers-duration-chip.active {
		background: rgba(232, 230, 227, 0.08);
		color: #e8e6e3;
		border-color: rgba(232, 230, 227, 0.2);
		font-weight: 600;
	}

	.tickers-chart-body {
		min-height: 340px;
	}

	.tickers-chart-placeholder,
	.tickers-chart-loading {
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

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
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
