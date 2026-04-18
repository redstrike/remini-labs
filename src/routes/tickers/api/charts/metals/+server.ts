import { json } from '@sveltejs/kit'

import { fetchChartData } from '../../../shared/phuquy-client'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
	const categoryId = Number(url.searchParams.get('categoryId'))
	const type = Number(url.searchParams.get('type'))
	const duration = url.searchParams.get('duration')

	if (!categoryId || !type || !duration) {
		return json({ error: 'categoryId, type, and duration query params are required' }, { status: 400 })
	}

	try {
		const unit = (url.searchParams.get('unit') as 'chi' | 'kg') || 'chi'
		const chart = await fetchChartData(categoryId, type, duration, unit)
		return json(chart)
	} catch (e) {
		console.error('Phu Quy chart API error:', e)
		return json({ error: 'Unable to fetch chart data' }, { status: 502 })
	}
}
