import type { Handle } from '@sveltejs/kit'

// Side-effect import: polyfills `globalThis.caches` (Workers Cache API) in dev /
// Node / Bun. On the Workers runtime, native `caches.default` is present — the
// polyfill detects it and no-ops. See src/lib/workers-cache-polyfill.ts.
import './lib/workers-cache-polyfill'

const DEFAULT_CACHE_CONTROL = 'no-store'

export const handle: Handle = async ({ event, resolve }) => {
	// `filterSerializedResponseHeaders` exposes specific headers from internal `event.fetch`
	// responses to load functions. SvelteKit hides ALL response headers by default to keep
	// SSR ↔ hydration behavior identical (the client only sees what was serialized into HTML).
	// Reading a hidden header throws `Failed to get response header "<name>"`. The tickers load
	// reads `x-cached-at` to anchor each freshness dot to the server's upstream fetch time
	// (honest data age across visitors) and to drive the crypto SSR-stale auto-refetch on mount
	// — see src/routes/tickers/+page.ts and use-tickers.svelte.ts.
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'x-cached-at',
	})

	const target = event.locals.cacheControl ?? (response.headers.has('cache-control') ? null : DEFAULT_CACHE_CONTROL)
	if (target === null) return response

	// Cloudflare's Cache API returns Responses with immutable header guards (per Fetch spec).
	// `Response.clone()` doesn't reset that guard, so any `.headers.set(...)` on a cached
	// response throws `TypeError: Can't modify immutable headers`. Construct a fresh Response
	// — a new Headers object resets the guard to "response" (mutable). Body re-pipes the
	// underlying ReadableStream, no double-read.
	const headers = new Headers(response.headers)
	headers.set('cache-control', target)
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
}
