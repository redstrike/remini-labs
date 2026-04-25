import type { CryptoTicker } from './shared/binance-client'
import type { ChartData, PriceTable } from './shared/phuquy-client'
import type { IndexQuote } from './shared/ssi-iboard-client'

export const load = async ({ fetch }) => {
	// Streamed alongside the spot fetches: the gold chart promise is returned un-awaited so
	// SvelteKit serializes it as a deferred chunk. The client seeds its chart cache from
	// `data.goldChart` instead of firing a separate mount fetch — see use-tickers.svelte.ts.
	const goldChart: Promise<ChartData | null> = fetch(
		'/tickers/api/charts/metals?categoryId=1&type=1&duration=1Y&unit=chi',
	)
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null)

	// allSettled so one transport-level rejection (DNS/abort/etc.) doesn't nuke the others —
	// each spot field degrades to null independently. HTTP errors already arrive as
	// `.ok = false` and are handled by the per-field ternaries below.
	const [metalsR, cryptoR, vn100R] = await Promise.allSettled([
		fetch('/tickers/api/spots/metals'),
		fetch('/tickers/api/spots/crypto'),
		fetch('/tickers/api/spots/stocks?symbol=VN100'),
	])
	const metalsRes = metalsR.status === 'fulfilled' ? metalsR.value : null
	const cryptoRes = cryptoR.status === 'fulfilled' ? cryptoR.value : null
	const vn100Res = vn100R.status === 'fulfilled' ? vn100R.value : null

	const metals: PriceTable | null = metalsRes?.ok ? await metalsRes.json().catch(() => null) : null
	const crypto: CryptoTicker[] | null = cryptoRes?.ok ? await cryptoRes.json().catch(() => null) : null
	// Server stamps X-Cached-At on success (fresh or stale-fallback). 0 means SSR errored —
	// client treats that as stale and triggers an immediate refetch on mount.
	const cryptoCachedAt = cryptoRes?.ok ? Number(cryptoRes.headers.get('X-Cached-At') || 0) : 0
	const vn100: IndexQuote | null = vn100Res?.ok ? await vn100Res.json().catch(() => null) : null

	return {
		meta: {
			appName: 'Tickers',
			description:
				'Live gold, silver, crypto, and VN stock index prices with candlestick charts. A Remini Labs mini-app by redstrike.',
			ogImage: '/og-tickers.png',
		},
		metals,
		crypto,
		cryptoCachedAt,
		vn100,
		goldChart,
	}
}
