import { json } from '@sveltejs/kit'

import { computeDayStats, fetchChartData, fetchPriceTable } from '../../../shared/phuquy-client'
import { fetchVcbSnapshot } from '../../../shared/vcb-forex-client'
import { probeCache } from '../../cache'
import type { RequestHandler } from './$types'

const CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/metals'
const DEBOUNCE_TTL_MS = 15 * 60 * 1000 // 15 min

// Separate cache key + longer TTL for the VCB USD/VND avg. The USD rate only needs to refresh
// when VCB publishes new rates (1–3×/day during business hours), not on every metals poll. 1h
// TTL catches each VCB publication within ≤60 min — well within the "approximate USD"
// tolerance — without hitting VCB every 15 min when the table refreshes.
//
// Stale fallback is unbounded: if a fresh VCB fetch fails, keep serving the last-good rate
// forever rather than dropping USD display entirely. A multi-hour-old reference is strictly
// more useful than a dash when all a user wants is a rough USD equivalent.
const USD_CACHE_KEY = 'https://remini-labs.internal/tickers/api/spots/usd-rate'
const USD_TTL_MS = 60 * 60 * 1000 // 1 hour

interface UsdCacheEntry {
	rate: number
	cachedAt: number
}

async function getUsdAvgRate(cache: Cache | null): Promise<number | null> {
	let stale: UsdCacheEntry | null = null
	if (cache) {
		try {
			const cached = await cache.match(USD_CACHE_KEY)
			if (cached) {
				const entry = (await cached.json()) as UsdCacheEntry
				if (Date.now() - entry.cachedAt < USD_TTL_MS) return entry.rate
				stale = entry
			}
		} catch {
			// Malformed cache entry — treat as empty, fall through to fresh fetch.
		}
	}

	try {
		const snapshot = await fetchVcbSnapshot(new Date())
		const usd = snapshot.rates.get('USD')
		if (!usd) throw new Error('USD not in VCB snapshot')
		const entry: UsdCacheEntry = { rate: usd.avg, cachedAt: Date.now() }
		if (cache) {
			const response = new Response(JSON.stringify(entry), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=3600, must-revalidate',
				},
			})
			await cache.put(USD_CACHE_KEY, response)
		}
		return entry.rate
	} catch (e) {
		console.error('VCB USD rate fetch failed:', e)
		return stale?.rate ?? null
	}
}

export const GET: RequestHandler = async () => {
	const { debounced, cache } = await probeCache(CACHE_KEY, DEBOUNCE_TTL_MS)
	if (debounced) return debounced.clone()

	try {
		// Parallel-fetch the table + both 7D charts + the VCB USD avg rate. 7D (not 1D)
		// because we need yesterday's close as the 24h reference; the 1D endpoint only has
		// today's intraday and no prior-day data to compare against. Charts swallow errors
		// → null → UI renders "—" for missing stats; spot prices still show. USD rate has
		// its own stale-fallback cache (see getUsdAvgRate) and returns null only when VCB
		// has never been reachable. Keeps the card resilient when any upstream flakes.
		const [table, goldChart, silverChart, usdVndAvg] = await Promise.all([
			fetchPriceTable(),
			fetchChartData(1, 1, '7D', 'chi').catch(() => null),
			fetchChartData(2, 2, '7D', 'chi').catch(() => null),
			getUsdAvgRate(cache),
		])

		const payload = {
			...table,
			dayStats: {
				gold: computeDayStats(goldChart),
				silver: computeDayStats(silverChart),
			},
			usdVndAvg,
		}
		const response = json(payload, {
			headers: {
				'Cache-Control': `public, max-age=${DEBOUNCE_TTL_MS / 1000}, must-revalidate`,
				'X-Cached-At': String(Date.now()),
			},
		})

		if (cache) {
			await cache.put(CACHE_KEY, response.clone())
		}

		return response
	} catch (e) {
		console.error('Phu Quy table API error:', e)
		return json({ error: 'Unable to fetch prices' }, { status: 502 })
	}
}
