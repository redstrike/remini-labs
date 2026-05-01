// Shared fetch-with-timeout factory. Each upstream client (Binance / SSI iBoard / Phu Quy /
// VCB) constructs its own `fetch` wrapper here so the timeout + baseline-headers boilerplate
// lives in one place, while per-client identity (UA strings, calibrated timeouts) stays at
// the call site.
//
// Use `globalThis.fetch` deliberately — NOT SvelteKit's `event.fetch`. The latter auto-injects
// an Origin header that some upstreams (Phu Quy, VCB) reject as a CORS pre-flight surrogate.

const DEFAULT_TIMEOUT_MS = 5_000

export interface FetchWithTimeoutOpts {
	timeoutMs?: number
	headers?: Record<string, string>
}

export type FetchWithTimeout = (url: string, init?: RequestInit) => Promise<Response>

export function createFetchWithTimeout(opts: FetchWithTimeoutOpts = {}): FetchWithTimeout {
	const { timeoutMs = DEFAULT_TIMEOUT_MS, headers: baseHeaders } = opts
	return (url, init) =>
		globalThis.fetch(url, {
			...init,
			signal: AbortSignal.timeout(timeoutMs),
			headers: { ...baseHeaders, ...init?.headers },
		})
}
