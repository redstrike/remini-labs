import { CANONICAL_ORIGIN } from '$lib/site'

import type { RequestHandler } from './$types'

// User-facing routes only — API endpoints, static assets, and op-tooling
// don't belong in a discovery sitemap. `lastmod` deliberately omitted: with
// no honest source-of-truth (no per-route content timestamps, no build-time
// stamping), Google ignores stale or always-now values anyway, so an absent
// element is more truthful than an unverifiable one.
const PATHS = ['/', '/tickers', '/weather'] as const

const BODY = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PATHS.map((p) => `\t<url><loc>${CANONICAL_ORIGIN}${p}</loc></url>`).join('\n')}
</urlset>
`

export const GET: RequestHandler = () => {
	return new Response(BODY, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=21600, must-revalidate',
		},
	})
}
