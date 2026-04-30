import { CANONICAL_ORIGIN } from '$lib/site'

import type { LayoutServerLoad } from './$types'

// 6h shared freshness window for the root shell — short enough that deploys
// propagate within a workday, long enough that edge/browser still absorb
// repeat visits.
const CACHE_CONTROL = 'public, max-age=21600, must-revalidate'

export const load: LayoutServerLoad = ({ url, locals }) => {
	locals.cacheControl = CACHE_CONTROL
	return {
		// Pinned canonical origin — every environment (dev, preview, prod) emits
		// the same `https://remini-labs.redstrike.dev` in canonical/og:url tags.
		// Pathname stays request-derived because it's per-page, not per-deployment.
		origin: CANONICAL_ORIGIN,
		pathname: url.pathname,
	}
}
