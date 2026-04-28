import { logServerError } from '$lib/server-log'
import { json } from '@sveltejs/kit'

import { fetchChartData } from '../../../shared/phuquy-client'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const DEBOUNCE_TTL_MS = 15 * 60 * 1000 // 15 min — matches metals spot cadence

export const GET: RequestHandler = async ({ url }) => {
	const categoryId = Number(url.searchParams.get('categoryId'))
	const type = Number(url.searchParams.get('type'))
	const duration = url.searchParams.get('duration')

	if (!categoryId || !type || !duration) {
		return json({ error: 'categoryId, type, and duration query params are required' }, { status: 400 })
	}

	const unit = (url.searchParams.get('unit') as 'chi' | 'kg') || 'chi'
	const cacheKey = `https://remini-labs.internal/tickers/api/charts/metals?categoryId=${categoryId}&type=${type}&duration=${duration}&unit=${unit}`

	const { debounced, cache } = await probeCache(cacheKey, DEBOUNCE_TTL_MS)
	if (debounced) return debounced.clone()

	try {
		const chart = await fetchChartData(categoryId, type, duration, unit)
		const response = json(chart, {
			headers: {
				'Cache-Control': `public, max-age=${DEBOUNCE_TTL_MS / 1000}, must-revalidate`,
				'X-Cached-At': String(Date.now()),
			},
		})
		if (cache) await cache.put(cacheKey, response.clone())
		return response
	} catch (e) {
		logServerError('phuquy-chart-error', e, { categoryId, type, duration, unit })
		return json({ error: 'Unable to fetch chart data' }, { status: 502 })
	}
}
