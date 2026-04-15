// Probe the Workers Cache in one pass and return three use-focused refs:
// - `debounced`: the cached Response if within `ttlSec` of its storage time — serve instead of refetching
// - `cached`:    the raw cached Response regardless of age — for stale-on-error fallback
// - `cache`:     the Cache handle — for `cache.put` after a fresh upstream fetch

const CACHE_NAME = 'tickers'
const TIMESTAMP_HEADER = 'X-Cached-At'

export interface CacheProbe {
	debounced: Response | null
	cached: Response | null
	cache: Cache | null
}

export async function probeCache(key: string, ttlSec: number): Promise<CacheProbe> {
	const cache = (await globalThis.caches?.open(CACHE_NAME)) ?? null
	if (!cache) return { debounced: null, cached: null, cache: null }

	const cached = await cache.match(key)
	if (!cached) return { debounced: null, cached: null, cache }

	const cachedAt = Number(cached.headers.get(TIMESTAMP_HEADER) || 0)
	const debounced = Date.now() - cachedAt < ttlSec * 1000 ? cached : null
	return { debounced, cached, cache }
}
