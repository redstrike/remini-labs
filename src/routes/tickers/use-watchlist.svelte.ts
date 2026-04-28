import { PersistedState } from 'runed'

const STORAGE_KEY = 'tickers.watchlist'
const PER_LIST_CAP = 10

interface PersistedShape {
	crypto: string[]
	stocks: string[]
}

const EMPTY: PersistedShape = { crypto: [], stocks: [] }

function normalize(symbol: string): string {
	return symbol.trim().toUpperCase()
}

// Defensive deserializer — bad shape (manual edit, version drift) → reset to empty
// rather than crash. PersistedState's internal try/catch already handles parse throws,
// but it sets #current to undefined on failure; we always hand back a valid shape.
const onlyStrings = (arr: unknown): string[] =>
	Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : []

const serializer = {
	serialize: (v: PersistedShape): string => JSON.stringify(v),
	deserialize: (raw: string): PersistedShape => {
		try {
			const parsed = JSON.parse(raw) as Partial<PersistedShape>
			return {
				crypto: onlyStrings(parsed.crypto),
				stocks: onlyStrings(parsed.stocks),
			}
		} catch {
			return EMPTY
		}
	},
}

export type Watchlist = ReturnType<typeof createWatchlist>

export function createWatchlist() {
	const state = new PersistedState<PersistedShape>(STORAGE_KEY, EMPTY, { serializer })

	function addCrypto(symbol: string): boolean {
		const s = normalize(symbol)
		if (!s) return false
		const list = state.current.crypto
		if (list.includes(s) || list.length >= PER_LIST_CAP) return false
		state.current = { ...state.current, crypto: [...list, s] }
		return true
	}

	function removeCrypto(symbol: string): void {
		const s = normalize(symbol)
		const list = state.current.crypto
		const next = list.filter((x) => x !== s)
		if (next.length === list.length) return
		state.current = { ...state.current, crypto: next }
	}

	function hasCrypto(symbol: string): boolean {
		return state.current.crypto.includes(normalize(symbol))
	}

	function addStock(symbol: string): boolean {
		const s = normalize(symbol)
		if (!s) return false
		const list = state.current.stocks
		if (list.includes(s) || list.length >= PER_LIST_CAP) return false
		state.current = { ...state.current, stocks: [...list, s] }
		return true
	}

	function removeStock(symbol: string): void {
		const s = normalize(symbol)
		const list = state.current.stocks
		const next = list.filter((x) => x !== s)
		if (next.length === list.length) return
		state.current = { ...state.current, stocks: next }
	}

	function hasStock(symbol: string): boolean {
		return state.current.stocks.includes(normalize(symbol))
	}

	return {
		get crypto() {
			return state.current.crypto
		},
		get stocks() {
			return state.current.stocks
		},
		get canAddCrypto() {
			return state.current.crypto.length < PER_LIST_CAP
		},
		get canAddStock() {
			return state.current.stocks.length < PER_LIST_CAP
		},
		cap: PER_LIST_CAP,
		addCrypto,
		removeCrypto,
		hasCrypto,
		addStock,
		removeStock,
		hasStock,
	}
}
