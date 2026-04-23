/**
 * Tests for `workers-cache-polyfill.ts`.
 *
 * Strategy: import the module to trigger auto-install, then exercise `globalThis.caches`
 * directly — same surface callers use. `beforeEach` resets state by deleting every cache.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { install } from './workers-cache-polyfill'

async function resetAllCaches(): Promise<void> {
	const names = await caches.keys()
	for (const name of names) {
		await caches.delete(name)
	}
}

function mkResponse(body: string, headers: Record<string, string>, status = 200): Response {
	return new Response(body, { status, headers })
}

beforeEach(async () => {
	await resetAllCaches()
})

describe('Cache-Control storability', () => {
	it('stores response with public, max-age=60', async () => {
		const req = new Request('https://example.com/ok')
		await caches.default.put(req, mkResponse('hello', { 'Cache-Control': 'public, max-age=60' }))
		const hit = await caches.default.match(req)
		expect(hit).toBeDefined()
		expect(await hit!.text()).toBe('hello')
	})

	it('rejects no-store', async () => {
		const req = new Request('https://example.com/nostore')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'no-store' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects no-cache', async () => {
		const req = new Request('https://example.com/nocache')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'no-cache, max-age=60' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects private', async () => {
		const req = new Request('https://example.com/private')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'private, max-age=60' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects max-age=0', async () => {
		const req = new Request('https://example.com/zero')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=0' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects Set-Cookie', async () => {
		const req = new Request('https://example.com/cookie')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=60', 'Set-Cookie': 'id=1' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects Vary: *', async () => {
		const req = new Request('https://example.com/vary-star')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=60', Vary: '*' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects non-GET/HEAD requests', async () => {
		const req = new Request('https://example.com/post', { method: 'POST' })
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.default.match(req)).toBeUndefined()
	})

	it('rejects responses with status outside 200–299', async () => {
		const req = new Request('https://example.com/500')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }, 500))
		expect(await caches.default.match(req)).toBeUndefined()
	})
})

describe('s-maxage vs max-age precedence', () => {
	it('uses s-maxage when both are present', async () => {
		vi.useFakeTimers()
		try {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
			const req = new Request('https://example.com/both')
			await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, s-maxage=100, max-age=10' }))
			// Advance past max-age (10s) but within s-maxage (100s) — should still hit
			vi.setSystemTime(new Date('2026-01-01T00:00:20Z'))
			expect(await caches.default.match(req)).toBeDefined()
			// Advance past s-maxage — should miss
			vi.setSystemTime(new Date('2026-01-01T00:02:00Z'))
			expect(await caches.default.match(req)).toBeUndefined()
		} finally {
			vi.useRealTimers()
		}
	})

	it('falls back to max-age when s-maxage absent', async () => {
		const req = new Request('https://example.com/maxonly')
		await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.default.match(req)).toBeDefined()
	})
})

describe('Freshness', () => {
	it('deletes expired entries lazily on match', async () => {
		vi.useFakeTimers()
		try {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
			const req = new Request('https://example.com/expiry')
			await caches.default.put(req, mkResponse('x', { 'Cache-Control': 'public, max-age=1' }))
			expect(await caches.default.match(req)).toBeDefined()
			vi.setSystemTime(new Date('2026-01-01T00:00:10Z'))
			expect(await caches.default.match(req)).toBeUndefined()
			// Confirm it was actually deleted (not just hidden): keys() should return empty
			const keys = await caches.default.keys()
			expect(keys.length).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('Vary partitioning', () => {
	it('stores one copy per Accept-Language value', async () => {
		const req1 = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'en' } })
		const req2 = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'vi' } })
		await caches.default.put(
			req1,
			mkResponse('english', { 'Cache-Control': 'public, max-age=60', Vary: 'Accept-Language' }),
		)
		await caches.default.put(
			req2,
			mkResponse('tiếng việt', { 'Cache-Control': 'public, max-age=60', Vary: 'Accept-Language' }),
		)
		const hit1 = await caches.default.match(req1)
		const hit2 = await caches.default.match(req2)
		expect(await hit1!.text()).toBe('english')
		expect(await hit2!.text()).toBe('tiếng việt')
	})

	it('returns undefined when Vary header value mismatches', async () => {
		const stored = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'en' } })
		const query = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'fr' } })
		await caches.default.put(
			stored,
			mkResponse('x', { 'Cache-Control': 'public, max-age=60', Vary: 'Accept-Language' }),
		)
		expect(await caches.default.match(query)).toBeUndefined()
	})
})

describe('LRU eviction', () => {
	it('evicts oldest entry when over the cap', async () => {
		install({ maxEntries: 2, force: true })
		await resetAllCaches()
		const a = new Request('https://example.com/a')
		const b = new Request('https://example.com/b')
		const c = new Request('https://example.com/c')
		await caches.default.put(a, mkResponse('a', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.put(b, mkResponse('b', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.put(c, mkResponse('c', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.default.match(a)).toBeUndefined() // oldest evicted
		expect(await caches.default.match(b)).toBeDefined()
		expect(await caches.default.match(c)).toBeDefined()
	})

	it('moves accessed entries to the end (touch-to-end)', async () => {
		install({ maxEntries: 2, force: true })
		await resetAllCaches()
		const a = new Request('https://example.com/a')
		const b = new Request('https://example.com/b')
		const c = new Request('https://example.com/c')
		await caches.default.put(a, mkResponse('a', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.put(b, mkResponse('b', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.match(a) // touches a → now order is [b, a]
		await caches.default.put(c, mkResponse('c', { 'Cache-Control': 'public, max-age=60' }))
		// b should be evicted (oldest after touch), a and c remain
		expect(await caches.default.match(b)).toBeUndefined()
		expect(await caches.default.match(a)).toBeDefined()
		expect(await caches.default.match(c)).toBeDefined()
	})
})

describe('CacheQueryOptions', () => {
	it('ignoreSearch matches URL without query string', async () => {
		const stored = new Request('https://example.com/page?v=1')
		const query = new Request('https://example.com/page?v=2')
		await caches.default.put(stored, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.default.match(query, { ignoreSearch: true })).toBeDefined()
		expect(await caches.default.match(query)).toBeUndefined()
	})

	it('ignoreMethod matches POST against GET-keyed entry', async () => {
		const stored = new Request('https://example.com/doc')
		const query = new Request('https://example.com/doc', { method: 'POST' })
		await caches.default.put(stored, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.default.match(query, { ignoreMethod: true })).toBeDefined()
		expect(await caches.default.match(query)).toBeUndefined()
	})

	it('ignoreVary ignores Vary partitioning on match', async () => {
		const stored = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'en' } })
		const query = new Request('https://example.com/doc', { headers: { 'Accept-Language': 'fr' } })
		await caches.default.put(
			stored,
			mkResponse('x', { 'Cache-Control': 'public, max-age=60', Vary: 'Accept-Language' }),
		)
		expect(await caches.default.match(query, { ignoreVary: true })).toBeDefined()
		expect(await caches.default.match(query)).toBeUndefined()
	})
})

describe('matchAll', () => {
	it('returns all fresh responses when no request given', async () => {
		const a = new Request('https://example.com/a')
		const b = new Request('https://example.com/b')
		await caches.default.put(a, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.put(b, mkResponse('y', { 'Cache-Control': 'public, max-age=60' }))
		const all = await caches.default.matchAll()
		expect(all.length).toBe(2)
	})

	it('filters by request when given', async () => {
		const a = new Request('https://example.com/a')
		const b = new Request('https://example.com/b')
		await caches.default.put(a, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.put(b, mkResponse('y', { 'Cache-Control': 'public, max-age=60' }))
		const filtered = await caches.default.matchAll(a)
		expect(filtered.length).toBe(1)
		expect(await filtered[0].text()).toBe('x')
	})
})

describe('keys', () => {
	it('returns Request[] for stored entries', async () => {
		const a = new Request('https://example.com/a')
		await caches.default.put(a, mkResponse('x', { 'Cache-Control': 'public, max-age=60' }))
		const keys = await caches.default.keys()
		expect(keys.length).toBe(1)
		expect(keys[0].url).toBe('https://example.com/a')
		expect(keys[0] instanceof Request).toBe(true)
	})
})

describe('add / addAll', () => {
	const origFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = origFetch
	})

	it('add fetches and stores', async () => {
		globalThis.fetch = vi.fn(async () => mkResponse('fetched', { 'Cache-Control': 'public, max-age=60' }))
		await caches.default.add('https://example.com/x')
		const hit = await caches.default.match('https://example.com/x')
		expect(await hit!.text()).toBe('fetched')
	})

	it('add throws TypeError on non-ok response', async () => {
		globalThis.fetch = vi.fn(async () => mkResponse('nope', { 'Cache-Control': 'public, max-age=60' }, 500))
		await expect(caches.default.add('https://example.com/x')).rejects.toThrow(TypeError)
	})

	it('addAll is atomic on failure', async () => {
		let call = 0
		globalThis.fetch = vi.fn(async () => {
			call++
			return call === 2 ? mkResponse('bad', {}, 500) : mkResponse('ok', { 'Cache-Control': 'public, max-age=60' })
		})
		await expect(caches.default.addAll(['https://example.com/a', 'https://example.com/b'])).rejects.toThrow(
			TypeError,
		)
		expect(await caches.default.match('https://example.com/a')).toBeUndefined()
		expect(await caches.default.match('https://example.com/b')).toBeUndefined()
	})
})

describe('CacheStorage', () => {
	it('open returns the same Cache instance for the same name', async () => {
		const a = await caches.open('ns1')
		const b = await caches.open('ns1')
		expect(a).toBe(b)
	})

	it('has reports existence', async () => {
		await caches.open('ns2')
		expect(await caches.has('ns2')).toBe(true)
		expect(await caches.has('missing')).toBe(false)
	})

	it('delete removes the cache namespace', async () => {
		await caches.open('ns3')
		expect(await caches.delete('ns3')).toBe(true)
		expect(await caches.has('ns3')).toBe(false)
	})

	it('keys returns all namespace names', async () => {
		await caches.open('ns4')
		await caches.open('ns5')
		const names = await caches.keys()
		expect(names).toContain('ns4')
		expect(names).toContain('ns5')
	})

	it('caches.default is identity with caches.open("default")', async () => {
		const viaDefault = caches.default
		const viaOpen = await caches.open('default')
		expect(viaDefault).toBe(viaOpen)
	})

	it('match across multiple caches returns first hit', async () => {
		const ns = await caches.open('ns-match')
		const req = new Request('https://example.com/multi')
		await ns.put(req, mkResponse('ns-value', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.match(req)).toBeDefined()
	})

	it('match with cacheName option restricts to a single cache', async () => {
		const ns = await caches.open('ns-scoped')
		const req = new Request('https://example.com/scoped')
		await ns.put(req, mkResponse('ns-value', { 'Cache-Control': 'public, max-age=60' }))
		expect(await caches.match(req, { cacheName: 'ns-scoped' })).toBeDefined()
		expect(await caches.match(req, { cacheName: 'does-not-exist' })).toBeUndefined()
	})
})

describe('HMR idempotence', () => {
	it('reinstalling without force preserves existing entries', async () => {
		const req = new Request('https://example.com/persist')
		await caches.default.put(req, mkResponse('keep', { 'Cache-Control': 'public, max-age=60' }))
		install() // no-op because existing marker
		const hit = await caches.default.match(req)
		expect(await hit!.text()).toBe('keep')
	})

	it('reinstalling WITH force replaces storage (entries cleared)', async () => {
		const req = new Request('https://example.com/clear')
		await caches.default.put(req, mkResponse('gone', { 'Cache-Control': 'public, max-age=60' }))
		install({ force: true })
		expect(await caches.default.match(req)).toBeUndefined()
	})
})

describe('Deno-style shim path', () => {
	// Simulates Deno Deploy: native spec CacheStorage with open() but no .default.
	// The polyfill should attach only the .default getter, preserving native backing.
	afterEach(() => {
		// Restore our full in-memory polyfill so subsequent test files don't inherit the mock.
		install({ force: true })
	})

	it('attaches a .default getter onto a spec-compliant native CacheStorage', async () => {
		// Build a minimal native CacheStorage mock: real Map-backed open() and NO .default.
		// We deliberately omit .default — that's the scenario we're simulating. Cast through
		// `unknown` to bypass the project's global `CacheStorage.default` augmentation.
		const nativeBackingMap = new Map<string, Cache>()
		const nativeCaches = {
			async open(name: string): Promise<Cache> {
				let existing = nativeBackingMap.get(name)
				if (!existing) {
					// Construct fresh via our InMemoryCache by routing through a temporary
					// full polyfill install — gives us a real Cache instance to back the mock.
					install({ force: true })
					existing = await caches.open(name)
					nativeBackingMap.set(name, existing)
				}
				return existing
			},
			async has(name: string) {
				return nativeBackingMap.has(name)
			},
			async delete(name: string) {
				return nativeBackingMap.delete(name)
			},
			async keys() {
				return Array.from(nativeBackingMap.keys())
			},
			async match(req: RequestInfo | URL) {
				for (const cache of nativeBackingMap.values()) {
					const hit = await cache.match(req)
					if (hit) return hit
				}
				return undefined
			},
		}

		// Replace globalThis.caches with the mock (simulating Deno native).
		Object.defineProperty(globalThis, 'caches', {
			value: nativeCaches as unknown as CacheStorage,
			writable: false,
			configurable: true,
		})
		expect((caches as unknown as { default?: unknown }).default).toBeUndefined()

		// Run the polyfill install — should hit the shim branch, not the full replacement.
		install()

		// .default is now defined and proxies to caches.open('default')
		const shimmed = (caches as unknown as { default: Cache }).default
		expect(shimmed).toBeDefined()

		const req = new Request('https://example.com/deno-shim')
		await shimmed.put(req, mkResponse('deno-native', { 'Cache-Control': 'public, max-age=60' }))

		// Entry is visible via both .default and caches.open('default') — same backing.
		const viaDefault = await shimmed.match(req)
		expect(await viaDefault!.text()).toBe('deno-native')

		const viaOpen = await caches.open('default')
		const viaOpenMatch = await viaOpen.match(req)
		expect(await viaOpenMatch!.text()).toBe('deno-native')
	})
})
