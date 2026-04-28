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

export function logServerError(event: string, error: unknown, extra?: Record<string, unknown>): void {
	const payload =
		error instanceof Error
			? { name: error.name, message: error.message, stack: error.stack }
			: { value: String(error) }
	console.error(JSON.stringify({ event, error: payload, ...extra }))
}
