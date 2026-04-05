<script module lang="ts">
	export type CandleSize = '1D' | '3D' | '1W'
</script>

<script lang="ts">
	import { onMount } from 'svelte'
	import type { ChartData, OHLCCandle } from './api/phuquy-client'

	export interface PriceFormatConfig {
		format: (v: number) => string
		formatCompact: (v: number) => string
		formatAxis: (v: number) => string
	}

	let {
		data,
		accentColor = '#c9a84c',
		candleSize = '1D',
		priceFormatter,
	}: {
		data: ChartData
		accentColor?: string
		candleSize?: CandleSize
		priceFormatter?: PriceFormatConfig
	} = $props()

	// eslint-disable-next-line no-unassigned-vars -- assigned by bind:this in template
	let containerEl: HTMLDivElement
	let chart: any = null
	let chartReady = $state(false)
	let candleSeries: any = null
	let extremePrimitive: any = null
	let candlesMap = new Map<string, OHLCCandle>()

	let hoverCandle = $state<OHLCCandle | null>(null)

	function getBucketKey(timestamp: string, size: CandleSize): string {
		if (size === '1D') return timestamp.split('T')[0]
		const n = size === '1W' ? 7 : 3
		const epochDays = Math.floor(Date.parse(timestamp) / 86400000)
		const bucketStart = Math.floor(epochDays / n) * n
		return new Date(bucketStart * 86400000).toISOString().split('T')[0]
	}

	function buildCandles(points: ChartData['points'], size: CandleSize): OHLCCandle[] {
		const byBucket = new Map<string, number[]>()
		for (const p of points) {
			const key = getBucketKey(p.timestamp, size)
			if (!byBucket.has(key)) byBucket.set(key, [])
			byBucket.get(key)!.push(p.sellPrice)
		}
		const candles: OHLCCandle[] = []
		for (const [time, sells] of byBucket) {
			candles.push({
				time,
				open: sells[0],
				close: sells[sells.length - 1],
				high: Math.max(...sells),
				low: Math.min(...sells),
			})
		}
		return candles.sort((a, b) => a.time.localeCompare(b.time))
	}

	function mergeCandles(candles: OHLCCandle[], size: CandleSize): OHLCCandle[] {
		if (size === '1D') return candles
		const byBucket = new Map<string, OHLCCandle[]>()
		for (const c of candles) {
			const key = getBucketKey(c.time + 'T00:00:00Z', size)
			if (!byBucket.has(key)) byBucket.set(key, [])
			byBucket.get(key)!.push(c)
		}
		const merged: OHLCCandle[] = []
		for (const [time, group] of byBucket) {
			merged.push({
				time,
				open: group[0].open,
				close: group[group.length - 1].close,
				high: Math.max(...group.map((c) => c.high)),
				low: Math.min(...group.map((c) => c.low)),
			})
		}
		return merged.sort((a, b) => a.time.localeCompare(b.time))
	}

	function periodStats(candles: OHLCCandle[]) {
		if (!candles.length) return null
		return {
			open: candles[0].open,
			close: candles[candles.length - 1].close,
			high: Math.max(...candles.map((c) => c.high)),
			low: Math.min(...candles.map((c) => c.low)),
		}
	}

	let allCandles = $derived(
		data.candles?.length ? mergeCandles(data.candles, candleSize) : buildCandles(data.points, candleSize),
	)
	let summary = $derived(periodStats(allCandles))
	let display = $derived(hoverCandle ?? (allCandles.length ? allCandles[allCandles.length - 1] : null))
	let isUp = $derived(display ? display.close >= display.open : true)

	const defaultFmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
	const defaultFmtM = (v: number) => {
		if (v >= 1_000_000 || v <= -1_000_000) {
			const m = v / 1_000_000
			return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
		}
		if (v >= 1_000 || v <= -1_000) {
			const k = v / 1_000
			return `${Number.isInteger(k) ? k : k.toFixed(1)}K`
		}
		return defaultFmt(v)
	}
	const defaultFmtAxis = (v: number) => {
		if (v >= 1_000_000) {
			const m = v / 1_000_000
			return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`
		}
		return defaultFmt(v)
	}

	const fmt = $derived(priceFormatter?.format ?? defaultFmt)
	const fmtM = $derived(priceFormatter?.formatCompact ?? defaultFmtM)
	const fmtAxis = $derived(priceFormatter?.formatAxis ?? defaultFmtAxis)

	onMount(() => {
		let ro: ResizeObserver | null = null

		import('lightweight-charts').then(({ createChart, CandlestickSeries, CrosshairMode }) => {
			chart = createChart(containerEl, {
				autoSize: true,
				layout: {
					background: { color: 'transparent' },
					textColor: '#6b6b76',
					fontFamily: "'Geist Mono', 'GeistMono', monospace",
					fontSize: 10,
				},
				grid: {
					vertLines: { color: 'rgba(42, 42, 54, 0.3)' },
					horzLines: { color: 'rgba(42, 42, 54, 0.3)' },
				},
				rightPriceScale: {
					borderColor: '#2a2a36',
					scaleMargins: { top: 0.12, bottom: 0.12 },
				},
				timeScale: {
					borderColor: '#2a2a36',
					timeVisible: false,
				},
				crosshair: {
					mode: CrosshairMode.Normal,
					vertLine: {
						color: 'rgba(255, 255, 255, 0.1)',
						width: 1,
						style: 3,
						labelBackgroundColor: '#121218',
					},
					horzLine: {
						color: 'rgba(255, 255, 255, 0.1)',
						width: 1,
						style: 3,
						labelBackgroundColor: '#121218',
					},
				},
			})

			candleSeries = chart.addSeries(CandlestickSeries, {
				upColor: '#2d9f6f',
				downColor: '#c44e4e',
				borderUpColor: '#2d9f6f',
				borderDownColor: '#c44e4e',
				wickUpColor: '#2d9f6f',
				wickDownColor: '#c44e4e',
				priceFormat: { type: 'custom', formatter: (v: number) => fmtAxis(v) },
			})

			chart.subscribeCrosshairMove((param: any) => {
				if (!param.time) {
					hoverCandle = null
					return
				}
				const key =
					typeof param.time === 'string'
						? param.time
						: `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`
				hoverCandle = candlesMap.get(key) ?? null
			})

			chartReady = true
			updateData(data)

			ro = new ResizeObserver(() => {
				applyTimeScale(candlesMap.size)
			})
			ro.observe(containerEl)
		})

		return () => {
			chart?.remove()
			ro?.disconnect()
		}
	})

	function updateData(d: ChartData) {
		if (!candleSeries) return
		const candles = d.candles?.length ? mergeCandles(d.candles, candleSize) : buildCandles(d.points, candleSize)

		candlesMap.clear()
		for (const c of candles) candlesMap.set(c.time, c)

		candleSeries.setData(
			candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
		)

		// Peak/bottom: short horizontal line + price label (custom primitive)
		if (extremePrimitive) {
			candleSeries.detachPrimitive(extremePrimitive)
			extremePrimitive = null
		}

		if (candles.length >= 2) {
			let peakCandle = candles[0]
			let bottomCandle = candles[0]
			for (const c of candles) {
				if (c.high > peakCandle.high) peakCandle = c
				if (c.low < bottomCandle.low) bottomCandle = c
			}

			const _chart = chart
			const _series = candleSeries
			const _fmt = fmt
			const _peak = peakCandle
			const _bottom = bottomCandle

			extremePrimitive = {
				updateAllViews() {},
				paneViews() {
					return [
						{
							zOrder() {
								return 'top'
							},
							renderer() {
								return {
									draw(target: any) {
										target.useBitmapCoordinateSpace(
											({
												context,
												bitmapSize,
												horizontalPixelRatio,
												verticalPixelRatio,
											}: any) => {
												const ts = _chart.timeScale()
												const lineW = Math.round(12 * horizontalPixelRatio)
												const gap = Math.round(2 * horizontalPixelRatio)
												const fontSize = Math.round(9 * verticalPixelRatio)
												context.font = `${fontSize}px "Geist Mono", monospace`

												// Draw a marker: auto-flips to left when label would overflow right edge
												function drawMarker(x: number, y: number, label: string) {
													const textW = context.measureText(label).width
													const totalRight = x + lineW + gap + textW
													// Flip to left if marker+label would go past the price scale area
													const chartRight =
														bitmapSize.width - Math.round(60 * horizontalPixelRatio)
													const goLeft = totalRight > chartRight

													context.strokeStyle = 'rgba(255, 255, 255, 0.5)'
													context.lineWidth = Math.max(1, horizontalPixelRatio)
													context.beginPath()
													if (goLeft) {
														context.moveTo(x, y)
														context.lineTo(x - lineW, y)
													} else {
														context.moveTo(x, y)
														context.lineTo(x + lineW, y)
													}
													context.stroke()

													context.fillStyle = 'rgba(255, 255, 255, 0.6)'
													if (goLeft) {
														context.textAlign = 'right'
														context.fillText(
															label,
															x - lineW - gap,
															y + Math.round(3 * verticalPixelRatio),
														)
													} else {
														context.textAlign = 'left'
														context.fillText(
															label,
															x + lineW + gap,
															y + Math.round(3 * verticalPixelRatio),
														)
													}
												}

												// Peak
												const peakX = ts.timeToCoordinate(_peak.time)
												const peakY = _series.priceToCoordinate(_peak.high)
												if (peakX !== null && peakY !== null) {
													drawMarker(
														Math.round(peakX * horizontalPixelRatio),
														Math.round(peakY * verticalPixelRatio),
														_fmt(_peak.high),
													)
												}

												// Bottom
												if (_bottom.time !== _peak.time) {
													const bottomX = ts.timeToCoordinate(_bottom.time)
													const bottomY = _series.priceToCoordinate(_bottom.low)
													if (bottomX !== null && bottomY !== null) {
														drawMarker(
															Math.round(bottomX * horizontalPixelRatio),
															Math.round(bottomY * verticalPixelRatio),
															_fmt(_bottom.low),
														)
													}
												}
											},
										)
									},
								}
							},
						},
					]
				},
			}

			candleSeries.attachPrimitive(extremePrimitive)
		}

		applyTimeScale(candlesMap.size)
	}

	// Candle width steps down 1px (mobile) per interval tier.
	// Mobile: 11 → 10 → 9 → 8 → 7 → 6 (7D → 15D → 30D → 90D → 180D → 1Y)
	// Desktop scales proportionally with the same 6 tiers.
	const REFERENCE_CANDLES = 30

	function applyTimeScale(numCandles: number) {
		if (!chart) return
		const isMobile = containerEl.clientWidth < 640
		const standardSpacing = isMobile ? 10 : 17
		const step = isMobile ? 1 : 2

		// Tier based on 1D-equivalent count (interval-driven)
		const sizeFactor = candleSize === '1W' ? 7 : candleSize === '3D' ? 3 : 1
		const equiv1D = numCandles * sizeFactor

		let tier = 0
		if (equiv1D > 200) tier = 3
		else if (equiv1D > 100) tier = 2
		else if (equiv1D > REFERENCE_CANDLES) tier = 1
		else if (equiv1D <= 10) tier = -2
		else if (equiv1D <= 20) tier = -1

		const baseSpacing = standardSpacing - step * tier
		const sizeBonus = candleSize === '1W' ? step * 2 : candleSize === '3D' ? step : 0
		const barSpacing = Math.max(5, baseSpacing + sizeBonus)

		chart.timeScale().applyOptions({ barSpacing })
		chart.timeScale().scrollToRealTime()
	}

	$effect(() => {
		// Track candleSize + data so Svelte re-runs when either changes.
		// priceFormatter is handled by the fmtAxis closure — no applyOptions needed.
		const _size = candleSize
		if (data && chartReady) updateData(data)
	})
</script>

{#if summary}
	{@const periodAbs = summary.close - summary.open}
	{@const periodPct = summary.open ? (periodAbs / summary.open) * 100 : 0}
	{@const periodUp = periodAbs >= 0}
	<div class="period-change" class:up={periodUp} class:down={!periodUp}>
		<span class="period-change-value">{periodUp ? '+' : ''}{fmt(periodAbs)}</span>
		<span class="period-change-pct">{periodUp ? '+' : ''}{periodPct.toFixed(2)}%</span>
	</div>
{/if}

<div class="ohlc-bar">
	{#if display}
		{@const change = display.close - display.open}
		{@const changePct = display.open ? (change / display.open) * 100 : 0}
		<span class="ohlc-item"
			><span class="ohlc-label">O</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}
				>{fmtM(display.open)}</span
			></span>
		<span class="ohlc-item"
			><span class="ohlc-label">H</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}
				>{fmtM(display.high)}</span
			></span>
		<span class="ohlc-item"
			><span class="ohlc-label">L</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}
				>{fmtM(display.low)}</span
			></span>
		<span class="ohlc-item"
			><span class="ohlc-label">C</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}
				>{fmtM(display.close)}</span
			></span>
		<span class="ohlc-change" class:up={change >= 0} class:down={change < 0}>
			{change >= 0 ? '+' : ''}{fmtM(change)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
		</span>
	{/if}
</div>

<div class="chart-container" bind:this={containerEl}></div>

<style>
	.chart-container {
		width: 100%;
		height: 340px;
	}
	.period-change {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 4px 2px 2px;
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.period-change-value {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.period-change-pct {
		font-size: 13px;
		font-weight: 600;
	}
	.period-change.up {
		color: #2d9f6f;
	}
	.period-change.down {
		color: #c44e4e;
	}
	.ohlc-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 2px;
		flex-wrap: wrap;
		min-height: 28px;
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.ohlc-item {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.ohlc-label {
		font-size: 10px;
		font-weight: 500;
		color: #6b6b76;
	}
	.ohlc-val {
		font-size: 11px;
		font-weight: 600;
		color: #e8e6e3;
	}
	.ohlc-val.up {
		color: #2d9f6f;
	}
	.ohlc-val.down {
		color: #c44e4e;
	}
	.ohlc-change {
		font-size: 11px;
		font-weight: 600;
		margin-left: 2px;
	}
	.ohlc-change.up {
		color: #2d9f6f;
	}
	.ohlc-change.down {
		color: #c44e4e;
	}
</style>
