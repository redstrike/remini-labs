import type { Handle } from '@sveltejs/kit'

// Side-effect import: polyfills `globalThis.caches` (Workers Cache API) in dev /
// Node / Bun. On the Workers runtime, native `caches.default` is present — the
// polyfill detects it and no-ops. See src/lib/workers-cache-polyfill.ts.
import './lib/workers-cache-polyfill'

const DEFAULT_CACHE_CONTROL = 'no-store'

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event)

	if (event.locals.cacheControl) {
		response.headers.set('cache-control', event.locals.cacheControl)
	} else if (!response.headers.has('cache-control')) {
		response.headers.set('cache-control', DEFAULT_CACHE_CONTROL)
	}

	return response
}
