import type { LayoutServerLoad } from './$types'

const CACHE_CONTROL = 'public, max-age=86400, must-revalidate'

export const load: LayoutServerLoad = ({ cookies, url, locals }) => {
	locals.cacheControl = CACHE_CONTROL
	const sidebarState = cookies.get('sidebar:state')
	return {
		sidebarOpen: sidebarState !== 'false',
		serverTime: Date.now(),
		// Absolute origin + pathname for canonical + og:url + absolute og:image URLs.
		// On Cloudflare Workers this reflects the real deployment host; in dev it's http://localhost:5173.
		origin: url.origin,
		pathname: url.pathname,
	}
}
