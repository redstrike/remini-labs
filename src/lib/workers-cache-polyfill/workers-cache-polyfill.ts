/**
 * Workers Cache API polyfill — full W3C Cache spec + Cloudflare Workers `.default` extension.
 *
 * Purpose: give Node / Bun / Vite-dev runtimes the same `globalThis.caches` surface that
 * Cloudflare Workers exposes in production, so code written against the Workers Cache API
 * behaves identically in dev. No call-site migration required.
 *
 * What it polyfills (installed only when absent):
 *   - `globalThis.caches` — spec `CacheStorage` (open / has / delete / keys / match)
 *   - `caches.default`    — Workers shortcut (non-standard; sync property access)
 *   - `Cache` instance methods (full spec): match, matchAll, add, addAll, put, delete, keys
 *
 * Cache-Control directives honored on `put`:
 *   - `no-store` / `no-cache` / `private` → reject storage
 *   - `max-age` / `s-maxage`              → TTL (s-maxage wins when both present)
 *
 * Other storage rejections (match Workers runtime):
 *   - Non-GET/HEAD requests
 *   - Response status outside 200–299
 *   - Response carries `Set-Cookie`
 *   - Response carries `Vary: *`
 *   - Effective TTL is 0 or missing
 *
 * Install triggers (in order):
 *   1. Prior polyfill marker on `globalThis.caches` → reuse (HMR-idempotent)
 *   2. Native `caches.default` (Workers runtime)    → NO-OP
 *   3. Native `caches.open` without `.default`      → attach only a `.default` shim onto the
 *      native object (Deno Deploy, browser SW) — preserves native backing for `.open(name)`,
 *      delegates `.default` to `.open('default')` via an async-proxy getter
 *   4. No cache API at all                           → install full in-memory polyfill
 *
 * Import for side-effect: `import '$lib/workers-cache-polyfill'` once at the earliest server
 * boundary (hooks.server.ts). Module auto-invokes `install()` on load. The import path resolves
 * to this folder's `index.ts` barrel, which re-exports from this file and triggers evaluation.
 */

// ─── Types ───

interface CachedEntry {
	url: string
	method: string
	requestHeaders: [string, string][]
	responseHeaders: [string, string][]
	status: number
	statusText: string
	body: ArrayBuffer
	storedAt: number // ms epoch
	ttl: number // seconds
	vary: string[] // lowercase header names; empty = no Vary partitioning
}

interface CacheControlDirectives {
	noStore: boolean
	noCache: boolean
	isPrivate: boolean
	maxAge: number | null
	sMaxAge: number | null
}

export interface PolyfillOptions {
	/** Per-namespace LRU cap. Evicts oldest on overflow. Default 500. */
	maxEntries?: number
	/** Install even when native `caches.default` exists. Use only for tests. */
	force?: boolean
}

// ─── Config ───

const DEFAULT_MAX_ENTRIES = 500
const POLYFILL_MARKER = Symbol.for('remini-labs.workers-cache-polyfill')

// ─── Cache-Control helpers ───

function parseCacheControl(header: string | null): CacheControlDirectives {
	const directives: CacheControlDirectives = {
		noStore: false,
		noCache: false,
		isPrivate: false,
		maxAge: null,
		sMaxAge: null,
	}
	if (!header) return directives
	for (const part of header.split(',')) {
		const eq = part.indexOf('=')
		const key = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase()
		const rawValue =
			eq === -1
				? ''
				: part
						.slice(eq + 1)
						.trim()
						.replace(/^"|"$/g, '')
		switch (key) {
			case 'no-store':
				directives.noStore = true
				break
			case 'no-cache':
				directives.noCache = true
				break
			case 'private':
				directives.isPrivate = true
				break
			case 'max-age': {
				const n = Number.parseInt(rawValue, 10)
				if (Number.isFinite(n)) directives.maxAge = n
				break
			}
			case 's-maxage': {
				const n = Number.parseInt(rawValue, 10)
				if (Number.isFinite(n)) directives.sMaxAge = n
				break
			}
		}
	}
	return directives
}

function parseVary(header: string | null): string[] {
	if (!header) return []
	return header
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean)
}

type Storability = { ok: true; ttl: number; vary: string[] } | { ok: false }

function computeStorability(req: Request, res: Response): Storability {
	if (req.method !== 'GET' && req.method !== 'HEAD') return { ok: false }
	if (res.status < 200 || res.status >= 300) return { ok: false }
	if (res.headers.has('set-cookie')) return { ok: false }

	const vary = parseVary(res.headers.get('vary'))
	if (vary.includes('*')) return { ok: false }

	const cc = parseCacheControl(res.headers.get('cache-control'))
	if (cc.noStore || cc.noCache || cc.isPrivate) return { ok: false }

	const ttl = cc.sMaxAge ?? cc.maxAge ?? 0
	if (ttl <= 0) return { ok: false }

	return { ok: true, ttl, vary }
}

function entryFresh(entry: CachedEntry, now: number): boolean {
	return now - entry.storedAt < entry.ttl * 1000
}

// ─── Request / Response helpers ───

function normalizeRequest(info: RequestInfo | URL): Request {
	if (info instanceof Request) return info
	return new Request(typeof info === 'string' ? info : info.toString())
}

function entryToResponse(entry: CachedEntry): Response {
	// slice(0) clones the buffer — each match() returns an independent Response body
	return new Response(entry.body.slice(0), {
		status: entry.status,
		statusText: entry.statusText,
		headers: new Headers(entry.responseHeaders),
	})
}

function entryToRequest(entry: CachedEntry): Request {
	return new Request(entry.url, {
		method: entry.method,
		headers: new Headers(entry.requestHeaders),
	})
}

// ─── Matching ───

function urlKey(url: string, ignoreSearch: boolean): string {
	if (!ignoreSearch) return url
	const u = new URL(url)
	u.search = ''
	return u.toString()
}

function varyKeyPart(req: Request, vary: string[]): string {
	if (vary.length === 0) return ''
	const parts = vary.map((h) => `${h}=${req.headers.get(h) ?? ''}`).sort()
	return `|${parts.join('|')}`
}

function makeKey(req: Request, vary: string[]): string {
	return `${req.method}:${req.url}${varyKeyPart(req, vary)}`
}

function requestMatches(entry: CachedEntry, req: Request, options: CacheQueryOptions): boolean {
	const ignoreSearch = options.ignoreSearch ?? false
	const ignoreMethod = options.ignoreMethod ?? false
	const ignoreVary = options.ignoreVary ?? false

	if (urlKey(entry.url, ignoreSearch) !== urlKey(req.url, ignoreSearch)) return false
	if (!ignoreMethod && entry.method !== req.method) return false

	if (!ignoreVary) {
		for (const header of entry.vary) {
			const storedValue = entry.requestHeaders.find(([k]) => k.toLowerCase() === header)?.[1] ?? ''
			const reqValue = req.headers.get(header) ?? ''
			if (storedValue !== reqValue) return false
		}
	}

	return true
}

// ─── Cache class (full spec) ───

class InMemoryCache implements Cache {
	readonly #entries = new Map<string, CachedEntry>()
	readonly #maxEntries: number

	constructor(maxEntries: number) {
		this.#maxEntries = maxEntries
	}

	async match(requestInfo: RequestInfo | URL, options: CacheQueryOptions = {}): Promise<Response | undefined> {
		const req = normalizeRequest(requestInfo)
		const now = Date.now()
		for (const [key, entry] of Array.from(this.#entries)) {
			if (!requestMatches(entry, req, options)) continue
			if (!entryFresh(entry, now)) {
				this.#entries.delete(key)
				continue
			}
			// LRU touch: move to end by re-inserting
			this.#entries.delete(key)
			this.#entries.set(key, entry)
			return entryToResponse(entry)
		}
		return undefined
	}

	async matchAll(requestInfo?: RequestInfo | URL, options: CacheQueryOptions = {}): Promise<readonly Response[]> {
		const now = Date.now()
		const req = requestInfo === undefined ? null : normalizeRequest(requestInfo)
		const results: Response[] = []
		for (const [key, entry] of Array.from(this.#entries)) {
			if (!entryFresh(entry, now)) {
				this.#entries.delete(key)
				continue
			}
			if (req && !requestMatches(entry, req, options)) continue
			results.push(entryToResponse(entry))
		}
		return results
	}

	async add(requestInfo: RequestInfo | URL): Promise<void> {
		const req = normalizeRequest(requestInfo)
		const res = await fetch(req)
		if (!res.ok) throw new TypeError(`Cache.add: response status ${res.status}`)
		await this.put(req, res)
	}

	async addAll(requestInfos: RequestInfo[]): Promise<void> {
		const reqs = requestInfos.map(normalizeRequest)
		const responses = await Promise.all(reqs.map((r) => fetch(r)))
		const firstFail = responses.find((r) => !r.ok)
		if (firstFail) throw new TypeError(`Cache.addAll: at least one response not ok (${firstFail.status})`)
		await Promise.all(responses.map((res, i) => this.put(reqs[i], res)))
	}

	async put(requestInfo: RequestInfo | URL, response: Response): Promise<void> {
		const req = normalizeRequest(requestInfo)
		const storability = computeStorability(req, response)
		if (!storability.ok) return

		const body = await response.clone().arrayBuffer()
		const entry: CachedEntry = {
			url: req.url,
			method: req.method,
			requestHeaders: Array.from(req.headers),
			responseHeaders: Array.from(response.headers),
			status: response.status,
			statusText: response.statusText,
			body,
			storedAt: Date.now(),
			ttl: storability.ttl,
			vary: storability.vary,
		}

		const key = makeKey(req, storability.vary)
		this.#entries.delete(key) // ensure LRU ordering — re-inserted at end
		this.#entries.set(key, entry)

		// LRU cap
		while (this.#entries.size > this.#maxEntries) {
			const oldest = this.#entries.keys().next().value
			if (oldest === undefined) break
			this.#entries.delete(oldest)
		}
	}

	async delete(requestInfo: RequestInfo | URL, options: CacheQueryOptions = {}): Promise<boolean> {
		const req = normalizeRequest(requestInfo)
		let deleted = false
		for (const [key, entry] of Array.from(this.#entries)) {
			if (requestMatches(entry, req, options)) {
				this.#entries.delete(key)
				deleted = true
			}
		}
		return deleted
	}

	async keys(requestInfo?: RequestInfo | URL, options: CacheQueryOptions = {}): Promise<readonly Request[]> {
		const now = Date.now()
		const req = requestInfo === undefined ? null : normalizeRequest(requestInfo)
		const results: Request[] = []
		for (const [key, entry] of Array.from(this.#entries)) {
			if (!entryFresh(entry, now)) {
				this.#entries.delete(key)
				continue
			}
			if (req && !requestMatches(entry, req, options)) continue
			results.push(entryToRequest(entry))
		}
		return results
	}
}

// ─── CacheStorage class (spec + Workers .default extension) ───

interface MultiCacheQueryOptionsLocal extends CacheQueryOptions {
	cacheName?: string
}

class InMemoryCacheStorage implements CacheStorage {
	readonly #caches = new Map<string, InMemoryCache>()
	readonly #maxEntries: number

	constructor(maxEntries: number) {
		this.#maxEntries = maxEntries
	}

	async open(name: string): Promise<Cache> {
		let cache = this.#caches.get(name)
		if (!cache) {
			cache = new InMemoryCache(this.#maxEntries)
			this.#caches.set(name, cache)
		}
		return cache
	}

	async has(name: string): Promise<boolean> {
		return this.#caches.has(name)
	}

	async delete(name: string): Promise<boolean> {
		return this.#caches.delete(name)
	}

	async keys(): Promise<string[]> {
		return Array.from(this.#caches.keys())
	}

	async match(
		requestInfo: RequestInfo | URL,
		options: MultiCacheQueryOptionsLocal = {},
	): Promise<Response | undefined> {
		if (options.cacheName) {
			const cache = this.#caches.get(options.cacheName)
			return cache?.match(requestInfo, options)
		}
		for (const cache of this.#caches.values()) {
			const match = await cache.match(requestInfo, options)
			if (match) return match
		}
		return undefined
	}

	// Workers extension — synchronous property access to the 'default' cache.
	get default(): Cache {
		let cache = this.#caches.get('default')
		if (!cache) {
			cache = new InMemoryCache(this.#maxEntries)
			this.#caches.set('default', cache)
		}
		return cache
	}
}

// ─── Install ───

interface MarkedCacheStorage {
	[POLYFILL_MARKER]?: true
}

type GlobalCaches = (CacheStorage & MarkedCacheStorage & { default?: unknown }) | undefined

function readGlobalCaches(): GlobalCaches {
	return (globalThis as { caches?: GlobalCaches }).caches
}

function hasExistingPolyfillMarker(): boolean {
	return !!readGlobalCaches()?.[POLYFILL_MARKER]
}

function hasNativeWorkersCaches(): boolean {
	const c = readGlobalCaches()
	if (!c) return false
	if (c.default === undefined) return false
	return !c[POLYFILL_MARKER]
}

function hasSpecCachesWithoutDefault(): boolean {
	const c = readGlobalCaches()
	if (!c) return false
	if (typeof (c as CacheStorage).open !== 'function') return false
	return c.default === undefined
}

/**
 * Deno Deploy / browser Service Worker path: native `CacheStorage` exists and is
 * spec-compliant (has `open(name)`) but lacks Workers's non-standard `.default`.
 * Attach only a lazy getter that proxies to `caches.open('default')` — native backing
 * is preserved, and `caches.default` resolves to the same stored entries as
 * `await caches.open('default')`.
 */
function installDefaultShimOnNative(): void {
	const native = readGlobalCaches()
	if (!native) return

	let lazy: Cache | null = null
	const getOrCreateLazy = (): Cache => {
		if (lazy) return lazy
		const openPromise = (native as CacheStorage).open('default')
		lazy = new Proxy({} as Cache, {
			get(_target, prop) {
				if (typeof prop === 'symbol') return undefined
				return (...args: unknown[]) =>
					openPromise.then((cache) => {
						const method = (cache as unknown as Record<string, unknown>)[prop]
						if (typeof method !== 'function') {
							throw new TypeError(`caches.default: no method '${String(prop)}'`)
						}
						return (method as (...a: unknown[]) => unknown).apply(cache, args)
					})
			},
		})
		return lazy
	}

	try {
		Object.defineProperty(native, 'default', {
			configurable: true,
			enumerable: false,
			get: getOrCreateLazy,
		})
		Object.defineProperty(native, POLYFILL_MARKER, {
			value: true,
			configurable: true,
			enumerable: false,
		})
	} catch {
		// Native CacheStorage was sealed/frozen (rare). Callers reaching for .default
		// will still see undefined and can fall back to caches.open('default').
	}
}

function installFullPolyfill(maxEntries: number): void {
	const storage = new InMemoryCacheStorage(maxEntries)
	;(storage as unknown as MarkedCacheStorage)[POLYFILL_MARKER] = true

	Object.defineProperty(globalThis, 'caches', {
		value: storage,
		writable: false,
		configurable: true,
		enumerable: false,
	})
}

export function install(options: PolyfillOptions = {}): void {
	const force = options.force ?? false

	// 1. Our polyfill already installed — HMR-idempotent reuse.
	if (!force && hasExistingPolyfillMarker()) return

	// 2. Native Workers runtime — has caches.default. Nothing to do.
	if (!force && hasNativeWorkersCaches()) return

	// 3. Spec-compliant caches without .default (Deno Deploy, browser SW) —
	//    attach just the .default property; native backing stays intact.
	if (!force && hasSpecCachesWithoutDefault()) {
		installDefaultShimOnNative()
		return
	}

	// 4. No cache API at all (Node, Bun, Vite dev) — install full in-memory polyfill.
	installFullPolyfill(options.maxEntries ?? DEFAULT_MAX_ENTRIES)
}

// Auto-install on module load.
install()
