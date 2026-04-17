import { browser } from '$app/environment'

// Single localStorage key — one read on init, one write per mutation. Survives across
// devices only if synced (we don't sync; this is a per-browser preference).
const STORAGE_KEY = 'tickers.watchlist'
const PER_LIST_CAP = 10

interface PersistedShape {
	crypto: string[]
	stocks: string[]
}

function normalize(symbol: string): string {
	return symbol.trim().toUpperCase()
}

function load(): PersistedShape {
	if (!browser) return { crypto: [], stocks: [] }
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return { crypto: [], stocks: [] }
		// Defensive parse — bad shape (manual edit, version drift) → reset to empty rather than crash.
		const parsed = JSON.parse(raw) as Partial<PersistedShape>
		const onlyStrings = (arr: unknown): string[] =>
			Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : []
		return {
			crypto: onlyStrings(parsed.crypto),
			stocks: onlyStrings(parsed.stocks),
		}
	} catch {
		return { crypto: [], stocks: [] }
	}
}

function save(state: PersistedShape): void {
	if (!browser) return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	} catch (e) {
		// QuotaExceeded, Safari private mode, etc. — log and let the in-memory state win for the session.
		console.error('watchlist persist failed:', e)
	}
}

export type Watchlist = ReturnType<typeof createWatchlist>

export function createWatchlist() {
	const initial = load()
	let crypto = $state<string[]>(initial.crypto)
	let stocks = $state<string[]>(initial.stocks)

	function persist(): void {
		save({ crypto, stocks })
	}

	function addCrypto(symbol: string): boolean {
		const s = normalize(symbol)
		if (!s || crypto.includes(s) || crypto.length >= PER_LIST_CAP) return false
		crypto = [...crypto, s]
		persist()
		return true
	}

	function removeCrypto(symbol: string): void {
		const s = normalize(symbol)
		const next = crypto.filter((x) => x !== s)
		if (next.length === crypto.length) return // no-op, skip the disk write
		crypto = next
		persist()
	}

	function hasCrypto(symbol: string): boolean {
		return crypto.includes(normalize(symbol))
	}

	function addStock(symbol: string): boolean {
		const s = normalize(symbol)
		if (!s || stocks.includes(s) || stocks.length >= PER_LIST_CAP) return false
		stocks = [...stocks, s]
		persist()
		return true
	}

	function removeStock(symbol: string): void {
		const s = normalize(symbol)
		const next = stocks.filter((x) => x !== s)
		if (next.length === stocks.length) return
		stocks = next
		persist()
	}

	function hasStock(symbol: string): boolean {
		return stocks.includes(normalize(symbol))
	}

	return {
		get crypto() {
			return crypto
		},
		get stocks() {
			return stocks
		},
		get canAddCrypto() {
			return crypto.length < PER_LIST_CAP
		},
		get canAddStock() {
			return stocks.length < PER_LIST_CAP
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
