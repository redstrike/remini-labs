import { createFetchWithTimeout } from './fetch-with-timeout'
import { toICTDate } from './ict-date'
import { pctChange } from './number-format'

const BASE_URL = 'https://be.phuquy.com.vn/jewelry/product-payment-service/api'

// --- Types ---

export interface PriceSummary {
	id: string // "B" | "V" | "S"
	name: string // "Bac PQ" | "Vang PQ" | "SJC"
	buyPerChi: number
	sellPerChi: number
	buyPerLuong: number
	sellPerLuong: number
	changePercent: number
}

export interface PriceTableItem {
	productType: string // "SJC", "NPQ", "BPQ1KG", or productTypeName as fallback
	name: string
	buyPrice: number // VND (per chi for gold, per luong or per kg for silver)
	sellPrice: number
	type: 1 | 2 // 1 = gold, 2 = silver
	unit: string // "VND/chi", "VND/luong", "VND/kg"
	buyDirection: number | null // 1 = up, 0 = flat, -1 = down
	sellDirection: number | null
	updatedAt: string // ISO 8601
}

export interface PriceTable {
	gold: PriceTableItem[]
	silver: PriceTableItem[]
	updatedAt: string
	// 24h stats computed from 1D intraday chart — optional because `fetchPriceTable` alone
	// returns the spot snapshot only; the spots/metals API composes dayStats on top. Null
	// per-asset if that metal's chart fetch failed (spot prices still render; UI falls back
	// to "—" for the missing stats).
	dayStats?: {
		gold: DayStats | null
		silver: DayStats | null
	}
	// VCB USD/VND mid-market rate used for the Avg (USD) reference column on metal cards.
	// Server-cached separately from the table so the rate refreshes on VCB's publishing
	// cadence (1–3×/day) rather than the 15-min metals poll. null = VCB has been
	// unreachable AND no stale cached rate is available; UI renders "—" for USD cells.
	usdVndAvg?: number | null
}

export interface IntradayPoint {
	timestamp: string
	buyPrice: number
	sellPrice: number
}

export interface ChartPoint {
	timestamp: string
	buyPrice: number
	sellPrice: number
}

export interface OHLCCandle {
	time: string // 'YYYY-MM-DD'
	open: number
	high: number
	low: number
	close: number
}

export interface ChartData {
	changeRate: number
	points: ChartPoint[] // metals: raw intraday points
	candles?: OHLCCandle[] // crypto: pre-built daily OHLC
}

// Compact 24h summary for the spot cards — small enough to inline in the PriceTable
// response. Low/high in per-chi native units (caller converts to per-luong/per-kg for display).
export interface DayStats {
	changePercent: number
	low: number
	high: number
}

// --- Upstream API response types (raw from Phu Quy) ---

interface PhuQuyResponse<T> {
	errorCode: string
	message: string
	data: T
}

interface PhuQuyTableItem {
	productType: string | null
	productTypeName: string
	priceIn: number
	priceOut: number
	stt: number | null
	priceInIncrease: number | null
	priceOutIncrease: number | null
	lastUpdate: string
	type: number
	unitOfMeasure: string | null
	company: number
	description: string | null
}

interface PhuQuySummaryItem {
	idx: string
	name: string
	priceChangePercent: number
	priceBuyTael: number
	priceSellTael: number
	id: string
	buyprice: number
	sellprice: number
	unit_name: string
}

interface PhuQuyIntradayItem {
	id: number
	productType: string
	priceIn: number
	priceOut: number
	lastUpdate: string
	priceInKg: number
	priceOutKg: number
}

// Chart data is keyed by product type: { "SJC": {...}, "NPQ": {...} } for gold, { "BAC": {...} } for silver
interface PhuQuyChartEntry {
	changeRate: number
	pricePointInfoList: Array<{
		lastUpdate: string
		priceIn: number
		priceOut: number
	}>
}

// --- Fetch helpers ---

const withTimeout = createFetchWithTimeout({
	timeoutMs: 5_000,
	headers: {
		'User-Agent': 'ReminiLabs/1.0',
		Accept: 'application/json',
	},
})

function normalizeUnit(type: number, unitOfMeasure: string | null): string {
	if (!unitOfMeasure) return type === 1 ? 'VND/chi' : 'VND/luong'
	// Phu Quy API sometimes returns "Vnđ" instead of "VND"
	return unitOfMeasure.replace(/Vnđ/gi, 'VND')
}

// --- Public API ---

export async function fetchPriceTable(): Promise<PriceTable> {
	const res = await withTimeout(`${BASE_URL}/sync-price-history/get-sync-table-history`)
	if (!res.ok) throw new Error(`Phu Quy API returned ${res.status}`)

	const json: PhuQuyResponse<PhuQuyTableItem[]> = await res.json()
	if (json.errorCode !== '0') throw new Error(`Phu Quy API error: ${json.message}`)

	const items = json.data.map(
		(item): PriceTableItem => ({
			productType: item.productType || item.productTypeName,
			name: item.productTypeName,
			buyPrice: item.priceIn,
			sellPrice: item.priceOut,
			type: item.type as 1 | 2,
			unit: normalizeUnit(item.type, item.unitOfMeasure),
			buyDirection: item.priceInIncrease,
			sellDirection: item.priceOutIncrease,
			updatedAt: item.lastUpdate,
		}),
	)

	const updatedAt = json.data[0]?.lastUpdate ?? new Date().toISOString()

	return {
		gold: items.filter((i) => i.type === 1),
		silver: items.filter((i) => i.type === 2),
		updatedAt,
	}
}

export async function fetchPriceSummary(): Promise<PriceSummary[]> {
	const res = await withTimeout(`${BASE_URL}/products/get-price`)
	if (!res.ok) throw new Error(`Phu Quy API returned ${res.status}`)

	const json: PhuQuyResponse<PhuQuySummaryItem[]> = await res.json()
	if (json.errorCode !== '0') throw new Error(`Phu Quy API error: ${json.message}`)
	if (!json.data) throw new Error('Phu Quy API returned no data')

	return json.data.map(
		(item): PriceSummary => ({
			id: item.id,
			name: item.name.trim(),
			buyPerChi: item.buyprice,
			sellPerChi: item.sellprice,
			buyPerLuong: item.priceBuyTael,
			sellPerLuong: item.priceSellTael,
			changePercent: item.priceChangePercent,
		}),
	)
}

export async function fetchIntradayHistory(productType: string): Promise<IntradayPoint[]> {
	const res = await withTimeout(
		`${BASE_URL}/sync-price-history/get-sync-history-today?productType=${encodeURIComponent(productType)}`,
	)
	if (!res.ok) throw new Error(`Phu Quy API returned ${res.status}`)

	const json: PhuQuyResponse<PhuQuyIntradayItem[]> = await res.json()
	if (json.errorCode !== '0') throw new Error(`Phu Quy API error: ${json.message}`)

	return json.data.map(
		(item): IntradayPoint => ({
			timestamp: item.lastUpdate,
			buyPrice: item.priceIn,
			sellPrice: item.priceOut,
		}),
	)
}

// API returns prices in VND/chi for both gold and silver.
// Gold: displayed per luong (1 luong = 10 chi), but gold chart uses SJC summary prices which are already per luong.
// Silver: user wants per kg (1 kg = 1000g / 37.5g per luong = 26.6667 luong = 266.667 chi).
const CHI_PER_KG = 266.667

// Note: Phu Quy's 6M endpoint is broken (returns ~1 week of data).
// The client handles 180D by fetching 1Y and filtering client-side with caching.

export async function fetchChartData(
	categoryId: number,
	type: number,
	duration: string,
	unit: 'chi' | 'kg' = 'chi',
): Promise<ChartData> {
	const res = await withTimeout(
		`${BASE_URL}/products/statistics-price/${categoryId}?type=${type}&duration=${encodeURIComponent(duration)}`,
	)
	if (!res.ok) throw new Error(`Phu Quy API returned ${res.status}`)

	const json: PhuQuyResponse<Record<string, PhuQuyChartEntry>> = await res.json()
	if (json.errorCode !== '0') throw new Error(`Phu Quy API error: ${json.message}`)

	// Pick the primary product: SJC for gold, BAC for silver, or first key
	const primaryKey = type === 1 ? 'SJC' : 'BAC'
	const entry = json.data[primaryKey] ?? Object.values(json.data)[0]
	if (!entry) throw new Error('No chart data in response')

	const multiplier = unit === 'kg' ? CHI_PER_KG : 1

	return {
		changeRate: entry.changeRate,
		points: entry.pricePointInfoList.map(
			(p): ChartPoint => ({
				timestamp: p.lastUpdate,
				buyPrice: Math.round(p.priceIn * multiplier),
				sellPrice: Math.round(p.priceOut * multiplier),
			}),
		),
	}
}

// Compute DayStats from a multi-day chart payload. Uses **last-business-day close** as the
// 24h reference — the last chart point whose ICT calendar date is strictly before today.
// This matches the standard "24h change" convention in financial UIs (CoinGecko, TradingView)
// and naturally handles weekends/holidays: reference is simply "the most recent prior close",
// not "exactly 24h ago".
//
// L/H are computed over today's intraday points only (not the 7-day range) — so the column
// genuinely reflects the day's range, not the week's.
//
// Requires a chart with ≥7 days of history (1D chart won't work — it lacks yesterday's close).
// Returns null when the chart has no reference point (first-ever trading day, empty data).
//
// Phu Quy timestamps are ICT-local (no TZ suffix), so `slice(0, 10)` extracts the ICT date
// directly — no Date parsing + reformatting needed.
export function computeDayStats(chart: ChartData | null, nowDate: Date = new Date()): DayStats | null {
	if (!chart || chart.points.length === 0) return null
	const todayICT = toICTDate(nowDate)
	const todayPoints: ChartPoint[] = []
	let reference: ChartPoint | null = null
	for (const p of chart.points) {
		const pointDate = p.timestamp.slice(0, 10)
		if (pointDate === todayICT) {
			todayPoints.push(p)
		} else if (pointDate < todayICT) {
			// Points arrive chronologically — last historical point = most recent prior close.
			reference = p
		}
	}
	if (!reference) return null

	const current = todayPoints.at(-1) ?? reference
	const changePercent = pctChange(reference.sellPrice, current.sellPrice)

	// L/H over today's points; if today has no points yet (pre-open), pin to current (= reference).
	const sample = todayPoints.length > 0 ? todayPoints : [current]
	let low = sample[0].sellPrice
	let high = low
	for (const p of sample) {
		if (p.sellPrice < low) low = p.sellPrice
		if (p.sellPrice > high) high = p.sellPrice
	}
	return { changePercent, low, high }
}
