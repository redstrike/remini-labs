import type { CryptoTicker } from './shared/binance-client'
import type { ChartData, PriceTable } from './shared/phuquy-client'
import { isVnIndex, type IndexQuote, type StockQuote } from './shared/ssi-iboard-client'
import { VN_STOCK_FIXED } from './use-tickers.svelte'

// Bundle the gold chart payload with its server-side cache time. Streamed as one deferred
// chunk so the client seeds its chart cache with the honest age (T from `X-Cached-At`),
// not the moment SSR happened to render. Same identity as the spot endpoints below.
type StreamedGoldChart = { data: ChartData | null; cachedAt: number }

// One SSR-prefetched VN spot row. Indices and equities flow through the same shape on the
// wire (the server endpoints route by `isVnIndex`); the discriminated union below is widened
// only when a consumer needs to distinguish them, which the seeding code at
// use-tickers.svelte.ts does via `'price' in quote`.
export type VnStockFixedSeed = {
	symbol: string
	quote: IndexQuote | StockQuote | null
	cachedAt: number
}

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

	// Per-symbol VN spot fetch — mirrors the client's `fetchStocks` routing: indices hit the
	// `/spots/stocks` endpoint, equities hit `/stocks/quote`. Wrapped in allSettled so one
	// upstream hiccup degrades a single row to skeleton instead of nuking the whole batch.
	async function fetchVnStockFixed(symbol: string): Promise<VnStockFixedSeed> {
		const endpoint = isVnIndex(symbol)
			? `/tickers/api/spots/stocks?symbol=${symbol}`
			: `/tickers/api/stocks/quote?symbol=${symbol}`
		try {
			const res = await fetch(endpoint)
			if (!res.ok) return { symbol, quote: null, cachedAt: 0 }
			const cachedAt = Number(res.headers.get('X-Cached-At') || 0)
			const quote = (await res.json().catch(() => null)) as IndexQuote | StockQuote | null
			return { symbol, quote, cachedAt }
		} catch {
			return { symbol, quote: null, cachedAt: 0 }
		}
	}

	// allSettled so one transport-level rejection (DNS/abort/etc.) doesn't nuke the others —
	// each spot field degrades to null independently. HTTP errors already arrive as
	// `.ok = false` and are handled by the per-field ternaries below.
	const [metalsR, cryptoR, ...vnStockFixedR] = await Promise.allSettled([
		fetch('/tickers/api/spots/metals'),
		fetch('/tickers/api/spots/crypto'),
		...VN_STOCK_FIXED.map(fetchVnStockFixed),
	])
	const metalsRes = metalsR.status === 'fulfilled' ? metalsR.value : null
	const cryptoRes = cryptoR.status === 'fulfilled' ? cryptoR.value : null

	// Parallel JSON parse — Workers' streaming JSON.parse runs per-response, so awaiting the
	// two sequentially serializes work that has no data dependency. `Promise.all` resolves
	// non-thenable `null`s synchronously, so the failed-fetch branches don't add overhead.
	const [metals, crypto] = (await Promise.all([
		metalsRes?.ok ? metalsRes.json().catch(() => null) : null,
		cryptoRes?.ok ? cryptoRes.json().catch(() => null) : null,
	])) as [PriceTable | null, CryptoTicker[] | null]

	// Server stamps `X-Cached-At = T` on success (T = upstream fetch time). 0 means SSR errored
	// — client treats that as "anchor to local now()" and stays honest from there. Per-asset
	// timestamps let each freshness dot count down from its OWN cache age, not page-load age.
	const metalsCachedAt = metalsRes?.ok ? Number(metalsRes.headers.get('X-Cached-At') || 0) : 0
	const cryptoCachedAt = cryptoRes?.ok ? Number(cryptoRes.headers.get('X-Cached-At') || 0) : 0
	const vnStockFixed: VnStockFixedSeed[] = vnStockFixedR.map((r, i) =>
		r.status === 'fulfilled' ? r.value : { symbol: VN_STOCK_FIXED[i] ?? '', quote: null, cachedAt: 0 },
	)

	return {
		meta: {
			appName: 'Tickers',
			description:
				'Live Vietnam gold, silver, stock index, and Binance crypto — all with candlestick charts. Plus VCB forex rates. A Remini Labs mini-app by redstrike.',
			ogImage: '/og-tickers.png',
		},
		metals,
		metalsCachedAt,
		crypto,
		cryptoCachedAt,
		vnStockFixed,
		goldChart,
	}
}
