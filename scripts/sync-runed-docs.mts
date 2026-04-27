#!/usr/bin/env node
// Syncs docs/runed/llms.txt by re-pulling Runed's per-utility markdown from
// GitHub `main`, regenerating the marker-delimited @runed-auto sections.
// Hand-curated sections (decision tree, groups index, gotchas, etc.) are
// preserved verbatim across runs.
//
// Usage:
//   pnpm docs:runed:sync              # full regen
//   pnpm docs:runed:sync --list-only  # smoke test: list utilities, no fetch/write
//   pnpm docs:runed:sync --help       # show usage
//
// Why `main` instead of pinning to the installed-version tag: Runed's docs
// site is unversioned, the upstream `sites/docs/...` path layout has shifted
// across releases, and active development has been on hold since Dec 2025
// (~5 months). For the foreseeable future `main` ≈ the latest stable release,
// so tracking main is both simpler and accurate. The script still records the
// installed version in meta for transparency, so an agent reading the doc can
// verify alignment against `node_modules/runed/package.json`.
//
// First run on a clean tree creates docs/runed/llms.txt from a scaffold; on
// subsequent runs only @runed-auto:meta and @runed-auto:catalog change. The
// `main` commit SHA + installed version are recorded in meta so diffs explain
// what (if anything) actually moved.
//
// Resilience: every fetch has a 15s AbortSignal.timeout(); per-file fetches run
// in parallel via Promise.allSettled; failures are logged and skipped unless
// they exceed FAILURE_THRESHOLD (then the regen aborts so we don't ship a
// silently incomplete catalog).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT: string = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = 'docs/runed/llms.txt'
const REPO = 'svecosystem/runed'
const BRANCH = 'main'
const UTILS_PATH = 'sites/docs/src/content/utilities'
const SOURCE_BASE = `https://github.com/${REPO}/blob/${BRANCH}/${UTILS_PATH}`
const INSTALLED_PKG_JSON = 'node_modules/runed/package.json'
const MAX_DESCRIPTION_LEN = 200
const REQUEST_TIMEOUT_MS = 15_000
/** Refuse to write if more than this fraction of file fetches fail. */
const FAILURE_THRESHOLD = 0.2

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubContentFile {
	name: string
	path: string
	type: 'file' | 'dir' | 'symlink' | 'submodule'
	download_url: string | null
}

interface GitHubCommit {
	sha: string
}

interface Primitive {
	name: string
	description: string
	filename: string
	sourceUrl: string
}

interface MetaArgs {
	sha: string
	installedVersion: string
	fetchedISO: string
	count: number
}

interface InstalledPackageJson {
	version?: string
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		headers: {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'remini-labs-sync-runed-docs',
		},
	})
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
	return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
	return res.text()
}

// ─── Version resolution ─────────────────────────────────────────────────────

/**
 * Reads `node_modules/runed/package.json` to find the actually-installed
 * version (the truth — package.json's spec is just a range; the installed
 * copy carries the resolved version). Used purely for meta transparency;
 * the catalog itself tracks `main`.
 */
async function resolveInstalledVersion(): Promise<string> {
	const abs = join(ROOT, INSTALLED_PKG_JSON)
	let raw: string
	try {
		raw = await readFile(abs, 'utf8')
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		throw new Error(`Cannot read ${INSTALLED_PKG_JSON}: ${msg}\nRun \`pnpm install\` first.`)
	}
	const pkg = JSON.parse(raw) as InstalledPackageJson
	if (!pkg.version) {
		throw new Error(`${INSTALLED_PKG_JSON} has no "version" field`)
	}
	return pkg.version
}

// ─── Markdown extraction ────────────────────────────────────────────────────

function splitFrontmatter(src: string): { fm: Record<string, string>; body: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(src)
	if (!m) return { fm: {}, body: src }
	const fm: Record<string, string> = {}
	for (const line of m[1].split(/\r?\n/)) {
		const kv = /^(\w[\w-]*)\s*:\s*(.*)$/.exec(line)
		if (!kv) continue
		let val = kv[2].trim()
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1)
		}
		fm[kv[1].toLowerCase()] = val
	}
	return { fm, body: m[2] }
}

function cleanInline(s: string): string {
	return s
		.replace(/<[^>]+>/g, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\s+/g, ' ')
		.trim()
}

/** First non-meta paragraph: skips frontmatter, headings, code fences, MDX imports/tags. */
function extractFirstParagraph(body: string): string {
	const lines = body.split(/\r?\n/)
	let i = 0
	while (i < lines.length) {
		const line = lines[i].trim()
		if (line === '') {
			i++
			continue
		}
		if (line.startsWith('#')) {
			i++
			continue
		}
		if (line.startsWith('```')) {
			i++
			while (i < lines.length && !lines[i].trim().startsWith('```')) i++
			i++
			continue
		}
		if (line.startsWith('import ') || line.startsWith('<script')) {
			while (i < lines.length && lines[i].trim() !== '') i++
			continue
		}
		if (/^<[A-Z]/.test(line)) {
			while (i < lines.length && lines[i].trim() !== '') i++
			continue
		}
		const para: string[] = []
		while (i < lines.length && lines[i].trim() !== '') {
			para.push(lines[i].trim())
			i++
		}
		return cleanInline(para.join(' '))
	}
	return ''
}

function firstH1(src: string): string | undefined {
	const m = /^#\s+(.+?)\s*$/m.exec(src)
	return m ? cleanInline(m[1]) : undefined
}

function nameFromFilename(filename: string): string {
	const stem = filename.replace(/\.(md|mdx|svelte\.md)$/i, '')
	const parts = stem.split('-')
	if (parts.length === 0) return stem
	const head = parts[0]
	const rest = parts.slice(1).map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : ''))
	if (head === 'use' || head === 'on') {
		return head + rest.join('')
	}
	return [head[0].toUpperCase() + head.slice(1), ...rest].join('')
}

function pickName(filename: string, fmTitle: string | undefined, h1: string | undefined): string {
	if (fmTitle) return cleanInline(fmTitle)
	if (h1) return h1
	return nameFromFilename(filename)
}

function pickDescription(fmDescription: string | undefined, body: string): string {
	const raw = fmDescription ? cleanInline(fmDescription) : extractFirstParagraph(body)
	if (!raw) return '(no description)'
	if (raw.length > MAX_DESCRIPTION_LEN) return raw.slice(0, MAX_DESCRIPTION_LEN - 1) + '…'
	return raw
}

// ─── Marker substitution ────────────────────────────────────────────────────

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceAutoSection(file: string, name: string, content: string): string {
	const open = `<!-- @runed-auto:${name} -->`
	const close = `<!-- /@runed-auto:${name} -->`
	const re = new RegExp(`${escapeRe(open)}[\\s\\S]*?${escapeRe(close)}`)
	if (!re.test(file)) {
		throw new Error(`Marker pair "@runed-auto:${name}" not found in existing file`)
	}
	return file.replace(re, `${open}\n${content}\n${close}`)
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderMeta(args: MetaArgs): string {
	return [
		`**Source:** github.com/${REPO} @ \`${BRANCH}\` · commit \`${args.sha.slice(0, 7)}\``,
		`**Installed locally:** runed@${args.installedVersion} (Runed dev on hold since Dec 2025; \`main\` ≈ current stable)`,
		`**Fetched:** ${args.fetchedISO}`,
		`**Utilities indexed:** ${args.count}`,
	].join('\n')
}

function renderCatalog(primitives: Primitive[]): string {
	const lines = ['| Primitive | One-liner | Source |', '|---|---|---|']
	for (const p of primitives) {
		const safe = p.description.replace(/\|/g, '\\|')
		lines.push(`| \`${p.name}\` | ${safe} | [${p.filename}](${p.sourceUrl}) |`)
	}
	return lines.join('\n')
}

function renderScaffold(meta: string, catalog: string): string {
	return `# Runed — AI Agent Reference

> Curated decision-tree reference for Runed primitives, optimized for AI agent consumption.
> Regenerate auto-sections via \`pnpm docs:runed:sync\`.
> For deep API details, WebFetch the source link in the catalog or use \`mcp__context7__query-docs\` for "/svecosystem/runed".

<!-- @runed-auto:meta -->
${meta}
<!-- /@runed-auto:meta -->

## Decision tree — "I need to…"

> TODO: port from \`docs/.cache/runed.dev/llms-full.txt\`

## Catalog

<!-- @runed-auto:catalog -->
${catalog}
<!-- /@runed-auto:catalog -->

## Groups (upstream API-shape index)

> TODO: port from \`docs/.cache/runed.dev/llms-full.txt\`

## Common patterns

> TODO: port from \`docs/.cache/runed.dev/llms-full.txt\`

## Gotchas

> TODO: port from \`docs/.cache/runed.dev/llms-full.txt\`

## When the catalog isn't enough

1. WebFetch the source link in the catalog table above
2. \`mcp__context7__query-docs\` for "/svecosystem/runed"
3. Read the upstream repo at github.com/${REPO}
`
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage:')
		console.log('  pnpm docs:runed:sync              full regen (fetch + write)')
		console.log('  pnpm docs:runed:sync --list-only  smoke test: list utilities, no fetch/write')
		return
	}
	const listOnly = args.includes('--list-only')

	const installedVersion = await resolveInstalledVersion()
	console.log(`↓ Installed runed → ${installedVersion}; tracking ${BRANCH}`)

	console.log(`↓ Listing ${UTILS_PATH} on ${REPO}@${BRANCH} …`)
	const items = await fetchJson<GitHubContentFile[]>(
		`https://api.github.com/repos/${REPO}/contents/${UTILS_PATH}?ref=${BRANCH}`,
	)
	const mdFiles = items.filter((f) => f.type === 'file' && /\.(md|mdx)$/i.test(f.name) && f.download_url !== null)
	if (mdFiles.length === 0) {
		throw new Error(`No .md/.mdx files found at ${UTILS_PATH} — has the upstream layout moved?`)
	}
	console.log(`✓ Found ${mdFiles.length} utility files`)

	if (listOnly) {
		for (const f of mdFiles) console.log(`  · ${f.name}`)
		console.log(`\nSmoke test OK. Re-run without --list-only to fetch + write.`)
		return
	}

	console.log(`↓ Resolving ${BRANCH} commit SHA …`)
	const commit = await fetchJson<GitHubCommit>(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`)
	console.log(`✓ ${commit.sha.slice(0, 7)}`)

	console.log(`↓ Fetching ${mdFiles.length} utility files in parallel …`)
	const settled = await Promise.allSettled(
		mdFiles.map(async (f) => {
			const raw = await fetchText(f.download_url as string)
			const { fm, body } = splitFrontmatter(raw)
			const name = pickName(f.name, fm.title, firstH1(body))
			const description = pickDescription(fm.description, body)
			console.log(`  ✓ ${f.name} → ${name}`)
			return {
				name,
				description,
				filename: f.name,
				sourceUrl: `${SOURCE_BASE}/${f.name}`,
			} satisfies Primitive
		}),
	)

	const primitives: Primitive[] = []
	const failures: { filename: string; reason: string }[] = []
	settled.forEach((r, i) => {
		if (r.status === 'fulfilled') {
			primitives.push(r.value)
		} else {
			const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
			failures.push({ filename: mdFiles[i].name, reason })
			console.log(`  ✗ ${mdFiles[i].name} — ${reason}`)
		}
	})

	if (failures.length / mdFiles.length > FAILURE_THRESHOLD) {
		throw new Error(
			`Refusing to write: ${failures.length}/${mdFiles.length} fetches failed ` +
				`(threshold ${(FAILURE_THRESHOLD * 100).toFixed(0)}%). Check network or rerun.`,
		)
	}

	primitives.sort((a, b) => a.name.localeCompare(b.name))

	const meta = renderMeta({
		sha: commit.sha,
		installedVersion,
		fetchedISO: new Date().toISOString().slice(0, 10),
		count: primitives.length,
	})
	const catalog = renderCatalog(primitives)

	const absOut = join(ROOT, OUT_PATH)
	let existing: string | null = null
	try {
		existing = await readFile(absOut, 'utf8')
	} catch {
		/* first run; scaffold will be written below */
	}

	let next: string
	if (existing) {
		next = replaceAutoSection(existing, 'meta', meta)
		next = replaceAutoSection(next, 'catalog', catalog)
	} else {
		next = renderScaffold(meta, catalog)
	}

	await mkdir(dirname(absOut), { recursive: true })
	await writeFile(absOut, next, 'utf8')
	const skipped = failures.length ? `, ${failures.length} skipped` : ''
	console.log(`✓ Wrote ${OUT_PATH} (${primitives.length} primitives${skipped})`)
}

main().catch((err: unknown) => {
	console.error(err)
	process.exit(1)
})
