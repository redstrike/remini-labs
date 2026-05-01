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

export interface CreateWatchlistOpts {
	/** Symbols already rendered as fixed rows (e.g. crypto BTC/ETH/SOL or VN-stock VN_STOCK_FIXED).
	 * Persisted entries that match are pruned at construction so a duplicate row never renders;
	 * `add()` rejects future picks of these symbols. Migrates older watchlists when a symbol
	 * is promoted to a fixed row (e.g. VCB joining VN_STOCK_FIXED in 2026-05-01). */
	reservedCrypto?: readonly string[]
	reservedStocks?: readonly string[]
}

export type Watchlist = ReturnType<typeof createWatchlist>

export function createWatchlist(opts: CreateWatchlistOpts = {}) {
	const reservedCrypto = new Set<string>(opts.reservedCrypto ?? [])
	const reservedStocks = new Set<string>(opts.reservedStocks ?? [])
	const state = new PersistedState<PersistedShape>(STORAGE_KEY, EMPTY, { serializer })

	// One-shot prune at construction — drops entries that have since been promoted to a fixed
	// row. PersistedState's setter writes back to localStorage, so the migration sticks across
	// reloads. SSR-safe: state.current is the in-memory default until hydration touches the
	// real storage; the no-op early return covers it.
	const cryptoNeedsPrune = reservedCrypto.size > 0 && state.current.crypto.some((s) => reservedCrypto.has(s))
	const stocksNeedsPrune = reservedStocks.size > 0 && state.current.stocks.some((s) => reservedStocks.has(s))
	if (cryptoNeedsPrune || stocksNeedsPrune) {
		state.current = {
			crypto: cryptoNeedsPrune
				? state.current.crypto.filter((s) => !reservedCrypto.has(s))
				: state.current.crypto,
			stocks: stocksNeedsPrune
				? state.current.stocks.filter((s) => !reservedStocks.has(s))
				: state.current.stocks,
		}
	}

	// Factory over the two list keys — `add`/`remove`/`has` were mirror-image triples; this
	// folds them into a single implementation parameterised by the slot key. Same semantics
	// as the explicit triples (normalize-on-input, cap on add, dedup on add, no-op on remove
	// of unknown, normalize on has-check).
	function makeListAccessor(key: 'crypto' | 'stocks') {
		const reserved = key === 'crypto' ? reservedCrypto : reservedStocks
		return {
			add(symbol: string): boolean {
				const s = normalize(symbol)
				if (!s || reserved.has(s)) return false
				const list = state.current[key]
				if (list.includes(s) || list.length >= PER_LIST_CAP) return false
				state.current = { ...state.current, [key]: [...list, s] }
				return true
			},
			remove(symbol: string): void {
				const s = normalize(symbol)
				const list = state.current[key]
				const next = list.filter((x) => x !== s)
				if (next.length === list.length) return
				state.current = { ...state.current, [key]: next }
			},
			has(symbol: string): boolean {
				return state.current[key].includes(normalize(symbol))
			},
		}
	}

	const crypto = makeListAccessor('crypto')
	const stocks = makeListAccessor('stocks')

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
		addCrypto: crypto.add,
		removeCrypto: crypto.remove,
		hasCrypto: crypto.has,
		addStock: stocks.add,
		removeStock: stocks.remove,
		hasStock: stocks.has,
	}
}
