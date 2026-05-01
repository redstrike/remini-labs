// VCB Forex client — Vietcombank published FX rates against VND.
// Dual-runtime: runs identically under Workers SSR and in the browser (CORS works both ways).
//
// Endpoint: https://www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD
// Weekend/holiday days auto-roll to the last business-day close (VCB-side), so no
// client walk-back logic is needed.

import { createFetchWithTimeout } from './fetch-with-timeout'
import { toICTDate } from './ict-date'
import { formatTiered } from './number-format'

// Display order: Tier A (pinned) then Tier B then Tier C — sorted by real-world
// retail/remittance volume rather than VCB's alphabetic API order.
export const VCB_CURRENCY_ORDER = [
	'USD',
	'EUR',
	'JPY',
	'CNY',
	'KRW', // Tier A — pinned top 5
	'GBP',
	'AUD',
	'SGD',
	'THB',
	'CAD',
	'HKD',
	'CHF', // Tier B — common
	'MYR',
	'INR',
	'DKK',
	'SEK',
	'NOK',
	'SAR',
	'KWD',
	'RUB', // Tier C — thin volume
] as const

export type VcbCurrencyCode = (typeof VCB_CURRENCY_ORDER)[number]

// Tier boundaries — Tier A = pinned 5, Tier B = common 7, Tier C = thin-volume 8.
export const VCB_TIER_A_COUNT = 5
export const VCB_TIER_B_COUNT = 7

// Row indices where a tier divider should render (above that row).
export const VCB_TIER_DIVIDER_INDICES: readonly number[] = [VCB_TIER_A_COUNT, VCB_TIER_A_COUNT + VCB_TIER_B_COUNT]

// Currency → ISO 3166 alpha-2 country code (flag filename).
// EUR uses `eu` (EU flag). Exhaustive on VcbCurrencyCode — TS build breaks if a code is missing.
const CODE_TO_FLAG: Record<VcbCurrencyCode, string> = {
	USD: 'us',
	EUR: 'eu',
	JPY: 'jp',
	CNY: 'cn',
	KRW: 'kr',
	GBP: 'gb',
	AUD: 'au',
	SGD: 'sg',
	THB: 'th',
	CAD: 'ca',
	HKD: 'hk',
	CHF: 'ch',
	MYR: 'my',
	INR: 'in',
	DKK: 'dk',
	SEK: 'se',
	NOK: 'no',
	SAR: 'sa',
	KWD: 'kw',
	RUB: 'ru',
}

// Bundled flag SVGs via Vite `?url` eager glob — emitted as separate fingerprinted files
// under /_app/immutable/assets/<name>-<hash>.svg. Not inlined into JS.
const flagModules = import.meta.glob('../assets/flags/*.svg', {
	query: '?url',
	import: 'default',
	eager: true,
}) as Record<string, string>

export function flagUrl(code: VcbCurrencyCode): string {
	return flagModules[`../assets/flags/${CODE_TO_FLAG[code]}.svg`]
}

// Format a VND amount as its approximate equivalent in a foreign currency, using VCB's
// `avg` rate. Returns a plain decimal with thousands-grouping — currency symbol is NOT
// included, since the Bullion sub-panel already identifies the currency via flag + code.
// Decimal precision follows the shared tiered rule (see ./number-format).
//
// Locale: vi-VN (dot-thousands, comma-decimal) so the separator convention matches the
// main Bullion row's kVND display ("168.750" · etc.). Mixing en-US (",") would visually
// clash within one card.
export function formatForeign(vnd: number, rateVndPerUnit: number): string {
	if (!rateVndPerUnit || rateVndPerUnit <= 0 || !Number.isFinite(vnd)) return '—'
	return formatTiered(vnd / rateVndPerUnit, 'vi-VN')
}

// --- VCB wire format ----------------------------------------------------

interface VcbRawRow {
	currencyName: string
	currencyCode: string
	cash: string // "0.00" when transfer-only
	transfer: string
	sell: string
	icon: string // VCB CDN path — unused, we use bundled flags
}

interface VcbRawResponse {
	Count: number
	Date: string // "2026-04-21T00:00:00"
	UpdatedDate: string // ISO with +07:00 offset
	Data: VcbRawRow[]
}

// --- Normalized shape ---------------------------------------------------

export interface VcbRate {
	code: VcbCurrencyCode
	buy: number // transfer rate — the "buy" column in the UI
	sell: number
	avg: number // (buy + sell) / 2 — unbiased mid-market
}

export interface VcbSnapshot {
	date: string // "YYYY-MM-DD" in ICT
	updatedAt: string // ISO with +07:00 offset — VCB's UpdatedDate verbatim
	rates: Map<VcbCurrencyCode, VcbRate>
}

const VCB_ENDPOINT = 'https://www.vietcombank.com.vn/api/exchangerates'

function isKnownCurrency(code: string): code is VcbCurrencyCode {
	return (VCB_CURRENCY_ORDER as readonly string[]).includes(code)
}

// VCB buckets by ICT calendar day — re-export under a VCB-flavoured name for call sites
// that read better locally (`toVcbDateParam`) while the implementation lives in one place.
export const toVcbDateParam = toICTDate

// Yesterday in ICT — simple -24h; VCB auto-rolls weekend dates to last business close.
export function vcbYesterday(today: Date = new Date()): Date {
	return new Date(today.getTime() - 24 * 60 * 60 * 1000)
}

// VCB's TLS handshake is slower than the other upstreams (8s vs 5s default) — calibrated
// from observed p99 in probe-upstreams runs. Don't lower without re-measuring.
const withTimeout = createFetchWithTimeout({
	timeoutMs: 8_000,
	headers: { 'User-Agent': 'Mozilla/5.0' },
})

export async function fetchVcbSnapshot(date: Date): Promise<VcbSnapshot> {
	const dateStr = toVcbDateParam(date)
	const res = await withTimeout(`${VCB_ENDPOINT}?date=${dateStr}`)
	if (!res.ok) throw new Error(`VCB returned ${res.status}`)
	const raw = (await res.json()) as VcbRawResponse

	const rates = new Map<VcbCurrencyCode, VcbRate>()
	for (const row of raw.Data) {
		if (!isKnownCurrency(row.currencyCode)) continue
		const buy = parseFloat(row.transfer)
		const sell = parseFloat(row.sell)
		if (!Number.isFinite(buy) || !Number.isFinite(sell)) continue
		rates.set(row.currencyCode, {
			code: row.currencyCode,
			buy,
			sell,
			avg: (buy + sell) / 2,
		})
	}

	return {
		date: dateStr,
		updatedAt: raw.UpdatedDate,
		rates,
	}
}

// 24h change on `avg` — neutral (less biased than sell-only). Returns null when prior unknown.
export function computeDelta24h(today: VcbRate, yesterday: VcbRate | undefined): number | null {
	if (!yesterday || yesterday.avg === 0) return null
	return ((today.avg - yesterday.avg) / yesterday.avg) * 100
}

// --- Formatters ---------------------------------------------------------

// VND rate formatter — vi-VN locale for dot-thousands / comma-decimal (matches the
// existing formatVND in use-tickers). JPY/KRW rates come as small 2–3 digit numbers
// (161.49, 17.19); major currencies (USD/EUR/…) as 4–5 digit integers. The shared
// money-tier rule picks the right decimals for each.
export function formatForexPrice(value: number): string {
	return formatTiered(value, 'vi-VN')
}

const pctFmt = new Intl.NumberFormat('vi-VN', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	signDisplay: 'always',
})

// Rounding-noise threshold — below this, show flat indicator instead of jittery ±0.00%.
const FLAT_THRESHOLD = 0.005

export type DeltaSign = 'up' | 'down' | 'flat' | 'unknown'

export function formatDelta(pct: number | null): { sign: DeltaSign; text: string } {
	if (pct === null) return { sign: 'unknown', text: '—' }
	if (Math.abs(pct) < FLAT_THRESHOLD) return { sign: 'flat', text: '0.00%' }
	return {
		sign: pct > 0 ? 'up' : 'down',
		text: pctFmt.format(pct) + '%',
	}
}
