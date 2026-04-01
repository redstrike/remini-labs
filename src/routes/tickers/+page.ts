import type { PriceTable, PriceSummary } from './api/phuquy-client'

export const load = async ({ fetch }) => {
	try {
		const [tableRes, summaryRes] = await Promise.all([
			fetch('/tickers/api/table'),
			fetch('/tickers/api/prices'),
		])
		const table: PriceTable | null = tableRes.ok ? await tableRes.json() : null
		const summary: PriceSummary[] | null = summaryRes.ok ? await summaryRes.json() : null
		return { meta: { appName: 'Tickers' }, table, summary }
	} catch {
		return { meta: { appName: 'Tickers' }, table: null, summary: null }
	}
}
