import { fetchCryptoDict, searchCryptoDict } from '../../../shared/binance-client'
import { createDictSearchHandler } from '../../dict-search-handler'

// 7 days — Binance lists new pairs weekly at most; user explicitly opted out of chasing fresh listings.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000

export const GET = createDictSearchHandler({
	cacheKey: 'https://remini-labs.internal/tickers/api/search/crypto/dict',
	freshMs: FRESH_MS,
	maxAgeSeconds: FRESH_MS / 1000,
	fetchAll: fetchCryptoDict,
	search: searchCryptoDict,
	errorTag: { fetch: 'binance-exchangeinfo-error', refresh: 'crypto-dict-refresh-error' },
	errorMessage: 'crypto symbol dict unavailable',
})
