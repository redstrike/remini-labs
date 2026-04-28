import type { CryptoTicker } from './shared/binance-client'
import type { ChartData, PriceTable } from './shared/phuquy-client'
import type { IndexQuote } from './shared/ssi-iboard-client'

// Bundle the gold chart payload with its server-side cache time. Streamed as one deferred
// chunk so the client seeds its chart cache with the honest age (T from `X-Cached-At`),
// not the moment SSR happened to render. Same identity as the spot endpoints below.
type StreamedGoldChart = { data: ChartData | null; cachedAt: number }

export const load = async ({ fetch }) => {
	// Streamed alongside the spot fetches: the gold chart promise is returned un-awaited so
	// SvelteKit serializes it as a deferred chunk. The client seeds its chart cache from
	// `data.goldChart` instead of firing a separate mount fetch — see use-tickers.svelte.ts.
	const goldChart: Promise<StreamedGoldChart> = fetch(
		'/tickers/api/charts/metals?categoryId=1&type=1&duration=1Y&unit=chi',
	)
		.then(async (r) => {
			if (!r.ok) return { data: null, cachedAt: 0 }
			const cachedAt = Number(r.headers.get('X-Cached-At')) || Date.now()
			const data = (await r.json().catch(() => null)) as ChartData | null
			return { data, cachedAt }
		})
		.catch(() => ({ data: null, cachedAt: 0 }))

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

	// Parallel JSON parse — Workers' streaming JSON.parse runs per-response, so awaiting the
	// three sequentially serializes work that has no data dependency. `Promise.all` resolves
	// non-thenable `null`s synchronously, so the failed-fetch branches don't add overhead.
	const [metals, crypto, vn100] = (await Promise.all([
		metalsRes?.ok ? metalsRes.json().catch(() => null) : null,
		cryptoRes?.ok ? cryptoRes.json().catch(() => null) : null,
		vn100Res?.ok ? vn100Res.json().catch(() => null) : null,
	])) as [PriceTable | null, CryptoTicker[] | null, IndexQuote | null]

	// Server stamps `X-Cached-At = T` on success (T = upstream fetch time). 0 means SSR errored
	// — client treats that as "anchor to local now()" and stays honest from there. Per-asset
	// timestamps let each freshness dot count down from its OWN cache age, not page-load age.
	const metalsCachedAt = metalsRes?.ok ? Number(metalsRes.headers.get('X-Cached-At') || 0) : 0
	const cryptoCachedAt = cryptoRes?.ok ? Number(cryptoRes.headers.get('X-Cached-At') || 0) : 0
	const vn100CachedAt = vn100Res?.ok ? Number(vn100Res.headers.get('X-Cached-At') || 0) : 0

	return {
		meta: {
			appName: 'Tickers',
			description:
				'Live gold, silver, crypto, and VN stock index prices with candlestick charts. A Remini Labs mini-app by redstrike.',
			ogImage: '/og-tickers.png',
		},
		metals,
		metalsCachedAt,
		crypto,
		cryptoCachedAt,
		vn100,
		vn100CachedAt,
		goldChart,
	}
}
