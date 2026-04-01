import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { fetchIntradayHistory } from '../phuquy-client'

export const GET: RequestHandler = async ({ url }) => {
	const productType = url.searchParams.get('productType')
	if (!productType) {
		return json({ error: 'productType query param is required' }, { status: 400 })
	}

	try {
		const history = await fetchIntradayHistory(productType)
		return json(history)
	} catch (e) {
		console.error('Phu Quy history API error:', e)
		return json({ error: 'Unable to fetch price history' }, { status: 502 })
	}
}
