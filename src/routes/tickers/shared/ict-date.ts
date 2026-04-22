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
