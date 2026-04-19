import { json } from '@sveltejs/kit'

import { fetchChartData } from '../../../shared/phuquy-client'
import type { RequestHandler } from './$types'

const DEBOUNCE_TTL = 900 // seconds — matches metals spot cadence

export const GET: RequestHandler = async ({ url }) => {
	const categoryId = Number(url.searchParams.get('categoryId'))
	const type = Number(url.searchParams.get('type'))
	const duration = url.searchParams.get('duration')

	if (!categoryId || !type || !duration) {
		return json({ error: 'categoryId, type, and duration query params are required' }, { status: 400 })
	}

	const unit = (url.searchParams.get('unit') as 'chi' | 'kg') || 'chi'
	const cacheKey = `https://remini-labs.internal/tickers/api/charts/metals?categoryId=${categoryId}&type=${type}&duration=${duration}&unit=${unit}`
	const cache = (await globalThis.caches?.open('tickers')) ?? null

	if (cache) {
		const cached = await cache.match(cacheKey)
		if (cached) {
			const cachedAt = Number(cached.headers.get('X-Cached-At') || 0)
			if (Date.now() - cachedAt < DEBOUNCE_TTL * 1000) return cached.clone()
		}
	}

	try {
		const chart = await fetchChartData(categoryId, type, duration, unit)
		const response = json(chart, {
			headers: {
				'Cache-Control': 'public, max-age=900, must-revalidate',
				'X-Cached-At': String(Date.now()),
			},
		})
		if (cache) await cache.put(cacheKey, response.clone())
		return response
	} catch (e) {
		console.error('Phu Quy chart API error:', e)
		return json({ error: 'Unable to fetch chart data' }, { status: 502 })
	}
}
