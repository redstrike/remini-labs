#!/usr/bin/env node
// On-demand docs fetcher (Go/Deno style: full URL in, mirrored cache out).
//
// Cache-on-use with TTL: each URL is fetched only when the local copy is missing
// or older than the TTL. Cache paths are derived mechanically from the URL host
// and pathname, so any LLM-friendly markdown source works with zero registration.
//
//   https://shadcn-svelte.com/llms.txt
//     → docs/.cache/shadcn-svelte.com/llms.txt
//   https://shadcn-svelte.com/docs/components/button.md
//     → docs/.cache/shadcn-svelte.com/docs/components/button.md
//
// Usage:
//   pnpm docs:fetch <url> [<url>...]    # fetch one or more URLs
//   pnpm docs:fetch <url> --force       # bypass TTL (default 7d)
//   pnpm docs:fetch                     # show usage

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Types ──────────────────────────────────────────────────────────────────

interface FetchOptions {
	/** Bypass the TTL freshness check and re-download. */
	force: boolean
}

// ─── Config ─────────────────────────────────────────────────────────────────

/** Absolute path to the repo root, derived from this file's location. */
const ROOT: string = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Repo-relative cache root. Whole tree is gitignored. */
const CACHE_DIR = 'docs/.cache'

/** Shared TTL for every cached file. Override per-call with --force. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
	return res.text()
}

async function writeFileEnsured(relPath: string, content: string): Promise<void> {
	const abs = join(ROOT, relPath)
	await mkdir(dirname(abs), { recursive: true })
	await writeFile(abs, content, 'utf8')
}

async function isFresh(relPath: string): Promise<boolean> {
	try {
		const s = await stat(join(ROOT, relPath))
		return Date.now() - s.mtimeMs < TTL_MS
	} catch {
		return false
	}
}

function urlToCachePath(url: string): string {
	const u = new URL(url)
	let path = u.pathname.replace(/^\/+/, '')
	if (path === '' || path.endsWith('/')) path += 'index.html'
	return join(CACHE_DIR, u.host, path)
}

function isValidUrl(s: string): boolean {
	try {
		new URL(s)
		return true
	} catch {
		return false
	}
}

// ─── Core ───────────────────────────────────────────────────────────────────

async function fetchUrl(url: string, options: FetchOptions): Promise<void> {
	const path = urlToCachePath(url)

	if (!options.force && (await isFresh(path))) {
		console.log(`✓ fresh: ${path}`)
		return
	}

	console.log(`↓ fetch: ${url}`)
	const text = await fetchText(url)
	await writeFileEnsured(path, text)
	console.log(`✓ saved: ${path}`)
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function usage(): void {
	console.log('Usage:')
	console.log('  pnpm docs:fetch <url> [<url>...]    # fetch one or more URLs')
	console.log('  pnpm docs:fetch <url> --force       # bypass TTL (default 7d)')
	console.log('')
	console.log('Examples:')
	console.log('  pnpm docs:fetch https://shadcn-svelte.com/llms.txt')
	console.log('  pnpm docs:fetch https://shadcn-svelte.com/docs/components/button.md')
	console.log('')
	console.log(`Cache: ${CACHE_DIR}/<host>/<pathname>`)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const force = args.includes('--force')
	const urls = args.filter((a) => !a.startsWith('--'))

	if (urls.length === 0) {
		usage()
		return
	}

	for (const url of urls) {
		if (!isValidUrl(url)) {
			console.error(`✗ invalid URL: ${url}`)
			process.exitCode = 1
			continue
		}
		try {
			await fetchUrl(url, { force })
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error(`✗ FAIL ${url}: ${msg}`)
			process.exitCode = 1
		}
	}
}

main().catch((err: unknown) => {
	console.error(err)
	process.exit(1)
})
