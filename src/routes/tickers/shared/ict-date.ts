// ICT (Asia/Ho_Chi_Minh) calendar date helper — "YYYY-MM-DD" regardless of host TZ.
// Used by every VN-source client (VCB, Phu Quy, …) to bucket data by local calendar day
// on both Workers SSR and in the browser.

export function toICTDate(d: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Ho_Chi_Minh',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(d)
}

// UTC calendar date (YYYY-MM-DD) — counterpart to toICTDate. Use when a payload's bucketing
// is conventionally UTC and downstream consumers need to compare against other UTC-bucketed
// values (e.g. Binance daily klines stamped at 00:00 UTC, SSI daily bars stamped at 00:00 UTC
// of the trading day). NOT for VN-local-day comparisons — that's `toICTDate`.
export function toUTCDate(d: Date | number): string {
	const date = typeof d === 'number' ? new Date(d) : d
	return date.toISOString().split('T')[0]
}
