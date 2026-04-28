/**
 * System-independent clock sync service.
 *
 * Anchors to server wall time via NTP-lite, then tracks elapsed time with
 * performance.now() — a monotonic counter immune to system-clock adjustments
 * (NTP corrections, manual set, DST, timezone changes).
 *
 * Patches Date.now() and `new Date()` so every call returns trusted time.
 * Callers use Date.now() as normal — no imports, no special functions.
 *
 * Strategy (2026-04-24):
 * - On hydration: one-shot NTP-lite round-trip to /api/clock.
 *   - Capture t1 = perf start, t2 = server time, t3 = perf end.
 *   - Assume symmetric latency → server wrote t2 at midpoint (t1 + t3) / 2.
 *   - Anchor: serverAnchor = t2, perfAnchor = (t1 + t3) / 2.
 *   - trustedNow = serverAnchor + (performance.now() − perfAnchor).
 * - Re-sync policy on `visibilitychange` (→ visible) or `pageshow`
 *   (persisted=true). Two independent triggers, checked in order:
 *   1. Skew detector — if native Date.now() and our trustedNow() disagree
 *      by more than SLEEP_SKEW_THRESHOLD_MS, something interrupted the
 *      monotonic timeline (OS sleep, manual clock change, NTP correction)
 *      → force resync, bypass debounce.
 *   2. Debounce gate — otherwise, only resync if more than
 *      RESYNC_DEBOUNCE_MS of perf-time has passed since the last sync.
 *      Keeps rapid alt-tab from spamming /api/clock during normal browsing.
 *   Skew handles correctness; debounce handles cadence.
 *
 * Tunables:
 * - SLEEP_SKEW_THRESHOLD_MS (10s) — any divergence between system clock
 *   and our estimate larger than this is treated as "something weird
 *   happened, resync to be safe." 10s is comfortably above plausible
 *   per-request latency/drift but small enough to catch short naps.
 * - RESYNC_DEBOUNCE_MS (2h) — sized for Remini Labs usage pattern of two
 *   ~4h sessions per day (morning / afternoon) with a lunch break in
 *   between. Yields ~4 fetches/day in typical use:
 *   initial hydrate + mid-session checkpoint × 2 + lunch-break wake.
 */

const RESYNC_DEBOUNCE_MS = 2 * 60 * 60 * 1000 // 2 hours — mid-session checkpoint cadence
const SLEEP_SKEW_THRESHOLD_MS = 10 * 1000 // 10s — beyond this, force resync regardless of debounce

const _OrigDate = Date
const _origDateNow = Date.now.bind(Date) // captured BEFORE patchDate() so we keep a window to the raw system clock
const _origPerfNow = performance.now.bind(performance)

let serverAnchor = 0
let perfAnchor = 0
let lastSyncAtPerf = 0
let initialized = false

/** Server-anchored wall-clock ms, advanced by monotonic time. Zero dep on system clock. */
function trustedNow(): number {
	return serverAnchor + (_origPerfNow() - perfAnchor)
}

/** Initialize clock sync. Call once on hydration; fire-and-forget. */
export async function initClockSync() {
	if (initialized) return

	const synced = await syncOnce()
	if (!synced) return // sync failed → leave Date unpatched; callers fall back to raw system clock
	patchDate()
	attachResyncListeners()
	initialized = true
}

/** NTP-lite sync via monotonic clock. Returns true on success. */
async function syncOnce(): Promise<boolean> {
	try {
		const t1 = _origPerfNow()
		const res = await fetch('/api/clock', { signal: AbortSignal.timeout(5000) })
		const t3 = _origPerfNow()
		if (!res.ok) return false
		const { serverTime: t2 } = await res.json()
		// Reject malformed payloads — patching with NaN/undefined poisons every Date.now() consumer.
		if (typeof t2 !== 'number' || !Number.isFinite(t2)) return false
		// Assume symmetric latency: server wrote t2 at the midpoint of the round-trip.
		serverAnchor = t2
		perfAnchor = (t1 + t3) / 2
		lastSyncAtPerf = t3
		return true
	} catch {
		return false
	}
}

/**
 * Resync decision — two independent gates, checked in order:
 *   1. Skew detector — native wall clock vs our estimate. Large divergence
 *      means the monotonic timeline was interrupted (OS sleep, manual clock
 *      change, NTP correction). Force resync regardless of debounce.
 *   2. Debounce — otherwise, only resync if enough perf-time has passed
 *      since the last sync. Prevents chatter on rapid visibility events.
 */
async function maybeResync() {
	const skew = Math.abs(_origDateNow() - trustedNow())
	if (skew > SLEEP_SKEW_THRESHOLD_MS) {
		await syncOnce()
		return
	}
	if (_origPerfNow() - lastSyncAtPerf < RESYNC_DEBOUNCE_MS) return
	await syncOnce()
}

/** Attach visibility + bfcache-restore listeners to re-anchor the clock. */
function attachResyncListeners() {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void maybeResync()
	})
	window.addEventListener('pageshow', (event) => {
		if (event.persisted) void maybeResync()
	})
}

/** Monkey-patch Date.now() and `new Date()` to use trustedNow(). */
function patchDate() {
	Date.now = () => trustedNow()

	// Proxy the Date constructor so `new Date()` uses corrected time
	// while `new Date(value)` / `new Date(y, m, ...)` pass through unchanged.
	// No `get` trap: Date.now was reassigned above, and other statics (UTC,
	// parse, prototype) work fine via default Reflect dispatch.
	globalThis.Date = new Proxy(_OrigDate, {
		construct(target, args, newTarget) {
			return args.length === 0
				? Reflect.construct(target, [trustedNow()], newTarget)
				: Reflect.construct(target, args, newTarget)
		},
		apply() {
			// Date() called without new — returns string like native
			return new _OrigDate(trustedNow()).toString()
		},
	})
}
