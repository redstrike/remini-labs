import type { CryptoTicker } from './api/binance-client'
import type { PriceTable } from './api/phuquy-client'

export const load = async ({ fetch }) => {
	try {
		// Fire chart cache warmup first — runs in parallel with awaited fetches
		fetch('/tickers/api/charts/metals?categoryId=1&type=1&duration=1Y&unit=chi').catch(() => {})

		const [tableRes, cryptoRes] = await Promise.all([
			fetch('/tickers/api/spots/metals'),
			fetch('/tickers/api/spots/crypto'),
		])
		const table: PriceTable | null = tableRes.ok ? await tableRes.json() : null
		const crypto: CryptoTicker[] | null = cryptoRes.ok ? await cryptoRes.json() : null

		return { meta: { appName: 'Tickers' }, table, crypto }
	} catch {
		return { meta: { appName: 'Tickers' }, table: null, crypto: null }
	}
}
