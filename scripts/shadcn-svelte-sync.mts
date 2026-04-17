// Re-syncs all tracked shadcn-svelte components from upstream.
// Tracked = subfolders of src/lib/components/shadcn-svelte/.
// On success, stamps reminiLabs.{syncedAt, syncedAtIso} in components.json.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VENDOR_ROOT = resolve('src/lib/components/shadcn-svelte')
const COMPONENTS_JSON = resolve('components.json')

const components = readdirSync(VENDOR_ROOT, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort()

if (!components.length) {
	console.error(`no components found in ${VENDOR_ROOT}`)
	process.exit(1)
}

// Resolve shadcn-svelte's CLI entry from its package.json's `bin` field, then
// invoke Node on it directly. Skips every .cmd/.sh shim layer — no `shell: true`,
// no DEP0190, cross-platform. Reads package.json via fs (bypasses the package's
// `exports` restriction, which usually blocks `./package.json` as a subpath).
const SHADCN_ROOT = resolve('node_modules/shadcn-svelte')
const pkg = JSON.parse(readFileSync(resolve(SHADCN_ROOT, 'package.json'), 'utf8')) as {
	bin: string | Record<string, string>
}
const binField = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['shadcn-svelte']
const binPath = resolve(SHADCN_ROOT, binField)

console.log(`syncing: ${components.join(', ')}`)
const result = spawnSync(process.execPath, [binPath, 'add', ...components, '--overwrite', '-y'], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)

// Stamp sync metadata. Preserve other reminiLabs fields if any.
const config = JSON.parse(readFileSync(COMPONENTS_JSON, 'utf8')) as Record<string, unknown>
const existing = (config.reminiLabs as Record<string, unknown>) ?? {}
const syncedAt = Date.now()
config.reminiLabs = {
	...existing,
	syncedAt,
	syncedAtIso: new Date(syncedAt).toISOString(),
}
writeFileSync(COMPONENTS_JSON, JSON.stringify(config, null, '\t') + '\n')
console.log(`\n✓ synced at ${new Date(syncedAt).toISOString()}`)
