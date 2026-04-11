#!/usr/bin/env node
// SessionStart hook: auto-discover and refresh stale doc-cache anchors.
//
// Algorithm (zero config, picks up new domains automatically):
//   1. List immediate subdirs of docs/.cache/ — each is a <doc_site_domain>.
//   2. List THAT domain's root folder only. Pick the first match by
//      ANCHOR_PRIORITY (llms-full.txt > llms.txt). Anchors live at the root;
//      deeper files are leaves (per-page caches fetched on demand), not anchors.
//   3. If the anchor's mtime is older than TTL_DAYS → treat as stale.
//   4. Refetch via the command defined in package.json "scripts.docs:fetch"
//      (invoked directly, bypassing pnpm/npm for lower startup cost on Windows),
//      reconstructing the URL mechanically as https://<domain>/<anchorName>.
//      Retries on transient failure with configurable backoff.
//   5. If all retries fail → extend the stale grace window by touching mtime
//      forward so the file appears (TTL − GRACE_HOURS) old. Keeps the agent
//      working through intermittent network/upstream outages.
//
// Always exits 0. Session start must never block on this.
// stdout is surfaced to Claude as additional session context.
//
// CLI overrides (both optional, mainly used by tests):
//   --cache-dir=<abs-path>           override docs/.cache/ root for isolation
//   --retry-delays-ms=<n,n,n>        override 1s/3s/5s backoff for fast tests

import { execFile } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { readdir, readFile, stat, utimes } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT: string = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseCacheDirFromArgv(argv: readonly string[]): string {
	const flag = '--cache-dir='
	const match = argv.find((a) => a.startsWith(flag))
	if (!match) return join(ROOT, 'docs', '.cache')
	return match.slice(flag.length)
}

const CACHE_DIR: string = parseCacheDirFromArgv(process.argv.slice(2))
const TTL_DAYS = 7
const TTL_MS: number = TTL_DAYS * 86_400_000
const GRACE_HOURS = 8
const GRACE_MS: number = GRACE_HOURS * 3_600_000
const ANCHOR_PRIORITY: readonly string[] = ['llms-full.txt', 'llms.txt']

function dirname(p: string): string {
	const i = p.lastIndexOf(sep)
	return i === -1 ? p : p.slice(0, i)
}

// ─── Discovery ──────────────────────────────────────────────────────────────

interface Anchor {
	domain: string
	absPath: string
	relFromDomain: string // e.g. "llms-full.txt" or "docs/llms.txt"
	anchorName: string // matched ANCHOR_PRIORITY entry
}

async function findAnchorForDomain(domain: string): Promise<Anchor | null> {
	const domainRoot = join(CACHE_DIR, domain)
	// Root-only scan: anchors live directly under the domain folder. Deeper
	// files (e.g. docs/.cache/shadcn-svelte.com/docs/components/button.md) are
	// cache-on-use leaves, not anchors driving the freshness sweep.
	let entries: Dirent[]
	try {
		entries = await readdir(domainRoot, { withFileTypes: true })
	} catch {
		return null
	}
	const rootFiles = new Set<string>()
	for (const e of entries) {
		if (e.isFile()) rootFiles.add(e.name)
	}
	for (const name of ANCHOR_PRIORITY) {
		if (rootFiles.has(name)) {
			return {
				domain,
				absPath: join(domainRoot, name),
				relFromDomain: name,
				anchorName: name,
			}
		}
	}
	return null
}

async function discoverAnchors(): Promise<Anchor[]> {
	let domains: Dirent[]
	try {
		domains = await readdir(CACHE_DIR, { withFileTypes: true })
	} catch {
		return []
	}
	const results: Anchor[] = []
	for (const d of domains) {
		if (!d.isDirectory()) continue
		const anchor = await findAnchorForDomain(d.name)
		if (anchor) results.push(anchor)
	}
	return results
}

// ─── Staleness + refetch ────────────────────────────────────────────────────

async function ageMs(absPath: string): Promise<number> {
	const s = await stat(absPath)
	return Date.now() - s.mtimeMs
}

function urlFor(anchor: Anchor): string {
	return `https://${anchor.domain}/${anchor.relFromDomain}`
}

// Read the docs:fetch script definition from package.json ONCE at startup,
// tokenize it (e.g. "node scripts/fetch-docs.mts" → ["node", "scripts/fetch-docs.mts"]),
// then invoke that executable directly. This bypasses pnpm's ~1–2s startup tax
// per call on Windows AND sidesteps the pnpm.cmd shim quirk (no `shell: true` needed).
async function loadDocsFetchCommand(): Promise<readonly string[]> {
	const pkgPath = join(ROOT, 'package.json')
	const raw = await readFile(pkgPath, 'utf8')
	const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
	const cmd = pkg.scripts?.['docs:fetch']
	if (!cmd) throw new Error('[docs-cache] package.json missing scripts["docs:fetch"]')
	const tokens = cmd.split(/\s+/).filter(Boolean)
	if (tokens.length === 0) throw new Error('[docs-cache] scripts["docs:fetch"] is empty')
	return tokens
}

const DOCS_FETCH_COMMAND: Promise<readonly string[]> = loadDocsFetchCommand()

async function runFetch(url: string): Promise<void> {
	const tokens = await DOCS_FETCH_COMMAND
	const [exe, ...args] = tokens as [string, ...string[]] // tokenizer guarantees length ≥ 1
	// 60s cap per attempt; inherits env so `node` resolves via PATH.
	await execFileP(exe, [...args, url, '--force'], {
		cwd: ROOT,
		timeout: 60_000,
	})
}

// Initial attempt + up to N retries. Delays apply BEFORE each retry.
// Default: 1s → 3s → 5s (production). Override via CLI for tests:
//   node scripts/check-docs-cache.mts --retry-delays-ms=10,30,50
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 5_000]

function parseRetryDelaysFromArgv(argv: readonly string[]): readonly number[] {
	const flag = '--retry-delays-ms='
	const match = argv.find((a) => a.startsWith(flag))
	if (!match) return DEFAULT_RETRY_DELAYS_MS
	const raw = match.slice(flag.length)
	const parsed = raw
		.split(',')
		.map((s) => Number.parseInt(s.trim(), 10))
		.filter((n) => Number.isFinite(n) && n >= 0)
	if (parsed.length === 0) {
		console.error(`[docs-cache] invalid ${flag}${raw} — falling back to defaults`)
		return DEFAULT_RETRY_DELAYS_MS
	}
	return parsed
}

const RETRY_DELAYS_MS: readonly number[] = parseRetryDelaysFromArgv(process.argv.slice(2))

async function refetchWithRetry(anchor: Anchor): Promise<boolean> {
	const url = urlFor(anchor)
	const maxAttempts = RETRY_DELAYS_MS.length + 1
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await runFetch(url)
			return true
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error(`[docs-cache] refetch attempt ${attempt}/${maxAttempts} failed for ${url}: ${msg}`)
			const nextDelay = RETRY_DELAYS_MS[attempt - 1]
			if (nextDelay !== undefined) {
				await new Promise((r) => setTimeout(r, nextDelay))
			}
		}
	}
	return false
}

async function extendGrace(absPath: string): Promise<void> {
	// Push mtime forward so the file appears (TTL − GRACE) old → fresh for GRACE_HOURS more.
	const freshenedMtime = new Date(Date.now() - (TTL_MS - GRACE_MS))
	try {
		await utimes(absPath, freshenedMtime, freshenedMtime)
		console.error(`[docs-cache] extended grace window by ${GRACE_HOURS}h for ${relative(ROOT, absPath)}`)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		console.error(`[docs-cache] failed to extend grace for ${absPath}: ${msg}`)
	}
}

// ─── Main ───────────────────────────────────────────────────────────────────

function formatAge(ms: number): string {
	const days = ms / 86_400_000
	if (days >= 1) return `${days.toFixed(1)}d`
	const hours = ms / 3_600_000
	if (hours >= 1) return `${hours.toFixed(1)}h`
	return `${(ms / 60_000).toFixed(1)}m`
}

async function main(): Promise<void> {
	const startedAt = Date.now()

	const anchors = await discoverAnchors()
	if (anchors.length === 0) {
		console.error(
			`[docs-cache] no anchor files found under ${relative(ROOT, CACHE_DIR)}/ — ` +
				`fetch one with: pnpm docs:fetch <url>`,
		)
		return
	}

	let refreshedCount = 0
	let gracedCount = 0

	for (const anchor of anchors) {
		const age = await ageMs(anchor.absPath)
		if (age < TTL_MS) continue // fresh → silent

		const rel = relative(ROOT, anchor.absPath)
		const ageStr = formatAge(age)
		console.error(`[docs-cache] stale [${ageStr}] ${rel} → refetching ${urlFor(anchor)}`)
		const ok = await refetchWithRetry(anchor)
		if (ok) {
			refreshedCount++
			console.error(`[docs-cache]   ↳ refreshed`)
		} else {
			gracedCount++
			console.error(`[docs-cache]   ↳ refetch failed — extending grace window`)
			await extendGrace(anchor.absPath)
		}
	}

	if (refreshedCount === 0 && gracedCount === 0) return // all fresh → silent

	const elapsed = Date.now() - startedAt
	console.error(`[docs-cache] done in ${elapsed}ms — refreshed=${refreshedCount} graced=${gracedCount}`)
}

main()
	.catch((err: unknown) => {
		const msg = err instanceof Error ? err.message : String(err)
		console.error(`[docs-cache] hook error (non-blocking): ${msg}`)
	})
	.finally(() => process.exit(0))
