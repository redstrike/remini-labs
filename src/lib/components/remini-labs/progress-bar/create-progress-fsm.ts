import { FiniteStateMachine } from 'runed'

export type ProgressPhase = 'idle' | 'pending' | 'running' | 'completing'

type ProgressEvent = 'on' | 'off' | 'show' | 'done'

export interface ProgressFSMOptions {
	/** Anti-flash gate: ms to wait before showing the bar. 0 = show on next tick. */
	delayMs?: number
	/** Fade-out window after the source flips off (CSS animation is 0.35s; default leaves a 50ms safety buffer). */
	completingMs?: number
}

/**
 * Lifecycle:
 *   idle → (on) → pending → (debounce delayMs) → running → (off) → completing → (debounce completingMs) → idle
 *   pending → (off) → idle           // nav finished within the gate; never paints
 *   completing → (on) → running      // re-entry during fade keeps the bar moving
 */
export function createProgressFSM(opts: ProgressFSMOptions = {}) {
	const { delayMs = 0, completingMs = 400 } = opts
	const fsm: FiniteStateMachine<ProgressPhase, ProgressEvent> = new FiniteStateMachine<ProgressPhase, ProgressEvent>(
		'idle',
		{
			idle: { on: 'pending' },
			pending: {
				off: 'idle',
				show: 'running',
				_enter: () => fsm.debounce(delayMs, 'show'),
			},
			running: { off: 'completing' },
			completing: {
				on: 'running',
				done: 'idle',
				_enter: () => fsm.debounce(completingMs, 'done'),
			},
			// Wildcard absorbs stale events: redundant on/off from idempotent $effect
			// re-fires, plus stale `show`/`done` from debounce timers that fire after
			// the FSM has already transitioned out (Runed's `.debounce()` doesn't
			// auto-cancel on transition). Returning fsm.current = self-transition,
			// which `#transition` short-circuits before firing _enter/_exit.
			'*': {
				on: () => fsm.current,
				off: () => fsm.current,
				show: () => fsm.current,
				done: () => fsm.current,
			},
		},
	)
	return fsm
}

export function isProgressVisible(phase: ProgressPhase): boolean {
	return phase === 'running' || phase === 'completing'
}
