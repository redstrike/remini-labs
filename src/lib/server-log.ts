// Server-side structured-log helper.
//
// Wraps `console.error` with a JSON envelope so Cloudflare Workers Logs can filter by `event`
// and surface `error.{name, message, stack}` as discrete fields, instead of indexing an opaque
// `'<label>: <toString>'` string. Enables queries like `event = "phuquy-table-error"` or
// `error.name = "TimeoutError"` from the Workers Observability dashboard.
//
// Per Cloudflare Workers best practices: `nodejs_compat` + Workers Logs require structured JSON
// for queryable telemetry. The helper does the JSON.stringify once at the call site so the rest
// of the codebase stays terse:
//
//     logServerError('phuquy-table-error', e)
//     logServerError('ssi-iboard-stock-quote-error', e, { symbol })
//
// Event-name convention: kebab-case `<source>-<resource>-<status>` so dashboards group cleanly.

import { json } from '@sveltejs/kit'

export function logServerError(event: string, error: unknown, extra?: Record<string, unknown>): void {
	const payload =
		error instanceof Error
			? { name: error.name, message: error.message, stack: error.stack }
			: { value: String(error) }
	console.error(JSON.stringify({ event, error: payload, ...extra }))
}

// 502 error envelope — logs the structured error AND returns the canonical client-visible
// shape `{ error: message }` with status 502. Standardizes upstream-failure responses across
// every `+server.ts` route (the 5/8 majority shape; the other 3 used SvelteKit's `error()`
// HttpError which renders as `{ message }` — different shape, same intent). Pair the
// kebab-case event tag with a human-readable client message so dashboards remain queryable
// while end-users see something useful.
export function serverError502(
	event: string,
	error: unknown,
	message: string,
	extra?: Record<string, unknown>,
): Response {
	logServerError(event, error, extra)
	return json({ error: message }, { status: 502 })
}
