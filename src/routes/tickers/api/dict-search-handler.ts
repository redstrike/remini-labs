// Generic SWR-with-Workers-Cache handler for dictionary-style search endpoints (crypto pairs,
// VN stock universe, …). The 2 search endpoints (api/search/crypto, api/search/stocks) shared
// nearly the entire pipeline — fetch full dict → cache it → background-refresh on stale-hit →
// run an in-memory search → return slim result.
//
// Factor:
//   • `fetchAll`      : how to load the full dict from upstream (Binance / SSI / …)
//   • `search`        : how to filter the dict against `?q=`; receives the raw query, returns matches
//   • `mapResult`     : per-match shape transform (e.g. SSI's per-row `kind` decoration); identity by default
//   • `cacheKey`      : Workers Cache key for the cached dict
//   • `freshMs`       : how long the cached dict counts as fresh; ages older trigger background SWR refresh
//   • `maxAgeSeconds` : `Cache-Control: max-age=` for both the dict and the slim search response
//   • `errorTag`      : kebab-case event tags for Workers Logs (separate fetch/refresh tags so dashboards can split)
//   • `errorMessage`  : client-visible message in the 502 envelope when the cold-fetch path fails
//
// Pairs with `api/cache.ts` — this module owns the SWR shape; cache.ts owns the
// debounce/clone/decant invariants for spot endpoints.

import { logServerError, serverError502 } from '$lib/server-log'
import { json, type RequestHandler } from '@sveltejs/kit'

import { openTickersCache } from './cache'

const TIMESTAMP_HEADER = 'X-Cached-At'

export interface DictSearchHandlerOpts<Dict, Match, ApiResult = Match> {
	cacheKey: string
	freshMs: number
	maxAgeSeconds: number
	fetchAll: () => Promise<Dict>
	search: (query: string, dict: Dict) => Match[]
	mapResult?: (match: Match) => ApiResult
	errorTag: { fetch: string; refresh: string }
	errorMessage: string
}

const identity = <T>(x: T): T => x

export function createDictSearchHandler<Dict, Match, ApiResult = Match>(
	opts: DictSearchHandlerOpts<Dict, Match, ApiResult>,
): RequestHandler {
	const {
		cacheKey,
		freshMs,
		maxAgeSeconds,
		fetchAll,
		search,
		mapResult = identity as (match: Match) => ApiResult,
		errorTag,
		errorMessage,
	} = opts

	const cacheControl = `public, max-age=${maxAgeSeconds}, must-revalidate`

	async function buildAndStore(cache: Cache | null): Promise<Dict> {
		const dict = await fetchAll()
		if (cache) {
			await cache.put(
				cacheKey,
				new Response(JSON.stringify(dict), {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': cacheControl,
						[TIMESTAMP_HEADER]: String(Date.now()),
					},
				}),
			)
		}
		return dict
	}

	return async ({ url, platform }) => {
		const q = url.searchParams.get('q') ?? ''
		const cache = await openTickersCache()

		let dict: Dict | null = null

		if (cache) {
			const cached = await cache.match(cacheKey)
			if (cached) {
				dict = (await cached.json()) as Dict
				const age = Date.now() - Number(cached.headers.get(TIMESTAMP_HEADER) ?? 0)
				if (age >= freshMs && platform?.context?.waitUntil) {
					// Background refresh while serving stale; logs the refresh failure separately
					// from the cold-fetch failure so dashboards can split "stale-served" from
					// "user blocked".
					platform.context.waitUntil(buildAndStore(cache).catch((e) => logServerError(errorTag.refresh, e)))
				}
			}
		}

		// Cold path — no cache OR `caches` unavailable (Vite dev SSR). Fetching here blocks the
		// request, but only on first hit per isolate; subsequent hits route to the cached arm.
		if (!dict) {
			try {
				dict = await buildAndStore(cache)
			} catch (e) {
				return serverError502(errorTag.fetch, e, errorMessage)
			}
		}

		const matches = search(q, dict).map(mapResult)
		return json(matches, { headers: { 'Cache-Control': cacheControl } })
	}
}
