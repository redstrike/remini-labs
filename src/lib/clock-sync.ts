/**
 * Transparent clock sync service.
 *
 * Patches Date.now() and new Date() so every call returns server-synced time.
 * Developers just use Date.now() — no imports, no special functions.
 *
 * Strategy:
 * - Initial (SSR hydration): if client-server delta < 10s, trust client clock
 *   (offset = 0). Otherwise, use server time as anchor.
 * - Re-sync (every 15 min): NTP-lite with round-trip compensation for ~50ms accuracy.
 */

const DRIFT_THRESHOLD_MS = 10_000 // 10 seconds
const RESYNC_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let offset = 0
let initialized = false

const _origDateNow = Date.now.bind(Date)
const _OrigDate = Date

/** Initialize from SSR-provided server time. Call once at hydration. */
export function initClockSync(serverTimeMs: number) {
	if (initialized) return

	const clientNow = _origDateNow()
	const delta = Math.abs(clientNow - serverTimeMs)

	if (delta < DRIFT_THRESHOLD_MS) {
		// Client clock is close enough — trust it
		offset = 0
	} else {
		// Client clock is wrong — anchor to server time
		offset = serverTimeMs - clientNow
	}

	patchDate()
	initialized = true

	// Background re-sync every 15 minutes
	setInterval(resync, RESYNC_INTERVAL_MS)
}

/** NTP-lite re-sync: measures round-trip for higher accuracy. */
async function resync() {
	try {
		const t1 = _origDateNow()
		const res = await fetch('/api/clock')
		const t3 = _origDateNow()
		if (!res.ok) return

		const { serverTime: t2 } = await res.json()
		// Server time minus midpoint of request = offset
		offset = t2 - (t1 + t3) / 2
	} catch {
		// Keep last known offset on failure
	}
}

/** Monkey-patch Date.now() and new Date() */
function patchDate() {
	Date.now = () => _origDateNow() + offset

	// Proxy the Date constructor so `new Date()` uses corrected time
	// while `new Date(value)` / `new Date(y, m, ...)` pass through unchanged
	const PatchedDate = new Proxy(_OrigDate, {
		construct(target, args) {
			if (args.length === 0) {
				return new target(_origDateNow() + offset)
			}
			// @ts-expect-error — spread into Date constructor
			return new target(...args)
		},
		apply(_target) {
			// Date() called without new — returns string like native
			return new _OrigDate(_origDateNow() + offset).toString()
		},
		get(target, prop, receiver) {
			if (prop === 'now') return () => _origDateNow() + offset
			return Reflect.get(target, prop, receiver)
		},
	})

	globalThis.Date = PatchedDate
}
