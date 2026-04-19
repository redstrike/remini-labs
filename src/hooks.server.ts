import type { Handle } from '@sveltejs/kit'

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
