<script lang="ts">
	import { onMount } from 'svelte'
	import type { ChartData } from './api/phuquy-client'

	let {
		data,
		accentColor = '#c9a84c',
	}: {
		data: ChartData
		accentColor?: string
	} = $props()

	let containerEl: HTMLDivElement
	let chart: any = null
	let candleSeries: any = null
	let extremePrimitive: any = null
	let candlesMap = new Map<string, OHLCCandle>()

	let hoverCandle = $state<OHLCCandle | null>(null)

	interface OHLCCandle {
		time: string
		open: number
		high: number
		low: number
		close: number
	}

	function buildCandles(points: ChartData['points']): OHLCCandle[] {
		const byDay = new Map<string, number[]>()
		for (const p of points) {
			const day = p.timestamp.split('T')[0]
			if (!byDay.has(day)) byDay.set(day, [])
			byDay.get(day)!.push(p.sellPrice)
		}
		const candles: OHLCCandle[] = []
		for (const [day, sells] of byDay) {
			candles.push({
				time: day,
				open: sells[0],
				close: sells[sells.length - 1],
				high: Math.max(...sells),
				low: Math.min(...sells),
			})
		}
		return candles.sort((a, b) => a.time.localeCompare(b.time))
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

	let allCandles = $derived(buildCandles(data.points))
	let summary = $derived(periodStats(allCandles))
	let display = $derived(hoverCandle ?? (allCandles.length ? allCandles[allCandles.length - 1] : null))
	let isUp = $derived(display ? display.close >= display.open : true)

	const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v)

	onMount(() => {
		import('lightweight-charts').then(({ createChart, CandlestickSeries, CrosshairMode }) => {
			chart = createChart(containerEl, {
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
					vertLine: { color: 'rgba(255, 255, 255, 0.1)', width: 1, style: 3, labelBackgroundColor: '#1a1a24' },
					horzLine: { color: 'rgba(255, 255, 255, 0.1)', width: 1, style: 3, labelBackgroundColor: '#1a1a24' },
				},
				autoSize: true,
			})

			candleSeries = chart.addSeries(CandlestickSeries, {
				upColor: '#2d9f6f',
				downColor: '#c44e4e',
				borderUpColor: '#2d9f6f',
				borderDownColor: '#c44e4e',
				wickUpColor: '#2d9f6f',
				wickDownColor: '#c44e4e',
				priceFormat: { type: 'custom', formatter: (v: number) => fmt(v) },
			})

			chart.subscribeCrosshairMove((param: any) => {
				if (!param.time) {
					hoverCandle = null
					return
				}
				const key = typeof param.time === 'string'
					? param.time
					: `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`
				hoverCandle = candlesMap.get(key) ?? null
			})

			updateData(data)
		})

		return () => { chart?.remove() }
	})

	function updateData(d: ChartData) {
		if (!candleSeries) return
		const candles = buildCandles(d.points)

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
					return [{
						zOrder() { return 'top' },
						renderer() {
							return {
								draw(target: any) {
									target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: any) => {
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
											const chartRight = bitmapSize.width - Math.round(60 * horizontalPixelRatio)
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
												context.fillText(label, x - lineW - gap, y + Math.round(3 * verticalPixelRatio))
											} else {
												context.textAlign = 'left'
												context.fillText(label, x + lineW + gap, y + Math.round(3 * verticalPixelRatio))
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
									})
								}
							}
						}
					}]
				}
			}

			candleSeries.attachPrimitive(extremePrimitive)
		}

		chart?.timeScale().fitContent()
	}

	$effect(() => {
		if (data && chart) updateData(data)
	})
</script>

{#if summary}
	{@const periodAbs = summary.close - summary.open}
	{@const periodPct = summary.open ? ((periodAbs / summary.open) * 100) : 0}
	{@const periodUp = periodAbs >= 0}
	<div class="period-change" class:up={periodUp} class:down={!periodUp}>
		<span class="period-change-value">{periodUp ? '+' : ''}{fmt(periodAbs)}</span>
		<span class="period-change-pct">{periodUp ? '+' : ''}{periodPct.toFixed(2)}%</span>
	</div>
{/if}

<div class="ohlc-bar">
	{#if display}
		{@const change = display.close - display.open}
		{@const changePct = display.open ? ((change / display.open) * 100) : 0}
		<span class="ohlc-item"><span class="ohlc-label">O</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}>{fmt(display.open)}</span></span>
		<span class="ohlc-item"><span class="ohlc-label">H</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}>{fmt(display.high)}</span></span>
		<span class="ohlc-item"><span class="ohlc-label">L</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}>{fmt(display.low)}</span></span>
		<span class="ohlc-item"><span class="ohlc-label">C</span><span class="ohlc-val" class:up={isUp} class:down={!isUp}>{fmt(display.close)}</span></span>
		<span class="ohlc-change" class:up={change >= 0} class:down={change < 0}>
			{change >= 0 ? '+' : ''}{fmt(change)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
		</span>
		{#if !hoverCandle}<span class="ohlc-period-tag">Latest</span>{/if}
	{/if}
</div>

<div class="chart-container" bind:this={containerEl}></div>

<style>
	.chart-container { width: 100%; height: 340px; }
	.period-change {
		display: flex; align-items: baseline; gap: 8px;
		padding: 4px 2px 2px;
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.period-change-value { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
	.period-change-pct { font-size: 13px; font-weight: 600; }
	.period-change.up { color: #2d9f6f; }
	.period-change.down { color: #c44e4e; }
	.ohlc-bar {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 2px; flex-wrap: wrap; min-height: 28px;
		font-family: 'Geist Mono', 'GeistMono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.ohlc-item { display: inline-flex; align-items: center; gap: 3px; }
	.ohlc-label { font-size: 10px; font-weight: 500; color: #4a4a56; }
	.ohlc-val { font-size: 11px; font-weight: 600; color: #e8e6e3; }
	.ohlc-val.up { color: #2d9f6f; }
	.ohlc-val.down { color: #c44e4e; }
	.ohlc-change { font-size: 11px; font-weight: 600; margin-left: 2px; }
	.ohlc-change.up { color: #2d9f6f; }
	.ohlc-change.down { color: #c44e4e; }
	.ohlc-period-tag {
		font-size: 9px; font-weight: 500; color: #4a4a56;
		padding: 1px 5px; border: 1px solid #2a2a36; border-radius: 3px;
	}
</style>
