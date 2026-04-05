import { describe, it, expect, vi } from 'vitest'

import { createEventBus } from './event-bus'

// Mirror the actual event types used in the tickers mini-app
type FetchResult = { ok: true } | { ok: false; error: string }

type TickersEvents = {
	'metals:fetching': void
	'metals:fetched': FetchResult
	'crypto:fetching': void
	'crypto:fetched': FetchResult
}

function createTickersBus() {
	return createEventBus<TickersEvents>()
}

describe('event-bus', () => {
	// --- Sync emit ---

	describe('sync emit', () => {
		it('delivers payload to subscriber', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			bus.on('metals:fetched', handler)
			bus.emit('metals:fetched', { ok: true })

			expect(handler).toHaveBeenCalledWith({ ok: true })
		})

		it('delivers failure payload with error message', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			bus.on('crypto:fetched', handler)
			bus.emit('crypto:fetched', { ok: false, error: 'API returned 502' })

			expect(handler).toHaveBeenCalledWith({ ok: false, error: 'API returned 502' })
		})

		it('fires handlers in registration order', () => {
			const bus = createTickersBus()
			const order: string[] = []

			bus.on('metals:fetching', () => order.push('spinner'))
			bus.on('metals:fetching', () => order.push('log'))
			bus.emit('metals:fetching', undefined as void)

			expect(order).toEqual(['spinner', 'log'])
		})

		it('metals events do not fire crypto subscribers', () => {
			const bus = createTickersBus()
			const cryptoHandler = vi.fn()

			bus.on('crypto:fetching', cryptoHandler)
			bus.emit('metals:fetching', undefined as void)

			expect(cryptoHandler).not.toHaveBeenCalled()
		})

		it('emit with no subscribers does not throw', () => {
			const bus = createTickersBus()
			expect(() => bus.emit('metals:fetching', undefined as void)).not.toThrow()
		})
	})

	// --- Set dedup ---

	describe('dedup (Set storage)', () => {
		it('same handler reference fires only once', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			bus.on('metals:fetching', handler)
			bus.on('metals:fetching', handler)
			bus.emit('metals:fetching', undefined as void)

			expect(handler).toHaveBeenCalledTimes(1)
		})

		it('different closures are treated as separate handlers', () => {
			const bus = createTickersBus()
			const calls: string[] = []

			bus.on('metals:fetched', () => calls.push('spinner'))
			bus.on('metals:fetched', () => calls.push('dot-reset'))
			bus.emit('metals:fetched', { ok: true })

			expect(calls).toEqual(['spinner', 'dot-reset'])
		})
	})

	// --- Dispose fn ---

	describe('dispose (unsubscribe)', () => {
		it('on() returns a dispose function that removes the handler', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			const unsub = bus.on('crypto:fetching', handler)
			unsub()
			bus.emit('crypto:fetching', undefined as void)

			expect(handler).not.toHaveBeenCalled()
		})

		it('calling dispose twice is safe', () => {
			const bus = createTickersBus()
			const unsub = bus.on('metals:fetching', vi.fn())

			unsub()
			expect(() => unsub()).not.toThrow()
		})

		it('disposing one handler does not affect others', () => {
			const bus = createTickersBus()
			const spinner = vi.fn()
			const dot = vi.fn()

			const unsubSpinner = bus.on('crypto:fetched', spinner)
			bus.on('crypto:fetched', dot)

			unsubSpinner()
			bus.emit('crypto:fetched', { ok: true })

			expect(spinner).not.toHaveBeenCalled()
			expect(dot).toHaveBeenCalledWith({ ok: true })
		})
	})

	// --- once() ---

	describe('once()', () => {
		it('fires exactly once then auto-unsubscribes', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			bus.once('metals:fetched', handler)
			bus.emit('metals:fetched', { ok: true })
			bus.emit('metals:fetched', { ok: true })

			expect(handler).toHaveBeenCalledTimes(1)
		})

		it('can be cancelled before firing', () => {
			const bus = createTickersBus()
			const handler = vi.fn()

			const unsub = bus.once('crypto:fetched', handler)
			unsub()
			bus.emit('crypto:fetched', { ok: true })

			expect(handler).not.toHaveBeenCalled()
		})

		it('works alongside regular on() subscribers', () => {
			const bus = createTickersBus()
			const onceHandler = vi.fn()
			const onHandler = vi.fn()

			bus.once('metals:fetched', onceHandler)
			bus.on('metals:fetched', onHandler)

			bus.emit('metals:fetched', { ok: true })
			bus.emit('metals:fetched', { ok: false, error: 'timeout' })

			expect(onceHandler).toHaveBeenCalledTimes(1)
			expect(onHandler).toHaveBeenCalledTimes(2)
		})
	})

	// --- Error isolation ---

	describe('error isolation', () => {
		it('one handler throwing does not prevent others from firing', () => {
			const bus = createTickersBus()
			const spinner = vi.fn()
			const broken = vi.fn(() => {
				throw new Error('bug in handler')
			})
			const dot = vi.fn()

			bus.on('metals:fetched', spinner)
			bus.on('metals:fetched', broken)
			bus.on('metals:fetched', dot)
			bus.emit('metals:fetched', { ok: true })

			expect(spinner).toHaveBeenCalled()
			expect(broken).toHaveBeenCalled()
			expect(dot).toHaveBeenCalled()
		})

		it('logs handler errors to console.error', () => {
			const bus = createTickersBus()
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

			bus.on('crypto:fetched', () => {
				throw new Error('oops')
			})
			bus.emit('crypto:fetched', { ok: true })

			expect(spy).toHaveBeenCalledWith(expect.stringContaining('"crypto:fetched"'), expect.any(Error))

			spy.mockRestore()
		})
	})

	// --- Snapshot iteration ---

	describe('snapshot iteration', () => {
		it('handler unsubscribing itself mid-emit does not skip next handler', () => {
			const bus = createTickersBus()
			const results: string[] = []

			const unsub = bus.on('metals:fetching', () => {
				results.push('self-removing')
				unsub()
			})
			bus.on('metals:fetching', () => results.push('still-fires'))

			bus.emit('metals:fetching', undefined as void)
			expect(results).toEqual(['self-removing', 'still-fires'])
		})

		it('handler adding a new listener mid-emit does not fire it in same cycle', () => {
			const bus = createTickersBus()
			const lateSubscriber = vi.fn()

			bus.on('crypto:fetching', () => {
				bus.on('crypto:fetching', lateSubscriber)
			})
			bus.emit('crypto:fetching', undefined as void)

			expect(lateSubscriber).not.toHaveBeenCalled()

			// But fires on next emit
			bus.emit('crypto:fetching', undefined as void)
			expect(lateSubscriber).toHaveBeenCalled()
		})
	})

	// --- Max listeners warning ---

	describe('max listeners warning', () => {
		it('warns when listener count exceeds 10', () => {
			const bus = createTickersBus()
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			for (let i = 0; i < 11; i++) {
				bus.on('metals:fetching', () => {})
			}

			expect(spy).toHaveBeenCalledWith(expect.stringContaining('possible leak'))

			spy.mockRestore()
		})

		it('does not warn at or below 10', () => {
			const bus = createTickersBus()
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			for (let i = 0; i < 10; i++) {
				bus.on('metals:fetching', () => {})
			}

			expect(spy).not.toHaveBeenCalled()

			spy.mockRestore()
		})
	})
})
