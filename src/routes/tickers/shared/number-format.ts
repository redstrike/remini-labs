// Single source of truth for numeric display precision — covers fiat, crypto, forex rates,
// and anything else that follows the "precision scales inversely with magnitude" convention.
// Callers pick locale ('en-US' comma-thousands · 'vi-VN' dot-thousands) and prepend any
// currency symbol or suffix they need.
//
//    >= 1000           → 0 decimal places
//    100 – 999         → 1 decimal place
//    1 – 99            → 2 decimal places
//    0.0001 – 0.9999   → 4 decimal places
//    < 0.0001          → 8 decimal places

function precisionFor(value: number): 0 | 1 | 2 | 4 | 8 {
	const abs = Math.abs(value)
	if (abs >= 1_000) return 0
	if (abs >= 100) return 1
	if (abs >= 1) return 2
	if (abs >= 0.0001) return 4
	return 8
}

// Intl.NumberFormat construction is not free, and one Bullion sub-panel renders ~20
// values per expand. Memoize by locale + decimals so each (locale, tier) pair is built
// at most once per session.
const formatterCache = new Map<string, Intl.NumberFormat>()

function formatterFor(decimals: number, locale: string): Intl.NumberFormat {
	const key = `${locale}:${decimals}`
	const cached = formatterCache.get(key)
	if (cached) return cached
	const fmt = new Intl.NumberFormat(locale, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})
	formatterCache.set(key, fmt)
	return fmt
}

export function formatTiered(value: number, locale: string = 'en-US'): string {
	return formatterFor(precisionFor(value), locale).format(value)
}
