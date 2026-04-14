/**
 * VN stock market (HOSE/HNX) polling schedule — drives both client polling
 * cadence and server-side cache TTLs.
 *
 * Phases (all ICT / UTC+7, Mon–Fri; weekends fully closed):
 *   pre-open    (00:00–09:00)   wait until today 09:00
 *   trading     (09:00–15:00)   poll every 5 min, cap at 15:00 → jump to 21:00
 *   post-close  (15:00–21:00)   wait until today 21:00 (EOD finalizes during broker batch)
 *   eod-final   (21:00–24:00)   wait until next trading day 09:00
 *   weekend     (Sat / Sun)     wait until Monday 09:00
 *
 * VN holidays (Tết, 30/4, 2/9) are intentionally NOT modeled — app will poll in vain,
 * upstream serves stale data. Accepted trade-off.
 *
 * Times use the IANA-free math trick: ICT is UTC+7 with no DST, so `now + 7h`
 * in UTC accessors gives correct ICT wall-time components.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const ICT_OFFSET_MS = 7 * HOUR_MS

const MARKET_OPEN_HOUR = 9 // 09:00 ICT — HOSE ATO begins
const MARKET_CLOSE_HOUR = 15 // 15:00 ICT — put-through tail ends
const EOD_FINAL_HOUR = 21 // 21:00 ICT — post-close batch safely finalized

export const STOCKS_POLL_MS = 5 * 60 * 1000 // 5 min during active trading

export type Phase = 'pre-open' | 'trading' | 'post-close' | 'eod-final' | 'weekend'

// --- ICT wall-time helpers (ICT = UTC+7, no DST) ---

function ictShifted(now: Date): Date {
	return new Date(now.getTime() + ICT_OFFSET_MS)
}

function ictDayOfWeek(now: Date): number {
	return ictShifted(now).getUTCDay() // 0=Sun … 6=Sat
}

function ictHour(now: Date): number {
	return ictShifted(now).getUTCHours()
}

/** Unix ms of the most recent 00:00 ICT before `now`. */
function ictMidnight(now: Date): number {
	const ict = ictShifted(now)
	return Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()) - ICT_OFFSET_MS
}

function todayAt(now: Date, hour: number): Date {
	return new Date(ictMidnight(now) + hour * HOUR_MS)
}

function nextDayAt(now: Date, hour: number): Date {
	return new Date(ictMidnight(now) + DAY_MS + hour * HOUR_MS)
}

function nextMondayAt(now: Date, hour: number): Date {
	const day = ictDayOfWeek(now)
	// Days until next Monday (ICT). Sun→1, Mon(past EOD)→7, Tue→6, …, Sat→2.
	const daysAhead = day === 0 ? 1 : 8 - day
	return new Date(ictMidnight(now) + daysAhead * DAY_MS + hour * HOUR_MS)
}

// --- Public API ---

export function computePhase(now: Date = new Date()): Phase {
	const day = ictDayOfWeek(now)
	if (day === 0 || day === 6) return 'weekend'
	const hour = ictHour(now)
	if (hour < MARKET_OPEN_HOUR) return 'pre-open'
	if (hour < MARKET_CLOSE_HOUR) return 'trading'
	if (hour < EOD_FINAL_HOUR) return 'post-close'
	return 'eod-final'
}

/**
 * When should the next fetch happen, given current time?
 * Used by both the client polling loop and the server-side cache TTL.
 *
 * - trading: now + 5 min; if that overshoots 15:00 ICT, jump to today 21:00 instead
 * - pre-open: today 09:00
 * - post-close: today 21:00
 * - eod-final weekday: tomorrow 09:00 (Fri → next Monday)
 * - weekend: next Monday 09:00
 */
export function computeNextPollTime(now: Date = new Date()): Date {
	const phase = computePhase(now)
	const day = ictDayOfWeek(now)

	switch (phase) {
		case 'trading': {
			const fiveMinAhead = new Date(now.getTime() + STOCKS_POLL_MS)
			const todayClose = todayAt(now, MARKET_CLOSE_HOUR)
			if (fiveMinAhead < todayClose) return fiveMinAhead
			return todayAt(now, EOD_FINAL_HOUR)
		}
		case 'pre-open':
			return todayAt(now, MARKET_OPEN_HOUR)
		case 'post-close':
			return todayAt(now, EOD_FINAL_HOUR)
		case 'eod-final':
			return day === 5 ? nextMondayAt(now, MARKET_OPEN_HOUR) : nextDayAt(now, MARKET_OPEN_HOUR)
		case 'weekend':
			return nextMondayAt(now, MARKET_OPEN_HOUR)
	}
}

/** Milliseconds until the next scheduled fetch. Clamped to ≥ 0. */
export function msUntilNextPoll(now: Date = new Date()): number {
	return Math.max(0, computeNextPollTime(now).getTime() - now.getTime())
}
