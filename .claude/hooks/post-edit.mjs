#!/usr/bin/env node
// PostToolUse: format the just-edited file and, for .svelte edits,
// remind Claude to run the svelte-autofixer MCP tool before continuing.
//
// Exit codes:
//   0 → success, silent
//   2 → stderr injected into Claude's context as feedback (used for the autofixer nudge)

import { spawnSync } from 'node:child_process'

const input = await new Promise((resolve) => {
	let d = ''
	process.stdin.on('data', (c) => (d += c))
	process.stdin.on('end', () => resolve(d))
})

let payload
try {
	payload = JSON.parse(input)
} catch {
	process.exit(0)
}

const file = payload.tool_input?.file_path ?? payload.tool_input?.path
if (!file) process.exit(0)

const norm = String(file).replace(/\\/g, '/')

function run(cmd, args) {
	const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
	return r.status === 0
}

if (/\.svelte$/.test(norm)) {
	// Prettier handles .svelte via prettier-plugin-svelte (already in devDeps).
	run('pnpm', ['exec', 'prettier', '--write', file])
	// Nudge Claude to run the autofixer MCP tool — it can't be invoked from a shell hook.
	console.error(
		`[post-edit] Edited ${norm}. Run the \`mcp__svelte__svelte-autofixer\` MCP tool on this file before continuing (CLAUDE.md mandates this for every Svelte edit).`,
	)
	process.exit(2)
}

if (/\.(ts|mts|js|mjs|cjs)$/.test(norm)) {
	run('pnpm', ['exec', 'oxfmt', file])
	process.exit(0)
}

process.exit(0)
