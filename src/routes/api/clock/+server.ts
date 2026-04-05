import { json } from '@sveltejs/kit'

import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
	const now = Date.now()
	return json({
		serverTime: now,
		serverTimeIso: new Date(now).toISOString(),
	})
}
