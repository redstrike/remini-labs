// Integration tests for scripts/check-docs-cache.mts (SessionStart hook).
//
// Test strategy: black-box subprocess. Each test gets its OWN isolated cache
// directory (a "sandbox") under docs/.cache/__sandbox__/<name>/, passed to
// the hook via --cache-dir=<abs path>. That lets all four tests run
// concurrently: no two hook subprocesses ever walk the same tree, so one
// test's grace-window touch can't accidentally freshen another test's file.
//
// Why nested under a single __sandbox__/ parent?
//   - Matches the Jest/React `__tests__/` / `__mocks__/` idiom: dunder-wrapped
//     folder = framework-reserved test scaffolding. Immediately recognizable.
//   - Dunder wrap contains underscores, which are invalid in public DNS labels,
//     so `__sandbox__/` can never collide with a real cached domain folder.
//   - Simpler sweep (one rm of the parent) and simpler safety rail (one
//     `startsWith` check) than a flat-prefix layout.
//
// Why under docs/.cache/ (not os.tmpdir)?
//   - Colocated with the real cache the hook ordinarily sweeps, so test
//     sandboxes live next to the thing under test. Easier to eyeball on failure.
//   - docs/.cache/ is gitignored, so sandboxes never leak into VCS.
//   - A beforeAll sweep cleans up anything left behind by a crashed prior run.
//
// Refetch failures are made deterministic by using the RFC 2606 reserved
// `.test` TLD — refetches always get NXDOMAIN, never a real network call.
//
// Tests cover:
//   1. Fresh anchor → hook stays silent, mtime unchanged
//   2. Stale anchor in an unresolvable domain → grace-window math is correct
//   3. Priority at the domain root: llms-full.txt beats llms.txt
//   4. Anchor scan is root-only: a deep-only fixture (no root-level file) must
//      yield zero discovered anchors, proving no subtree walking happens.

import { execFile } from 'node:child_process'
import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { beforeAll, describe, it } from 'vitest'

const execFileP = promisify(execFile)

// ─── Paths & constants mirrored from the hook ──────────────────────────────

const REPO_ROOT: string = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT_CACHE_DIR: string = join(REPO_ROOT, 'docs', '.cache')
const HOOK_PATH: string = join(REPO_ROOT, 'scripts', 'check-docs-cache.mts')
const TTL_MS = 7 * 86_400_000
const GRACE_MS = 8 * 3_600_000
const DAY_MS = 86_400_000

// Short retry delays keep stale-path tests fast. Production defaults (1s/3s/5s)
// absorb real transient network blips; tests don't need that since network
// failure is deterministic (NXDOMAIN on the reserved .test TLD).
const TEST_RETRY_DELAYS = '10,30,50'

// All test sandboxes live under this single dunder-wrapped parent folder.
// Dunder bookends contain underscores (invalid in public DNS labels), so
// `__sandbox__/` can never collide with a real cached domain at the same
// level. Individual sandboxes are named children: `__sandbox__/fresh/`,
// `__sandbox__/stale_grace/`, etc.
const SANDBOX_ROOT: string = join(PROJECT_CACHE_DIR, '__sandbox__')

// ─── Fixture helpers ────────────────────────────────────────────────────────

async function makeSandbox(name: string): Promise<string> {
	const abs = join(SANDBOX_ROOT, name)
	// Defensive: wipe any leftover from a crashed prior run before seeding.
	await rm(abs, { recursive: true, force: true })
	await mkdir(abs, { recursive: true })
	return abs
}

async function destroySandbox(sandboxDir: string): Promise<void> {
	// Safety rail: the path must live strictly under SANDBOX_ROOT. Anything
	// else — a stray absolute path, a real cached domain folder, SANDBOX_ROOT
	// itself — is rejected.
	if (!sandboxDir.startsWith(SANDBOX_ROOT + sep)) {
		throw new Error(`refusing to destroy non-sandbox path: ${sandboxDir}`)
	}
	await rm(sandboxDir, { recursive: true, force: true })
}

// .test TLD is reserved (RFC 2606) → guaranteed NXDOMAIN on refetch.
function unresolvableDomain(suffix: string): string {
	return `remini-test-${suffix}.test`
}

async function seedAnchor(sandboxDir: string, domain: string, relPath: string, ageMs: number): Promise<string> {
	const abs = join(sandboxDir, domain, ...relPath.split('/'))
	await mkdir(dirname(abs), { recursive: true })
	await writeFile(abs, `# fixture\nseeded by check-docs-cache.test.mts\n`, 'utf8')
	const when = new Date(Date.now() - ageMs)
	await utimes(abs, when, when)
	return abs
}

interface HookResult {
	stdout: string
	stderr: string
	code: number
}

async function runHook(sandboxDir: string): Promise<HookResult> {
	try {
		const { stdout, stderr } = await execFileP(
			'node',
			[HOOK_PATH, `--retry-delays-ms=${TEST_RETRY_DELAYS}`, `--cache-dir=${sandboxDir}`],
			{
				cwd: REPO_ROOT,
				timeout: 85_000,
			},
		)
		return { stdout, stderr, code: 0 }
	} catch (err) {
		// The hook is designed to always exit 0 — landing here means something
		// genuinely unexpected (timeout, spawn error). Surface it.
		const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
		return {
			stdout: e.stdout ?? '',
			stderr: e.stderr ?? e.message ?? String(err),
			code: e.code ?? 1,
		}
	}
}

async function sweepLeftoverSandboxes(): Promise<void> {
	// Nuke the entire __sandbox__/ parent. Safe because the safety rail on
	// SANDBOX_ROOT's name guarantees we can't collide with real cached domains,
	// and `force: true` turns the "doesn't exist yet" case into a no-op.
	await rm(SANDBOX_ROOT, { recursive: true, force: true })
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('scripts/check-docs-cache.mts', () => {
	beforeAll(async () => {
		await sweepLeftoverSandboxes()
	})

	it.concurrent('fresh anchor → hook is silent and leaves mtime untouched', async ({ expect }) => {
		const sandbox = await makeSandbox('fresh')
		try {
			const domain = unresolvableDomain('fresh')
			const abs = await seedAnchor(sandbox, domain, 'llms-full.txt', 1 * DAY_MS)
			const mtimeBefore = (await stat(abs)).mtimeMs

			const { code, stderr } = await runHook(sandbox)

			expect(code).toBe(0)
			// Isolated sandbox → hook sees only this domain, and it's fresh.
			expect(stderr).not.toContain('stale')
			expect(stderr).not.toContain(domain)

			const mtimeAfter = (await stat(abs)).mtimeMs
			expect(mtimeAfter).toBe(mtimeBefore)
		} finally {
			await destroySandbox(sandbox)
		}
	})

	it.concurrent('stale anchor in unresolvable domain → refetch fails, grace window is extended', async ({
		expect,
	}) => {
		const sandbox = await makeSandbox('stale_grace')
		try {
			const domain = unresolvableDomain('unresolvable')
			const abs = await seedAnchor(sandbox, domain, 'llms-full.txt', 10 * DAY_MS)

			const t0 = Date.now()
			const { code, stderr } = await runHook(sandbox)
			const elapsed = Date.now() - t0

			expect(code).toBe(0)
			expect(stderr).toContain(domain)
			expect(stderr).toMatch(/stale .* refetching/)
			expect(stderr).toMatch(/refetch attempt .* failed/)
			expect(stderr).toMatch(/refetch failed .* extending grace window/)
			expect(stderr).toMatch(/extended grace window by 8h/)

			// Grace-window math: after all retries fail, the hook sets
			//   newMtime = HOOK_NOW − (TTL − GRACE)
			// while the test computes
			//   expected  = TEST_NOW − (TTL − GRACE).
			// Since TEST_NOW ≥ HOOK_NOW, newMtime ≤ expected, and the gap is
			// bounded above by `elapsed` (subprocess wall time). A small fixed
			// slop absorbs FS mtime granularity and clock rounding.
			const mtimeAfter = (await stat(abs)).mtimeMs
			const expected = Date.now() - (TTL_MS - GRACE_MS)
			const tolerance = elapsed + 2_000
			expect(mtimeAfter).toBeGreaterThanOrEqual(expected - tolerance)
			expect(mtimeAfter).toBeLessThanOrEqual(expected + tolerance)

			// Post-extend the file should read as FRESH — the whole point of
			// the grace window: the agent keeps working through an outage.
			const ageMs = Date.now() - mtimeAfter
			expect(ageMs).toBeLessThan(TTL_MS)
		} finally {
			await destroySandbox(sandbox)
		}
	})

	it.concurrent('priority: llms-full.txt is chosen over llms.txt at the domain root', async ({ expect }) => {
		const sandbox = await makeSandbox('priority_name')
		try {
			const domain = unresolvableDomain('priority-name')
			const full = await seedAnchor(sandbox, domain, 'llms-full.txt', 10 * DAY_MS)
			const index = await seedAnchor(sandbox, domain, 'llms.txt', 10 * DAY_MS)
			const indexMtimeBefore = (await stat(index)).mtimeMs

			const { code, stderr } = await runHook(sandbox)

			expect(code).toBe(0)
			// Hook must mention llms-full.txt refetch for this domain…
			expect(stderr).toMatch(new RegExp(`${domain}.*llms-full\\.txt`))
			// …and must NOT reconstruct llms.txt as the chosen anchor URL.
			expect(stderr).not.toMatch(new RegExp(`https://${domain}/llms\\.txt`))

			// llms.txt must be left entirely alone (no grace-window touch).
			const indexMtimeAfter = (await stat(index)).mtimeMs
			expect(indexMtimeAfter).toBe(indexMtimeBefore)

			// llms-full.txt gets the grace-window treatment.
			const fullMtimeAfter = (await stat(full)).mtimeMs
			expect(Date.now() - fullMtimeAfter).toBeLessThan(TTL_MS)
		} finally {
			await destroySandbox(sandbox)
		}
	})

	it.concurrent('scan is root-only: a deep-only anchor is never discovered', async ({ expect }) => {
		const sandbox = await makeSandbox('root_only')
		try {
			const domain = unresolvableDomain('root-only')
			// Seed ONLY a deep anchor file under this domain — no root-level file.
			// This is the tight canary for root-only discovery: any subtree walker
			// (BFS, DFS, by-depth, by-name) would find `nested/deeper/llms-full.txt`
			// and try to refetch it. A root-only scan finds nothing.
			//
			// NOTE: the previous "shallow llms.txt + deep llms-full.txt" fixture
			// could NOT distinguish these implementations — a BFS-by-depth walker
			// would also pick the shallow file at depth 0 and produce the same
			// observable outcome. This version fingerprints the invariant uniquely.
			const deep = await seedAnchor(sandbox, domain, 'nested/deeper/llms-full.txt', 10 * DAY_MS)
			const deepMtimeBefore = (await stat(deep)).mtimeMs

			const { code, stderr } = await runHook(sandbox)

			expect(code).toBe(0)
			// Positive signal: the hook actually ran and completed a sweep.
			// Without any discovered anchors, it emits the "no anchor files" notice.
			expect(stderr).toMatch(/no anchor files found/)
			// Negative signals: the hook never mentioned the domain or the deep file.
			expect(stderr).not.toContain(domain)
			expect(stderr).not.toMatch(/nested\/deeper\/llms-full\.txt/)

			// The mtime canary: a subtree walker would have grace-window touched
			// this file. Root-only must leave it exactly as seeded.
			const deepMtimeAfter = (await stat(deep)).mtimeMs
			expect(deepMtimeAfter).toBe(deepMtimeBefore)
		} finally {
			await destroySandbox(sandbox)
		}
	})
})
