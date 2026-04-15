import { browser } from '$app/environment'

import type { CryptoTicker } from './api/binance-client'
import type { PriceTable } from './api/phuquy-client'
import type { IndexQuote } from './api/ssi-iboard-client'

export const load = async ({ fetch }) => {
	try {
		// Warm the Gold chart cache on the server so the client's mount fetch hits the
		// CF Worker cache. Gated to SSR because universal loads re-run on client hydration,
		// and the fire-and-forget fetch isn't replayed — it would duplicate the mount fetch.
		if (!browser) {
			fetch('/tickers/api/charts/metals?categoryId=1&type=1&duration=1Y&unit=chi').catch(() => {})
		}

		const [tableRes, cryptoRes, vn100Res] = await Promise.all([
			fetch('/tickers/api/spots/metals'),
			fetch('/tickers/api/spots/crypto'),
			fetch('/tickers/api/spots/stocks?symbol=VN100'),
		])
		const table: PriceTable | null = tableRes.ok ? await tableRes.json() : null
		const crypto: CryptoTicker[] | null = cryptoRes.ok ? await cryptoRes.json() : null
		const vn100: IndexQuote | null = vn100Res.ok ? await vn100Res.json() : null

		return { meta: { appName: 'Tickers' }, table, crypto, vn100 }
	} catch {
		return { meta: { appName: 'Tickers' }, table: null, crypto: null, vn100: null }
	}
}
