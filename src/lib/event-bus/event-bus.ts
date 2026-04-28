/**
 * Typed event bus — create one per mini-app or feature scope.
 *
 * Design choices:
 * - Sync emit — bus is a notification channel, not an orchestrator
 * - Error isolated — one bad handler doesn't break the notify chain
 * - Set storage — deduplicates, prevents accidental double-fire
 * - Snapshot iteration — safe against mid-emit listener mutation
 * - Dispose fn — on()/once() return unsubscribe function
 * - Max listeners warning — leak detector at 10 listeners per event
 */

const MAX_LISTENERS = 10

type Handler<T = unknown> = (payload: T) => void

export function createEventBus<Events extends Record<string, unknown>>() {
	const listeners = new Map<keyof Events, Set<Handler>>()

	function getOrCreate(event: keyof Events): Set<Handler> {
		let set = listeners.get(event)
		if (!set) {
			set = new Set()
			listeners.set(event, set)
		}
		return set
	}

	function on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
		const set = getOrCreate(event)
		set.add(handler as Handler)

		// Warn exactly when crossing the threshold, not on every subsequent `on()` call past it.
		// Standard Node EventEmitter convention — a real leak would otherwise flood the console
		// with one warning per add. If listeners drop back below and rise again, the warning
		// re-fires (intentional: that's a fresh growth event worth surfacing).
		if (set.size === MAX_LISTENERS + 1) {
			console.warn(`[event-bus] "${String(event)}" has ${set.size} listeners — possible leak`)
		}

		return () => set.delete(handler as Handler)
	}

	function once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
		const unsub = on(event, ((payload: Events[K]) => {
			unsub()
			handler(payload)
		}) as Handler<Events[K]>)
		return unsub
	}

	function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		const set = listeners.get(event)
		if (!set) return

		const snapshot = Array.from(set)
		for (const handler of snapshot) {
			try {
				handler(payload)
			} catch (e) {
				console.error(`[event-bus] handler error on "${String(event)}":`, e)
			}
		}
	}

	return { on, once, emit }
}
