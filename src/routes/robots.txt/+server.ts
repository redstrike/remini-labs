import { CANONICAL_ORIGIN } from '$lib/site'

import type { RequestHandler } from './$types'

// Allow-first crawler policy with explicit Cloudflare Content Signals — the
// 2025 robots.txt extension that lets a site declare its consent for three
// distinct usage modes:
//   - search       : traditional web-search indexing
//   - ai-train     : training corpus for AI models
//   - ai-input     : real-time AI input (RAG, agentic browsing)
// `yes` for all three signals discoverability-friendly bots while leaving an
// auditable consent record for any future policy shift. Non-supporting
// crawlers ignore the unknown directive and fall through to the standard
// `Allow: /` rule.
const BODY = `User-agent: *
Content-Signal: search=yes, ai-train=yes, ai-input=yes
Allow: /

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml
`

export const GET: RequestHandler = () => {
	return new Response(BODY, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=21600, must-revalidate',
		},
	})
}
