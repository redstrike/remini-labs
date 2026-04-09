/**
 * A simple asynchronous wrapper over standard localStorage
 * to provide a generic "Async Local Storage" interface.
 * This can be transparently swapped with IndexedDB (e.g., localforage) in the future.
 */

export const asyncStorage = {
	async getItem<T>(key: string): Promise<T | null> {
		try {
			if (typeof window === 'undefined') return null
			const item = window.localStorage.getItem(key)
			if (!item) return null
			return JSON.parse(item) as T
		} catch (e) {
			console.warn(`Failed to read from asyncStorage[${key}]:`, e)
			return null
		}
	},

	async setItem<T>(key: string, value: T): Promise<void> {
		try {
			if (typeof window === 'undefined') return
			window.localStorage.setItem(key, JSON.stringify(value))
		} catch (e) {
			console.warn(`Failed to write to asyncStorage[${key}]:`, e)
		}
	},

	async removeItem(key: string): Promise<void> {
		try {
			if (typeof window === 'undefined') return
			window.localStorage.removeItem(key)
		} catch (e) {
			console.warn(`Failed to remove from asyncStorage[${key}]:`, e)
		}
	},

	async keys(prefix?: string): Promise<string[]> {
		try {
			if (typeof window === 'undefined') return []
			const all = Object.keys(window.localStorage)
			return prefix ? all.filter((k) => k.startsWith(prefix)) : all
		} catch (e) {
			console.warn(`Failed to enumerate asyncStorage keys:`, e)
			return []
		}
	},
}
