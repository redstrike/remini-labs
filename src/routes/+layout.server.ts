import type { LayoutServerLoad } from './$types'

// 8h shared freshness window for the root shell — short enough that deploys
// propagate within a workday, long enough that edge/browser still absorb
// repeat visits. Conditional revalidation after staleness is handled by the
// SHA-256 ETag attached in hooks.server.ts.
const CACHE_CONTROL = 'public, max-age=28800, must-revalidate'

export const load: LayoutServerLoad = ({ url, locals }) => {
	locals.cacheControl = CACHE_CONTROL
	return {
		// Absolute origin + pathname for canonical + og:url + absolute og:image URLs.
		// On Cloudflare Workers this reflects the real deployment host; in dev it's http://localhost:5173.
		origin: url.origin,
		pathname: url.pathname,
	}
}
