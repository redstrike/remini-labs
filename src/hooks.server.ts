import type { Handle } from '@sveltejs/kit'

// Side-effect import: polyfills `globalThis.caches` (Workers Cache API) in dev /
// Node / Bun. On the Workers runtime, native `caches.default` is present — the
// polyfill detects it and no-ops. See src/lib/workers-cache-polyfill.ts.
import './lib/workers-cache-polyfill'

const DEFAULT_CACHE_CONTROL = 'no-store'

// SHA-256 truncated to 16 hex chars (64-bit) — plenty of uniqueness at per-URL
// scope (no collision risk in practice). Native `crypto.subtle.digest` in the
// Workers runtime; measured ~0.5 ms for a 50 KB SSR body, well inside the free
// plan's 10 ms CPU budget. SHA-256 (not SHA-1) because it's future-proof and
// the overhead vs SHA-1 is negligible at this payload size.
async function computeETag(body: ArrayBuffer): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', body)
	const hex = Array.from(new Uint8Array(hash))
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
	return hex
}

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event)

	if (event.locals.cacheControl) {
		response.headers.set('cache-control', event.locals.cacheControl)
	} else if (!response.headers.has('cache-control')) {
		response.headers.set('cache-control', DEFAULT_CACHE_CONTROL)
	}

	// Content-hashed ETag for cacheable GETs — enables cheap 304 revalidation
	// after max-age expires. Covers both SSR HTML and API JSON. Skipped for
	// non-GET, error responses, and no-store (nothing to revalidate against).
	const cc = response.headers.get('cache-control') ?? ''
	const cacheable =
		event.request.method === 'GET' &&
		response.status >= 200 &&
		response.status < 300 &&
		!cc.includes('no-store') &&
		response.body !== null

	if (cacheable) {
		const buffer = await response.clone().arrayBuffer()
		if (buffer.byteLength > 0) {
			const etag = await computeETag(buffer)
			if (event.request.headers.get('if-none-match') === etag) {
				return new Response(null, { status: 304, headers: response.headers })
			}
			response.headers.set('etag', etag)
		}
	}

	return response
}
