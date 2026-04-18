#!/usr/bin/env node
// Generate runtime icon assets from the brand master.
//
// Reads artwork/brand/logo-mark-2560.png (single source of truth) and writes
// the derivatives that actually get served at runtime:
//
//   - static/favicon.png           (192×192, PWA min icon + browser tab)
//   - static/favicon-512.png       (512×512, PWA install dialog + Lighthouse icon-512)
//   - static/apple-touch-icon.png  (180×180, iOS home screen, canonical Apple size)
//
// Downscaling uses sharp (libvips) with Lanczos3 — the best general-purpose
// resampling kernel for reduction; sharper than bicubic, fewer artifacts than
// Mitchell. Output PNGs are 24-bit (palette:false) so the brand gradient
// stays smooth, and use max zlib compression to minimize wire bytes.
//
// Safe to run anytime; fully idempotent. Re-run whenever the master changes.
//
// Usage:
//   pnpm gen:brand-assets

import { stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

// ─── Paths ──────────────────────────────────────────────────────────────────

/** Absolute path to the repo root, derived from this file's location. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Single source of truth for the logo mark. */
const MASTER = join(ROOT, 'artwork/brand/logo-mark-2560.png')

/** Where the runtime-served derivatives land. */
const STATIC = join(ROOT, 'static')

// ─── Targets ────────────────────────────────────────────────────────────────

interface Target {
	/** Output filename inside static/. */
	name: string
	/** Square pixel dimension. */
	size: number
	/** One-line purpose, logged for context. */
	purpose: string
}

const TARGETS: Target[] = [
	{ name: 'favicon.png', size: 192, purpose: 'PWA min icon + browser tab' },
	{ name: 'favicon-512.png', size: 512, purpose: 'PWA install dialog + Lighthouse icon-512' },
	{ name: 'apple-touch-icon.png', size: 180, purpose: 'iOS home screen (canonical size)' },
]

// ─── Core ───────────────────────────────────────────────────────────────────

async function generate(target: Target): Promise<void> {
	const out = join(STATIC, target.name)
	await sharp(MASTER)
		.resize(target.size, target.size, {
			kernel: 'lanczos3', // best-quality downscale kernel for general art
			fit: 'cover',
		})
		.png({
			compressionLevel: 9, // max zlib; fine for one-off generation
			effort: 10, // maximum compression search
			palette: false, // keep 24-bit so gradients stay smooth
		})
		.toFile(out)
	const bytes = (await stat(out)).size
	const relOut = relative(ROOT, out).replace(/\\/g, '/')
	console.log(
		`  ✓ ${relOut.padEnd(30)} ${target.size}×${target.size}   ${(bytes / 1024).toFixed(1)} KB   (${target.purpose})`,
	)
}

async function main(): Promise<number> {
	const masterBytes = (await stat(MASTER).catch(() => null))?.size
	if (masterBytes === undefined) {
		console.error(`Master not found: ${MASTER}`)
		console.error('Expected artwork/brand/logo-mark-2560.png. Restore it and rerun.')
		return 1
	}
	const relMaster = relative(ROOT, MASTER).replace(/\\/g, '/')
	console.log(`Source:    ${relMaster}   (${(masterBytes / 1024).toFixed(1)} KB)`)
	console.log(`Kernel:    lanczos3   (sharp / libvips)`)
	console.log(`Targets:   ${TARGETS.length}`)
	console.log()
	for (const t of TARGETS) {
		await generate(t)
	}
	console.log()
	console.log('Done. Commit the regenerated PNGs when the master changes.')
	return 0
}

try {
	process.exit(await main())
} catch (err) {
	console.error(err)
	process.exit(1)
}
