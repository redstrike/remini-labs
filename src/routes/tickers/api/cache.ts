// Probe the Workers Cache in one pass and return three use-focused refs:
// - `debounced`: the cached Response if within `ttlMs` of its storage time — serve instead of refetching
// - `cached`:    the raw cached Response regardless of age — for stale-on-error fallback
// - `cache`:     the Cache handle — for `cache.put` after a fresh upstream fetch
//
// Returned Responses have MUTABLE headers. CF Workers' `cache.match()` natively returns Responses
// with the Fetch-spec "immutable" header guard, and `Response.clone()` preserves that guard —
// which means downstream `headers.set(...)` (e.g. in hooks.server.ts) throws TypeError. We decant
// into a fresh `new Response(body, { headers: new Headers(...) })`, which resets the guard to
// "response" (mutable). Body re-pipes the underlying ReadableStream — single consumer, so caller
// must `.clone()` per use site (same contract as before).
//
// `debounced` and `cached` reference the SAME underlying response object. At most one of the two
// paths should be consumed per request — spot-fresh and stale-on-error are mutually exclusive
// and call this contract correctly.

const CACHE_NAME = 'tickers'
const TIMESTAMP_HEADER = 'X-Cached-At'

export interface CacheProbe {
	debounced: Response | null
	cached: Response | null
	cache: Cache | null
}

// Open the shared `tickers` Workers Cache, or null when the runtime has no Cache API (Vite dev
// SSR doesn't expose `caches`). Use for direct cache access outside the `probeCache` debounce
// path — e.g. dictionary endpoints with their own SWR pattern.
export async function openTickersCache(): Promise<Cache | null> {
	return (await globalThis.caches?.open(CACHE_NAME)) ?? null
}

export async function probeCache(key: string, ttlMs: number): Promise<CacheProbe> {
	const cache = await openTickersCache()
	if (!cache) return { debounced: null, cached: null, cache: null }

	const raw = await cache.match(key)
	if (!raw) return { debounced: null, cached: null, cache }

	// Decant immutable `cache.match()` Response → mutable so downstream layers can `.set(...)`
	// without a `Can't modify immutable headers` TypeError.
	const cached = new Response(raw.body, {
		status: raw.status,
		statusText: raw.statusText,
		headers: new Headers(raw.headers),
	})

	const cachedAt = Number(cached.headers.get(TIMESTAMP_HEADER) ?? 0)
	const debounced = Date.now() - cachedAt < ttlMs ? cached : null
	return { debounced, cached, cache }
}
