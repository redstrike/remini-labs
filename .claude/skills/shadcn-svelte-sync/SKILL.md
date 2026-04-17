---
name: shadcn-svelte-sync
description: Sync upstream shadcn-svelte components and adapt Remini Labs wrappers. Invoke when the user says "sync shadcn-svelte", "update shadcn from upstream", "refresh shadcn components", or types /shadcn-svelte-sync.
allowed-tools: >
    Read Grep Glob Edit Write
    Bash(pnpm shadcn-svelte:sync)
    Bash(pnpm shadcn-svelte *)
    Bash(git diff:*) Bash(git status:*) Bash(git log:*)
    Bash(pnpm check:fast) Bash(pnpm check:scripts:fast)
    Bash(pnpm prettier --write *)
    Bash(pnpm oxfmt --write *)
    Bash(pnpm oxlint --fix *)
---

# shadcn-svelte sync

Sync shadcn-svelte vendor code from upstream, review the diff, and adapt Remini Labs wrappers or custom components so the codebase stays type-safe and behavior-correct. Runs infrequently (every few months). Committing is out of scope — the user handles git from there.

## Preconditions

- Working tree clean (or holds only this sync's changes). If dirty, surface it and ask the user before proceeding.
- `pnpm shadcn-svelte:sync` exists at `scripts/shadcn-svelte-sync.mts`.
- `components.json` has `aliases.ui: "$lib/components/shadcn-svelte"`.

## Step 1 — Fetch upstream and normalize formatting

Run the sync script:

```bash
pnpm shadcn-svelte:sync
```

The script discovers tracked components from `src/lib/components/shadcn-svelte/` (folder listing is the truth), runs `pnpm shadcn-svelte add <all> --overwrite -y`, and on success stamps `reminiLabs.syncedAt` (epoch ms) + `reminiLabs.syncedAtIso` (ISO 8601 UTC) in `components.json`.

If the script errors, surface stderr and stop.

Then normalize formatting on the freshly-written files so Step 2's diff surfaces real content changes only. Match the formatter to the file type per CLAUDE.md's convention (`.svelte` → prettier, `.ts` → oxfmt + oxlint — they produce different imports/quotes/semicolons for TS):

```bash
# .svelte → prettier
pnpm prettier --write 'src/lib/components/shadcn-svelte/**/*.svelte'

# .ts → oxfmt + oxlint
pnpm oxfmt --write 'src/lib/components/shadcn-svelte/**/*.ts' src/lib/hooks/is-mobile.svelte.ts
pnpm oxlint --fix 'src/lib/components/shadcn-svelte/**/*.ts' src/lib/hooks/is-mobile.svelte.ts
```

Upstream ships its own line-ending/quote/import-order style — different from this project's. Both formatters normalize it; running them is idempotent on already-formatted files.

Include any additional hooks the sync pulled in (CLI installs them per `components.json`'s `aliases.hooks` — currently only `is-mobile.svelte.ts`).

**Windows-bash note**: do NOT use `git diff --name-only … | xargs pnpm prettier --write`. Git-bash on Windows doesn't reliably pipe stdin to `xargs` in this path, producing a "no parser, no file path" error. Glob patterns (above) bypass the issue.

## Step 2 — Classify the diff

```bash
git diff --stat src/lib/components/shadcn-svelte/
git diff src/lib/components/shadcn-svelte/
```

Three categories per changed file:

- **Trivial**: whitespace, comments, class reordering with identical selectors. Ignore.
- **Upstream drift**: Tailwind 4 modernizations (e.g. `data-[state=open]` → `data-open`), logical properties (`pe-8` → `pr-8`), hsl() wrapping. Keep as-is — this is the benefit of syncing.
- **API break**: renamed props, removed variants, new required props, removed or added files. Act in Step 3.

Report the classification to the user before acting.

## Step 3 — Adapt wrappers and custom components

For each API break, find consumers:

```bash
grep -rn "<ComponentName" src/routes/ src/lib/components/remini-labs/
```

- **Direct consumer** (mini-app route uses the shadcn-svelte component): update props/classes inline to match the new upstream.
- **Wrapped in `remini-labs/`**: update the wrapper to bridge the new upstream API back to the existing consumer contract, or propagate the break outward with user approval.
- **Fully-forked in `remini-labs/`** (we own the full component): selectively port upstream improvements. Unchanged parts → straight copy. Conflicting parts → manual merge preserving our customizations.

After each adaptation batch:

```bash
pnpm check:fast
```

Fix compile errors before moving on.

## Step 4 — Report and stop

Summarize for the user, then stop. The skill does not touch git.

- What upstream changed (from Step 2 classification)
- What local adaptations were made (from Step 3)
- Which files now have uncommitted changes (`git status --short`)

Do **not** run `git add`, `git commit`, or propose commit messages. Staging and commit timing are fully the user's call.

## Metadata contract

In `components.json`:

```json
{
	"reminiLabs": {
		"syncedAt": 1760792400000,
		"syncedAtIso": "2026-04-18T14:00:00.000Z"
	}
}
```

- `syncedAt` (epoch ms) — machine-readable, easy staleness math (`Date.now() - syncedAt`)
- `syncedAtIso` (UTC ISO 8601) — human-readable, timezone-unambiguous

The script is the only writer. Never stamp by hand.

## Red flags

- Never hand-edit `src/lib/components/shadcn-svelte/*`. Read-only upstream mirror.
- Never skip Step 2's diff review — API breaks hide in drift-looking diffs.
- Never stage or commit. Step 4 ends the skill; the user handles git from there.
- Never create sidecar files / per-component manifests. `components.json` is the single source of truth for tracked components and sync metadata.

## Done when

- [ ] `pnpm shadcn-svelte:sync` ran cleanly
- [ ] Diff classified (trivial / drift / API break)
- [ ] All API breaks adapted; consumers compile
- [ ] `pnpm check:fast` passes (0 errors, 0 warnings)
- [ ] User briefed: upstream summary + adaptations summary + list of modified files
