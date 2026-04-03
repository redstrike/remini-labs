const BASE_URL = 'https://be.phuquy.com.vn/jewelry/product-payment-service/api'

const HEADERS = {
	'User-Agent': 'ReminiLabs/1.0',
	Accept: 'application/json',
}

const FETCH_TIMEOUT_MS = 5000

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
	serverTime: string // ISO 8601 — server clock at response time
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

export interface ChartData {
	changeRate: number
	points: ChartPoint[]
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

// Use global fetch for external API calls. SvelteKit's event.fetch adds Origin headers
// that can trigger CORS 403 rejections from third-party APIs.
function withTimeout(url: string, init?: RequestInit): Promise<Response> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

	return globalThis.fetch(url, {
		...init,
		signal: controller.signal,
		headers: { ...HEADERS, ...init?.headers },
	}).finally(() => clearTimeout(timeout))
}

function defaultUnit(type: number, unitOfMeasure: string | null): string {
	if (unitOfMeasure) return unitOfMeasure
	return type === 1 ? 'VND/chi' : 'VND/luong'
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
			unit: defaultUnit(item.type, item.unitOfMeasure),
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
		serverTime: new Date().toISOString(),
	}
}

export async function fetchPriceSummary(): Promise<PriceSummary[]> {
	const res = await withTimeout(`${BASE_URL}/products/get-price`)
	if (!res.ok) throw new Error(`Phu Quy API returned ${res.status}`)

	const json: PhuQuyResponse<PhuQuySummaryItem[]> = await res.json()
	if (json.errorCode !== '0') throw new Error(`Phu Quy API error: ${json.message}`)

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
