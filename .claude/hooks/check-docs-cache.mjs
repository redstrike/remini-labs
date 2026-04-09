#!/usr/bin/env node
// SessionStart: warn if the Svelte docs cache is stale or missing.
// stdout on exit 0 is surfaced to Claude as additional session context.

import { statSync } from 'node:fs'

const TARGET = 'docs/.cache/svelte.dev/llms-full.txt'
const TTL_DAYS = 7

try {
	const s = statSync(TARGET)
	const ageDays = (Date.now() - s.mtimeMs) / 86_400_000
	if (ageDays > TTL_DAYS) {
		console.log(
			`[docs-cache] Svelte docs cache is ${ageDays.toFixed(1)}d old (>${TTL_DAYS}d TTL). ` +
				`Consider: pnpm docs:fetch https://svelte.dev/llms-full.txt --force`,
		)
	}
} catch {
	console.log(
		`[docs-cache] Svelte docs cache missing at ${TARGET}. ` +
			`Run: pnpm docs:fetch https://svelte.dev/llms-full.txt`,
	)
}

process.exit(0)
