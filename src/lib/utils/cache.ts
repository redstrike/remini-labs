/**
 * TTL-aware cache layer built on top of asyncStorage.
 *
 * Convention: one cache per mini-app. Create a module-scoped store with
 * createCache(), then use its bound get/set/has/remove methods.
 *
 * The actual storage key is suffixed with `.cache` (e.g. createCache('weather')
 * writes to the "weather.cache" key) so cache entries are visually distinct
 * from non-cache entries (preferences, flags) sharing the same localStorage.
 *
 * Envelope shape: { expiresAt: number, data: T }
 * `expiresAt` is an absolute epoch-ms timestamp (JWT/Redis convention).
 * Stale entries are auto-removed on read, so callers never see expired data.
 */

import { asyncStorage } from './storage'

export interface CacheStore<T> {
	/** Returns cached data, or null if missing or expired (auto-evicts expired entries). */
	get(): Promise<T | null>
	/** Writes data using the store's default TTL. */
	set(data: T): Promise<void>
	/** Returns true if a non-expired entry exists (auto-evicts expired entries). */
	has(): Promise<boolean>
	/** Deletes the entry. */
	remove(): Promise<void>
}

export interface CreateCacheOptions {
	/** Default TTL in ms. Required — forces every store to declare its freshness contract up-front. */
	ttl: number
}

interface CacheEnvelope<T> {
	expiresAt: number // absolute epoch ms
	data: T
}

export function createCache<T>(name: string, options: CreateCacheOptions): CacheStore<T> {
	const storageKey = `${name}.cache`
	const { ttl } = options

	return {
		async get() {
			const entry = await asyncStorage.getItem<CacheEnvelope<T>>(storageKey)
			if (!entry) return null
			if (Date.now() >= entry.expiresAt) {
				await asyncStorage.removeItem(storageKey)
				return null
			}
			return entry.data
		},

		async set(data) {
			await asyncStorage.setItem<CacheEnvelope<T>>(storageKey, {
				expiresAt: Date.now() + ttl,
				data,
			})
		},

		async has() {
			const entry = await asyncStorage.getItem<CacheEnvelope<T>>(storageKey)
			if (!entry) return false
			if (Date.now() >= entry.expiresAt) {
				await asyncStorage.removeItem(storageKey)
				return false
			}
			return true
		},

		async remove() {
			await asyncStorage.removeItem(storageKey)
		},
	}
}
