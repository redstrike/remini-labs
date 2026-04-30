---
name: review-code
description: Review the project's JS/TS surface for correctness, security, performance, footguns, and best practices across three layered dimensions (L1 general JS/TS hygiene always-on, L2 Svelte 5 + Runed when `.svelte`/`.svelte.ts` are in scope, L3 runtime-specific — Workers / Node / Bun / Deno / browser / universal — by per-file tag), then propose Modernize swaps (ES2022→2025, Web Standards, TypeScript) and Dedup extractions (Tier 1 Runed primitive match → Tier 2 rule-of-two with confirm → Tier 3 rule-of-three watch), wait for explicit user approval, apply approved refactors, run Svelte MCP autofixer (gated to `.svelte` touches; loop until no ISSUES — suggestions are advisory), then pnpm fmt + lint + check on touched paths. Invoke when the user types `/review-code [scope]`, or says "review code", "review my code", "code review", "review js", or "review ts". Optional scope arg is a file or directory path (leading `@` is stripped, e.g. `@src/` ≡ `src/`); no arg defaults to working-tree changes (staged + unstaged + untracked). May fan out to subagents (1–3 files inline; 4–8 cluster; 9+ cluster + dimension specialists; auto-spawn security specialist when auth/server-route/secret/eval-touching files are present); falls back to inline on quality doubt. Reference docs lookup is `docs/**/*` first (covers `docs/runed/llms.txt`, `docs/.cache/svelte.dev/llms-full.txt`, cached shadcn-svelte pages), then `mcp__context7__query-docs` for Runed and `mcp__svelte__get-documentation` for Svelte. Deep CF review escalates to `cloudflare:*` skills (workers-best-practices, durable-objects, agents-sdk, sandbox-sdk, cloudflare-email-service, etc.) via Read of their `references/rules.md`, then Cloudflare Docs MCP, then WebFetch. Skill never stages or commits — committing is out of scope.
allowed-tools: >
    Read Write Edit Grep Glob Agent
    Bash(git status:*) Bash(git diff:*) Bash(git ls-files:*)
    Bash(echo:*) Bash(grep:*) Bash(head:*) Bash(tail:*) Bash(cat:*)
    Bash(pnpm prettier --write *)
    Bash(pnpm oxfmt --write *)
    Bash(pnpm oxlint --fix *)
    Bash(pnpm check:fast)
    Bash(pnpm check:scripts:fast)
    Bash(pnpm fmt) Bash(pnpm lint:fix)
    mcp__svelte__svelte-autofixer
    mcp__svelte__get-documentation
    mcp__svelte__list-sections
    mcp__context7__query-docs
    mcp__context7__resolve-library-id
    mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation
    mcp__plugin_cloudflare_cloudflare-docs__migrate_pages_to_workers_guide
    WebFetch
---

# Review Code

A code review pass over the project's JS/TS surface that may apply refactors after explicit user approval. Three layered review dimensions (L1 general JS/TS hygiene, L2 Svelte 5 + Runed when in scope, L3 runtime-specific — Workers / Node / Bun / Deno / browser / universal) plus a Modernize dimension (ES2022→2025, Web Standards, TypeScript) and a Dedup dimension (Runed-first, then rule-of-two extractions). On `[A]ll` or per-index approval, applies the refactors, runs Svelte autofixer (gated to `.svelte` touches), then pnpm format/lint/typecheck. On `[Q]uit`, exits cleanly with the analysis as the deliverable. Committing is out of scope; the user handles git from there.

**Pipeline shape:** Setup → Phase 1 (Review L1+L2+L3) + Phase 2 (Modernize) + Phase 3 (Dedup) → Approval gate → Phase 4 (Apply) → Phase 5 (Autofixer · gated) → Phase 6 (Quality) → Final report.

**Goal hierarchy** (in priority order — severity ranking _within_ the Review dimension lives in the Phase 1 decision tree):

1. **Review** — best-practices, footgun avoidance, performance, **correctness (top priority)**, security
2. **Modernize** — propose ES2022→2025 / Web Standards / TypeScript feature swaps that simplify hand-rolled patterns
3. **Dedup** — extract tiny single-purpose helpers with the best-DX function signatures
4. **Apply refactor** — only after explicit approval

**Net-simplicity bar — every refactor must clear it.** A Modernize swap, Tier 1 swap, Tier 2 extraction, or any approved change is only valid if it produces **less code to read OR simpler code to understand**. Matching a quick-reference pattern is necessary but NOT sufficient. If swapping a hand-rolled pattern for a Runed primitive ADDS lines or shifts complexity to a less-obvious shape (imperative `pause()`/`resume()` vs declarative `$effect` cleanup; symmetric `Debounced` stuck on an asymmetric anti-flash gate; `useEventListener` in a module-level `.ts` file with no reactive scope), the refactor FAILS the bar — skip it and document the rejection. Don't churn for refactor's sake. Blast radius across many files is a red flag, not a feature. See `/redstrike: coding-prefs/refactor-net-simplicity` for the user's framing.

## Preconditions — check in order, stop on first failure

1. Working tree has changes OR a scope arg is provided. If neither, stop: _"Working tree clean — pass a scope arg (e.g. `/review-code src/lib/`) to scan a directory."_
2. `docs/runed/llms.txt` exists (only required when the resolved scope contains `.svelte` or `.svelte.ts` files). If absent in that case, stop: _"Run `pnpm docs:runed:sync` to regenerate the Runed catalog before invoking this skill."_
3. Svelte MCP server is reachable (`mcp__svelte__svelte-autofixer` callable) — only required when `.svelte` files are in scope. If unreachable, surface the error and ask the user to reconnect.
4. **Cloudflare reference reachable** — only required when any in-scope file resolves to `WORKERD` (per runtime tree below) OR carries a CF product subtag. Walk the CF reference resolution chain in Setup: project-scope plugin → personal-scope plugin → cloudflare-docs MCP → WebFetch. If steps 1–2 both miss AND the cloudflare-docs MCP is unreachable, stop: _"Install the cloudflare plugin (project or personal scope) via `/plugin` then `/reload-plugins`, or ensure the cloudflare-docs MCP is reachable."_ This is a CF-Workers-centric project — hand-written rules from training-data recall are stale by definition.

## Setup — resolve scope, tag runtime, decide fanout, prime references

### Decision tree — scope resolution

```
SCOPE INPUT
│
├─ no arg
│   └─ → working-tree mode
│         git status --short            (enumerate changed/added/untracked)
│         git diff                      (unstaged content)
│         git diff --cached             (staged content)
│
├─ has arg
│   ├─ leading "@"                     → strip "@", continue with the rest
│   ├─ resolves to a file
│   │   └─ filter: must be .svelte / .svelte.ts / .ts / .mts to be in-scope
│   └─ resolves to a directory
│       └─ enumerate via Glob, filter to .svelte / .svelte.ts / .ts / .mts
│
└─ path doesn't exist                  → stop: "Path '<arg>' not found"
```

### Decision tree — runtime detection (per file)

```
FILE PATH / IMPORTS
│
├─ +server.ts / +page.server.ts / +layout.server.ts / hooks.server.ts
│   └─ → WORKERD              (adapter-cloudflare runtime)
│
├─ +page.ts / +layout.ts                                     (loads run on both)
│   └─ → UNIVERSAL            (server + client)
│
├─ src/lib/server/**/*
│   └─ → WORKERD
│
├─ scripts/**/*.mts
│   └─ → NODE                 (tsgo / pnpm-run context)
│
├─ *.svelte (client portion) /
│   src/lib/**/*.{ts,svelte.ts} imported only by .svelte
│   └─ → BROWSER
│
├─ src/lib/**/*.{ts,svelte.ts} imported by both .svelte
│   AND a +server.ts / +*.server.ts
│   └─ → ANY                  (must be portable)
│
└─ explicit shebang or top-level import of `node:*` / `bun:*` / `deno:*`
    overrides above tags         → NODE / BUN / DENO
```

The runtime tag drives the L3 review pass below.

### Decision tree — CF product subtag (only for WORKERD-tagged files)

```
WORKERD FILE
│
├─ extends DurableObject                 → +DO
├─ extends WorkerEntrypoint              → +RPC
├─ extends Workflow                      → +WORKFLOW
├─ from "agents"                         → +AGENTS-SDK
├─ from "@cloudflare/sandbox"            → +SANDBOX-SDK
├─ env.AI.run / env.AI.* usage           → +WORKERS-AI
├─ Email Workers handler / send_email    → +EMAIL
└─ none of the above                     → no subtag (plain Workers)
```

A file may carry multiple subtags (e.g. a DO that also uses `env.AI`). Each subtag drives which `cloudflare:*/references/rules.md` to consult during the L3 review:

| Subtag          | Reference skill                                           |
| --------------- | --------------------------------------------------------- |
| `+DO`           | `cloudflare:durable-objects`                              |
| `+RPC`          | `cloudflare:workers-best-practices`                       |
| `+WORKFLOW`     | `cloudflare:workers-best-practices`                       |
| `+AGENTS-SDK`   | `cloudflare:agents-sdk`                                   |
| `+SANDBOX-SDK`  | `cloudflare:sandbox-sdk`                                  |
| `+WORKERS-AI`   | `cloudflare:workers-best-practices` + cloudflare-docs MCP |
| `+EMAIL`        | `cloudflare:cloudflare-email-service`                     |
| no subtag       | `cloudflare:workers-best-practices`                       |
| unknown product | `cloudflare:cloudflare` (umbrella) → cloudflare-docs MCP  |

### Decision tree — CF reference resolution chain

```
CF REFERENCE LOOKUP  (used wherever the table above points at a `cloudflare:*` skill)
│
├─ 1. Project-scope plugin
│      Glob: .claude/plugins/cache/**/skills/<skill>/references/rules.md
│      (settings.json: "enabledPlugins" includes "cloudflare@claude-plugins-official")
│
├─ 2. Personal-scope plugin
│      Glob: ~/.claude/plugins/cache/**/skills/<skill>/references/rules.md
│
├─ 3. Cloudflare Docs MCP   (no auth — Docs class per CLAUDE.md)
│      mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation
│
└─ 4. WebFetch
       https://developers.cloudflare.com/<path>
```

Steps 1–2 both miss AND step 3 MCP unreachable → precondition 4 trips; stop with the install/reload instruction.

### Decision tree — fanout strategy

```
IN-SCOPE FILE COUNT  N
│
├─ N ≤ 3       → INLINE             (no subagents; main agent does all reviews)
├─ 4 ≤ N ≤ 8   → CLUSTER            (2–3 general-purpose subagents reviewing file clusters)
├─ N ≥ 9       → CLUSTER + DIMENSION (file-cluster subagents + parallel
│                                     Modernize/Dedup specialists)
│
├─ At ANY size: auth/server-route/secret/eval-touching file present
│                → AUTO-SPAWN security specialist subagent
│                  (general-purpose, narrow brief, parallel with main flow)
│
└─ At ANY size: ≥5 WORKERD files OR any CF product subtag present
                 → AUTO-SPAWN CF specialist subagent
                   (general-purpose; brief includes Read of the matching
                   `cloudflare:*/references/rules.md` per the subtag → skill table;
                   parallel with the security specialist when both triggers fire)

FALLBACK GATE: if briefing the subagent feels under-specified or quality
               would degrade, drop fanout, run inline. Tokens saved is a
               side benefit; quality is the floor.
```

### Decision tree — subagent type pick

```
TASK SHAPE
│
├─ broad cluster review, mixed-dimension     → general-purpose
├─ src/lib/utils/cache.ts touched / cache layer signals
│                                             → cache-layer-auditor
├─ visual / shadcn / DESIGN.md drift          → design-conformance-reviewer
├─ targeted file lookup / "where is X"        → Explore (only if subagent at all)
└─ doubt                                      → general-purpose with a tight brief
```

### Subagent return-shape contract (mandatory when fanning out)

Every subagent prompt MUST end with this YAML structure. Subagents emit ONE block; the main agent merges and dedupes across blocks before producing Phase 1/2/3 output.

```yaml
findings:
    - file: <path>
      line: <number>
      severity: correctness | security | performance | footgun | best-practice
      layer: L1 | L2 | L3
      runtime_tag: WORKERD | UNIVERSAL | BROWSER | NODE | BUN | DENO | ANY
      summary: <one-line>
modernize:
    - file: <path>
      line: <number>
      table: A-ES2022 | B-ES2023 | C-ES2024 | D-ES2025 | E-WebStandards | F-TypeScript
      from: <hand-rolled pattern>
      to: <modern swap>
      baseline: widely-available | newly-available | needs-polyfill
dedup:
    - tier: 1 | 2 | 3
      sites:
          - { file: <path>, line: <number> }
      proposed: <one-line>
skipped_verified:
    - reason: <one-line — gate failed, baseline mismatch, etc.>
```

### Reference docs

After scope and tags resolve, prime the Runed catalog into context only if `.svelte` / `.svelte.ts` are in scope (it's tiny, ~250 lines):

```bash
cat docs/runed/llms.txt
```

Escalation table when a finding/proposal needs deeper reference info:

| Need                                                                         | Source order                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runed primitive deep details                                                 | `Grep docs/runed/llms.txt` first; if catalog row insufficient → `mcp__context7__query-docs` for `/svecosystem/runed`                                                                |
| Svelte 5 / SvelteKit semantics                                               | `Grep docs/.cache/svelte.dev/llms-full.txt` with targeted patterns; if missed → `mcp__svelte__list-sections` then `mcp__svelte__get-documentation`                                  |
| shadcn-svelte component                                                      | `Read docs/.cache/shadcn-svelte.com/<page>.md` if cached; if missed, leave a follow-up note (don't fetch in this skill)                                                             |
| Modernize baseline check                                                     | `Grep docs/.cache/svelte.dev/llms-full.txt` for the project floor (Vite 8 baseline-widely-available); cross-ref `/redstrike: tech-stack/javascript-modern/README`                   |
| Cloudflare Workers / KV / R2 / D1 / DO / AI / Email / Sandbox best practices | Resolve via the CF reference resolution chain above (project plugin → personal plugin → cloudflare-docs MCP → WebFetch); pick the `cloudflare:*` skill via the subtag → skill table |

Never read `docs/.cache/svelte.dev/llms-full.txt` in full — Grep with targeted patterns.

## Phase 1 — Review (L1 + L2 + L3)

Walk every in-scope file. **Re-read every file from disk at the start of every run** — don't trust mental cache from prior sessions or earlier in the current conversation. Files may have been modified, reverted, or hand-edited between invocations; even files reviewed earlier in the same conversation must be re-read. The in-scope file list drives the reads, not "I think I remember this file."

For each issue found, classify by severity AND tag the layer (L1/L2/L3) — the layer drives which catalog the rule comes from; severity drives the report grouping.

### Decision tree — issue severity (classify by IMPACT, not by fix-effort)

```
ISSUE FOUND
│
├─ wrong output / data loss / race / stale closure / leaked $effect /
│   broken cleanup / SSR-vs-client mismatch / type-narrowing lost across async
│                                                          → CORRECTNESS  (top)
│
├─ XSS / injection / unsafe innerHTML / leaked secret /
│   open redirect / over-permissive CORS / unsanitized URL params
│                                                          → SECURITY
│
├─ N+1 fetch / memory leak / unbounded re-render /
│   missing AbortController / oversized payload / blocking SSR
│                                                          → PERFORMANCE
│
├─ silent failure mode / API misuse trap /
│   undocumented behavior the code relies on
│                                                          → FOOTGUN
│
└─ idiomatic concern / style / minor refactor hint        → BEST-PRACTICE
   (if the hint is a Modernize swap, file under Phase 2 instead)
```

### Don't reflexively skip cheap fixes on rare paths

When a finding sits on an auth-gated, manual, or infrequent path (admin diagnostics, ops endpoints, weekly maintenance scripts), the natural cost-benefit answer is "skip — too rare to matter." The user's preference is the opposite: if the fix is **≲20 lines, single file, no signature churn**, surface it as a propose-with-rationale rather than pre-marking it skipped. _"Cost is small, mental gains in codebase pride are the luxury part."_ See `/redstrike: coding-prefs/rare-path-quality-fix` for the decision tree.

Apply this filter when categorizing findings: rarity does NOT downgrade severity, and cost-benefit math does NOT auto-skip cheap fixes. Let the user decide.

### L1 catalog — general JS/TS hygiene (always-on)

- **Correctness:** stale closure over a reactive value; race condition between concurrent fetches; unawaited promise (especially in cleanup paths); narrowing lost across `await` (alias to a `const` immediately); mutation during iteration; `==` where `===` is correct; missing AbortController on a flow that should be cancellable.
- **Security:** XSS via innerHTML assignment without a sanitizer; the legacy `document` write method on untrusted content; code-injection via the Function constructor with dynamic input; bare-word eval on untrusted strings; command-injection via spawning shell commands through `node:child_process` with un-escaped argv (prefer execFile-style with array argv); open redirects from untrusted URL params; secrets leaking into the client bundle (`PUBLIC_*` vs server-only env); over-permissive CORS (`*` plus credentials); unsanitized URL search params used in route logic.
- **Performance:** N+1 sequential fetches that could be `Promise.all` / `Promise.allSettled`; oversized payload (full record when one field is needed); blocking SSR in a load function (await a non-critical side effect instead of streaming); missing AbortController on search-as-you-type; unbounded re-render from a wide reactive dependency.
- **Footgun:** API misuse traps (`Object.groupBy` returning a null-prototype object; `JSON.stringify` on BigInt throwing; `??` differs from `||` only on falsy-not-nullish); undocumented behavior the code silently depends on (third-party endpoint shape, header order); silent fallback that hides a real error.
- **Best-practice:** options-object over positional booleans; `satisfies` over `as` where it preserves narrowing; explicit return type on the exported API surface; `const` for unmutated bindings; remove dead code over commenting it out.

### L2 catalog — Svelte 5 + Runed (only when `.svelte` / `.svelte.ts` in scope)

- **Reactivity:** `$effect` reading a reactive value directly instead of as a getter (loses reactivity); `$state` mutated outside a reactive context; `$derived` with side effects (should be `$effect`); `$effect` with no cleanup but mounting a long-lived listener.
- **Lifecycle:** missing teardown on `setInterval` / `setTimeout` inside `$effect`; `useEventListener` / `PersistedState` / `Debounced` constructed in a module-level `.ts` file (no reactive scope to bind cleanup) — see Phase 3 SSR caveats.
- **shadcn / DESIGN.md drift:** hardcoded colors / off-scale spacing / non-system fonts (defer to `design-conformance-reviewer` when scope is large).

### L3 catalog — runtime-specific (per-file by Setup tag)

- **WORKERD (Cloudflare Workers) — always-on rules.** Deep review escalates per the subtag → skill table; canonical source is each `cloudflare:*/references/rules.md`. Always verify against the resolution chain before flagging — these summaries are triage, not authority.
    - **Config:** missing `nodejs_compat` flag on `node:*` imports; stale `compatibility_date` (>6 months); hand-written `Env` interface that drifts from `wrangler types`; hardcoded secrets in `vars` instead of `wrangler secret put`; `wrangler.toml` instead of `wrangler.jsonc`.
    - **Request/Response:** `await response.text/json/arrayBuffer()` on unbounded data (128 MB OOM — stream with `TransformStream` or `new Response(response.body, response)`); destructuring `ctx` (`const { waitUntil } = ctx` → "Illegal invocation" at runtime); inline `await` on background work that should be `ctx.waitUntil()`.
    - **Architecture:** Cloudflare REST API call (`fetch("https://api.cloudflare.com/client/v4/...")`) where a binding exists (KV / R2 / D1 / Queues / Vectorize / Hyperdrive); Worker-to-Worker via public URL instead of service binding (`env.SVC.method()` RPC or `env.SVC.fetch()`); direct PG/MySQL `new Client()` without Hyperdrive (300–500 ms TCP+TLS+auth penalty per request); long-running work in fetch handler instead of Queues / Workflows.
    - **Code Patterns:** module-level mutable state (`let user = ...` reassigned in handler) → cross-request leak + "Cannot perform I/O on behalf of a different request"; floating promise (no `await` / `return` / `ctx.waitUntil`); CPU-heavy sync work near the 10 ms (Bundled) / 30 s (Standard) limits; Cache API `Cache-Control: private` silently blocking `cache.put` (use `public, s-maxage=N, max-age=0` — see `/redstrike: tech-stack/cloudflare-workers/cache-api-gotchas` for related gotchas); `console.log("string " + var)` instead of structured `JSON.stringify({...})` for queryable logs; `observability.enabled` missing from wrangler config.
    - **Security:** `Math.random()` for tokens / IDs / session keys (use `crypto.randomUUID()` or `crypto.getRandomValues()`); secret comparison via `===` instead of `crypto.subtle.timingSafeEqual` after fixed-size hash (timing side-channel); `ctx.passThroughOnException()` as error handling (use explicit try/catch + structured JSON 500 + `console.error`); secret leakage into client bundle (`PUBLIC_*` env vs server-only).
    - **Platform classes (`+DO` / `+RPC` / `+WORKFLOW` subtags):** `implements DurableObject` instead of `extends` (loses `this.ctx` / `this.env`); `env.X` inside the class body instead of `this.env.X`; missing `wrangler types` regen after binding rename; `any` on `Env` or handler params (defeats binding type safety).
    - **Product-specific (subtag escalation):** any of `+AGENTS-SDK` / `+SANDBOX-SDK` / `+WORKERS-AI` / `+EMAIL` present → escalate to the matching `cloudflare:*/references/rules.md` for product-specific rules. The bullets above remain always-on; product rules layer on top.
- **UNIVERSAL (`+page.ts` / `+layout.ts`):** fire-and-forget fetch double-firing on hydration; bare `window.fetch` not deduping (use `event.fetch`); top-level un-awaited promise that should stream as a deferred chunk. See `/redstrike: tech-stack/sveltekit/universal-load`, `/redstrike: tech-stack/sveltekit/streaming-load`.
- **BROWSER:** prefer Web Standards by default — `fetch` over `axios`; `URL` / `URLSearchParams` over manual parsing; `crypto.subtle` over crypto-js; `AbortController` over a cancelled-flag; `structuredClone` over JSON-parse-stringify; `queueMicrotask` over `Promise.resolve().then`.
- **NODE / BUN / DENO:** prefer Web Standards globals when portable (`fetch`, `URL`, `crypto.subtle`, `AbortController`, `ReadableStream`); flag a `node:*` import that has a Web Standards equivalent in a file that is otherwise portable.
- **ANY (portable):** no runtime-locked imports; if a `node:*` import sneaks into an `ANY`-tagged file, that's a portability bug.

### Output format — Phase 1

Number globally across severities (so the user can reference indexes), but group by severity heading. Tag each finding with its layer + runtime where useful. Omit empty severities.

```
## Phase 1 — Review

### Correctness
1. [L1 · ANY] src/lib/utils/api.ts:55 — fetch effect missing AbortController; old responses can race-overwrite newer state
2. [L2 · BROWSER] src/lib/foo.svelte:42 — $effect reads `query` directly instead of as a getter; loses reactivity on later writes
3. [L3 · UNIVERSAL] src/routes/+page.ts:18 — fire-and-forget fetch double-fires on hydration; gate with `if (!browser)` (see `/redstrike: tech-stack/sveltekit/universal-load`)

### Security
4. [L1 · BROWSER] src/lib/notice.svelte:7 — innerHTML rendered from upstream JSON without sanitization

### Performance
5. [L3 · WORKERD] src/routes/api/spots/+server.ts:24 — `Cache-Control: private` silently blocks edge cache.put

### Best-practice
6. [L1 · ANY] src/lib/util/format.ts:12 — positional boolean param; refactor to options object
```

## Phase 2 — Modernize

Walk the same files looking for hand-rolled patterns that have a modern feature replacement. For each candidate, classify by table letter (A–F).

### Decision tree — modernize candidate

```
PATTERN OBSERVED
│
├─ Hand-rolled JS pattern that has a built-in ES2022→2025 method
│   └─ → Pick the table (A/B/C/D)
│
├─ Polyfill / ad-hoc utility that has a Web Standards equivalent
│   └─ → Table E
│
├─ TypeScript pattern that loses type info OR uses an older idiom
│   when a newer one preserves narrowing
│   └─ → Table F
│
└─ No modern equivalent OR not Baseline-widely-available
    AND project doesn't accept polyfill risk             → don't propose
```

### Pre-proposal gates (Modernize)

```
MODERNIZE CANDIDATE
│
├─ Gate 1 — Baseline availability vs project floor (Vite 8 baseline-widely-available)
│   ├─ Widely-available (ES2022, most ES2023)            → PASS
│   ├─ Newly-available (most ES2024+)                    → flag "needs polyfill or accepted risk"
│   └─ Not yet baseline                                   → FAIL: don't propose
│
├─ Gate 2 — Net-simplicity bar
│   Same bar as Phase 3. Refactor must reduce LOC OR clarify cognition.
│
└─ Gate 3 — Semantic match
    The modern feature must do exactly what the hand-rolled does, not "close enough."
    (e.g. `??` ≠ `||` for falsy-not-nullish; `Object.groupBy` returns null-prototype, not `{}`)
```

### Quick-reference tables

#### A — ES2022 (widely-available, ship freely)

| Hand-rolled                                              | Modern swap                                |
| -------------------------------------------------------- | ------------------------------------------ |
| `Object.prototype.hasOwnProperty.call(o, k)`             | `Object.hasOwn(o, k)`                      |
| `arr[arr.length - 1]`                                    | `arr.at(-1)`                               |
| `new Error(msg); err.upstream = orig`                    | `new Error(msg, { cause: orig })`          |
| Convention `_field` / WeakMap / Symbol for private state | `#field` (when realm-bound is acceptable)  |
| Module-level `let` mutated for lazy init                 | top-level await (leaf modules; see caveat) |

See `/redstrike: tech-stack/javascript-modern/README` for ship-status matrix.

#### B — ES2023 (widely-available)

| Hand-rolled                               | Modern swap                                      |
| ----------------------------------------- | ------------------------------------------------ |
| `[...arr].sort()` / `[...arr].reverse()`  | `arr.toSorted()` / `arr.toReversed()`            |
| `arr.slice().splice(...)`                 | `arr.toSpliced(start, deleteCount, ...items)`    |
| `arr.map((x, i) => i === idx ? newV : x)` | `arr.with(idx, newV)`                            |
| `[...arr].reverse().find(pred)`           | `arr.findLast(pred)` / `arr.findLastIndex(pred)` |

See `/redstrike: tech-stack/javascript-modern/array-immutable` for shallow-copy + sparse-hole pitfalls.

#### C — ES2024 (newly-available — flag baseline)

| Hand-rolled                                         | Modern swap                               |
| --------------------------------------------------- | ----------------------------------------- |
| Manual `reduce` into `{ [k]: [...] }`               | `Object.groupBy(items, fn)` (null-proto!) |
| Manual `reduce` into `Map`                          | `Map.groupBy(items, fn)`                  |
| `let resolve, reject; new Promise((r, j) => {...})` | `Promise.withResolvers()`                 |
| `Promise.all(asyncIter.map(async ...))`             | `Array.fromAsync(asyncIter)`              |
| `/u` regex with set-algebra workarounds             | `/v` flag                                 |

See `/redstrike: tech-stack/javascript-modern/{groupby,promise-with-resolvers,regex}`.

#### D — ES2025 (newly-available — flag baseline; some need polyfill)

| Hand-rolled                                              | Modern swap                                          |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `new Set([...a].filter(x => b.has(x)))` etc.             | `a.intersection(b)` / `.union(b)` / `.difference(b)` |
| `Array.from(iter).map(...).filter(...)` (eager pipeline) | `iter.map(...).filter(...).toArray()` (lazy)         |
| `try { return Promise.resolve(fn()) } catch (e) {...}`   | `Promise.try(fn)` (note: not Baseline-WA yet)        |
| Manual regex source escape                               | `RegExp.escape(str)`                                 |
| Manual `try {} finally { cleanup() }` pattern            | `using x = ...` / `await using x = ...`              |

See `/redstrike: tech-stack/javascript-modern/{set-methods,iterator-helpers,promise-try}`.

#### E — Web Standards (replace polyfills / one-off utils)

| Hand-rolled                                       | Web Standards swap                                           |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `axios` / `node-fetch` / `got`                    | `fetch`                                                      |
| Manual querystring concat / regex parse           | `URL` / `URLSearchParams`                                    |
| `crypto-js` for hash/HMAC                         | `crypto.subtle.digest` / `crypto.subtle.sign`                |
| Cancelled flag for fetch abortion                 | `AbortController` (`AbortSignal.timeout`, `AbortSignal.any`) |
| `JSON.parse(JSON.stringify(obj))` deep clone      | `structuredClone(obj)`                                       |
| `Promise.resolve().then(fn)`                      | `queueMicrotask(fn)`                                         |
| Custom event-emitter class                        | `EventTarget` + `CustomEvent`                                |
| `Buffer.from(str)` / `buf.toString()` (Node-only) | `TextEncoder` / `TextDecoder` (portable)                     |

See `/redstrike: tech-stack/javascript-modern/{abort-controller,promise-combinators}`.

#### F — TypeScript modernization

| Hand-rolled                                           | Modern swap                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `as Foo` (assertion silently accepts wrong shape)     | `satisfies Foo` (narrows + verifies)                                   |
| `<T>(x: T): T` then losing literal narrowing          | `<const T>(x: T): T` (const type parameter)                            |
| Bare `string` / `number` for an ID type               | Branded type (`type UserId = string & { readonly __brand: 'UserId' }`) |
| `Pick<T, K>` / `Omit<T, K>` chains for option objects | Preserve narrowing — `satisfies` + helper, or named alias              |
| Generic helper that infers too eagerly                | `NoInfer<T>` on the inference-blocking position                        |

### Output format — Phase 2

```
## Phase 2 — Modernize proposals

### 1 — `Object.hasOwn(o, k)` instead of `hasOwnProperty.call`  [Table A · ES2022]
**Sites:**
- src/lib/util/has.ts:7
- src/lib/util/normalize.ts:14
**Baseline:** widely-available — ship freely.

### 2 — `Object.groupBy(items, fn)` instead of manual reduce  [Table C · ES2024]
**Sites:**
- src/routes/tickers/+page.svelte:88
**Baseline:** newly-available — verify Vite 8 baseline-widely-available accepts; otherwise polyfill via core-js. Note: result is a null-prototype object — strict reads only.
```

## Phase 3 — Dedup proposal

Walk the same files looking for repeated patterns. For each candidate, classify by tier using the tree below.

### Decision tree — dedup tier

```
PATTERN OBSERVED
│
├─ Matches a Runed primitive (catalog grep hits this shape)
│   └─ Even if it appears ONCE                            → TIER 1: propose Runed swap
│
├─ Custom pattern (no Runed match) repeated ≥ 2 times within scope
│   ├─ Abstraction is obvious
│   │   (clear signature, all sites use it the same way) → TIER 2: propose extraction + ASK
│   └─ Abstraction unclear
│       (signatures diverge, multiple variants)           → TIER 3: defer; flag "watch — extract at 3rd consistent occurrence"
│
└─ Single-occurrence custom code with no Runed match
    │
    ├─ Matches a Modernize quick-ref instead              → reclassify under Phase 2
    └─ Else                                                → don't propose
```

### Pre-proposal gates — verify before adding to the proposal list

After tier classification, every candidate must clear three gates. If ANY gate fails, drop the proposal and record it under "Skipped (verified)" in the final report with a one-line rationale.

```
TIER X CANDIDATE
│
├─ Gate 1 — Reactive scope at call site
│   The Runed primitive's cleanup binds to the nearest reactive root.
│   ├─ Plain `.ts` module run at app boot
│   │   (e.g. `clock-sync.ts`, app entry, global init)     → FAIL: no scope to bind
│   ├─ Server-only file
│   │   (`+server.ts`, `+page.server.ts`, `hooks.server`)  → FAIL: no client primitives
│   └─ `.svelte` / `.svelte.ts` called from component setup,
│       OR any code inside an `$effect`                     → PASS
│
├─ Gate 2 — Verify the actual target, not just the path
│   Read the cited lines. Confirm the hand-rolled pattern matches the
│   primitive's semantics — not just a surface-level keyword match.
│   ├─ "localStorage" cited but file uses `createCache` factory
│   │   (or another wrapper layer like `idb`)              → FAIL: wrong target
│   ├─ "setInterval" cited but the delay is dynamic per-tick
│   │   (`useInterval` is fixed/reactive, not per-tick)    → FAIL: shape mismatch
│   ├─ "setTimeout" cited but the pattern is asymmetric
│   │   (debounce one direction, immediate the other —
│   │    `Debounced` is symmetric and forces escape-hatch
│   │    calls at every flip site)                          → FAIL: shape mismatch
│   └─ Pattern + semantics align with the primitive         → PASS
│
└─ Gate 3 — Net-simplicity bar
    Compare LOC and cognitive complexity before vs after.
    ├─ Refactor adds lines AND doesn't simplify cognition  → FAIL: skip
    ├─ Reactive-gate polling: $effect's auto-teardown beats
    │   `useInterval(immediate: false)` + paired pause/resume  → FAIL: keep $effect
    │   (use `useInterval` only when polling is unconditional)
    └─ Refactor reduces lines OR clarifies semantics        → PASS
```

"Skipped (verified)" with a one-line rationale always beats silently churning code. The user values seeing what was considered AND why it was dropped.

### Known Runed primitive SSR caveats

Not all Runed primitives are SSR-safe by default. Some wrap their side effects in `$effect` (client-only); others register them at construction time and fire on the SvelteKit dev server's Node process. **The original `$effect(() => { if (!browser) return; setInterval/setTimeout/listener; cleanup })` pattern is universally safe** — only swap to a primitive when SSR-safety is verified AND the swap is a real net-simplicity win.

| Primitive          | SSR behavior                                                                                                                                                                                                        | Notes                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useEventListener` | SAFE — wraps `addEventListener` in `$effect`                                                                                                                                                                        | Comment in code can omit `if (!browser)` guard                                                                                                                   |
| `PersistedState`   | SAFE — `typeof window` guard internal                                                                                                                                                                               | Returns initial value during SSR                                                                                                                                 |
| `useInterval`      | **UNSAFE** — registers `setInterval` at construction; fires on dev SSR (15min/5min/now-tick timers eventually trip relative-URL fetches)                                                                            | Verified 2026-04-28. Revert to `$effect + setInterval + cleanup`; the primitive's pause/resume/counter rarely justifies the swap                                 |
| `Debounced`        | SAFE — uses Runed's `watch` internally (which wraps in `$effect`); construction reads getter once (sync, no side effect); the timer-bodied closure only assigns internal state (no user callbacks fired during SSR) | Verified 2026-04-28 by reading `runed/dist/utilities/debounced/debounced.svelte.js`. The "Search-as-you-type" pattern from the catalog is the canonical use case |

When the catalog row promises auto-cleanup, that's about **unmount cleanup**, not necessarily about **SSR gating**. Different concerns; verify both.

### Tier 1 quick-reference — patterns to scan for

| Hand-rolled pattern                                       | Runed swap                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `setTimeout`-based debounce around state                  | `Debounced` (returns reactive `.current`)                                 |
| Function-shape debounce                                   | `useDebounce`                                                             |
| Throttle                                                  | `Throttled` / `useThrottle`                                               |
| `addEventListener` + manual `removeEventListener` cleanup | `useEventListener`                                                        |
| Click-outside detection                                   | `onClickOutside`                                                          |
| Hand-rolled FSM (switch/if cascade over a tag union)      | `FiniteStateMachine`                                                      |
| Manual localStorage / sessionStorage sync                 | `PersistedState` (cross-tab built in)                                     |
| Manual `ResizeObserver`                                   | `useResizeObserver` (callback) / `ElementSize` / `ElementRect` (reactive) |
| Manual `IntersectionObserver`                             | `useIntersectionObserver` (callback) / `IsInViewport` (boolean)           |
| Manual `MutationObserver`                                 | `useMutationObserver`                                                     |
| Manual `document.visibilityState` listener                | `IsDocumentVisible`                                                       |
| Manual idle detection (mouse/keyboard timers)             | `IsIdle`                                                                  |
| Manual focus-tracking inside container                    | `IsFocusWithin`                                                           |
| Singleton `document.activeElement` access                 | `activeElement`                                                           |
| Manual previous-value tracking                            | `Previous`                                                                |
| Hand-rolled async fetcher with loading/error/abort        | `resource`                                                                |
| Explicit-deps `$effect` reading `(curr, prev)`            | `watch` (and `watch.pre` / `watchOnce`)                                   |
| Manual textarea autosize on input                         | `TextareaAutosize`                                                        |
| Hand-rolled URL-search-params binding                     | `runed/kit` → `useSearchParams`                                           |
| Pressed-keys tracker                                      | `PressedKeys`                                                             |
| RAF loop with FPS cap                                     | `AnimationFrames`                                                         |
| Setting boolean HTML attr from a value                    | `boolAttr`                                                                |

When in doubt about a primitive's exact API, escalate via `mcp__context7__query-docs` for `/svecosystem/runed` (Runed catalog rows are intentionally short — they're triage, not API reference).

### Output format — Phase 3

Proposal blocks numbered globally, continuing from Phase 2's last index:

```
## Phase 3 — Dedup proposals

### 3 — `Debounced` instead of hand-rolled debounce  [Tier 1 — Runed]
**Sites:**
- src/lib/components/search.svelte:12-28 — local `setTimeout` closure around input state
- src/lib/utils/api.ts:34-46 — duplicate setTimeout dance over `query`

**Proposed:** Replace both call sites with `new Debounced(() => query, 300)`. Sites become 2-line `.current` reads.

### 4 — `formatTiered(value, options?)` shared helper  [Tier 2 — confirm]
**Sites:**
- src/lib/components/price.svelte:8 — inline `new Intl.NumberFormat('vi-VN', …).format(v)`
- src/routes/tickers/+page.svelte:14 — same call shape

**Proposed signature:** `formatTiered(value: number, options?: { decimals?: number }): string`
**Location:** `src/lib/shared/number-format.ts` (precedent: `/redstrike: coding-prefs/tiered-number-format`)

### 5 — Watch only [Tier 3 — defer]
2 sites use a similar try/catch/log pattern but the catch payloads diverge (one includes a request id, one doesn't). Defer until a 3rd consistent instance shows up.
```

End the analysis (Phase 1 + Phase 2 + Phase 3 together) with the approval prompt:

```
Reply with:
- `[A]ll`                 → apply every Modernize + Tier 1 + every Tier 2 proposal
- comma-separated indexes → apply only those (e.g. `1,3,5`)
- `[Q]uit`                → exit cleanly; analysis is the deliverable
```

## Approval gate (hard pause)

### Decision tree — user reply

```
USER REPLY
│
├─ "[A]ll" / "all" / "a"               → apply every Modernize + Tier 1 + every Tier 2 proposal
├─ comma-separated indexes              → apply only those; skip the rest
│   • bare numbers (e.g. `5, 12, 13`)        = Phase 1 findings
│   • `Mod N` / `Modernize N` (e.g. `Mod 9`) = Phase 2 proposals
│   • `Dedup N` (e.g. `Dedup 12`)            = Phase 3 proposals
│   (Phase 1 has its own 1–N space; Phase 2 + Phase 3 share a 1–M space —
│    use phase prefix when picking from Phase 2/3 to disambiguate)
├─ "[Q]uit" / "quit" / "q" / "skip"    → exit cleanly; no edits applied; final report = analysis only
└─ ambiguous / open-ended              → re-show numbered proposal + re-prompt; do not assume intent
```

**Hard rule:** if the user `[Q]uit`s, the skill stops. Don't run autofixer, don't run code-quality. Working tree stays untouched. The analysis output is the deliverable — that has value on its own.

### Iterative re-engagement across turns

Approval is not necessarily a single reply. Real sessions often go:

```
Turn 1: /review-code src/                           → analysis (28 findings + 10 modernize + 3 dedup)
Turn 1: A                                            → R1 mass-apply
Turn N: "apply #2/#3/#5/#6/#7 with these directions" → R2 user-picked subset
Turn M: "apply all easy/safe fixes #5/#12/#13/..."  → R3 batch
Turn K: "fix #19 after all (luxury/mental-sat)"     → R4 reversal
```

The original numbered indexes from Phase 1/2/3 are the durable reference across turns. When the user re-engages, treat their reply as a fresh approval-gate input against the same numbered list — not a new review pass. The user's decision-language convention is worth preserving for traceability:

- **APPLIED via R<n>.<letter>** — fix landed in code
- **DECIDED SKIP** — analyzed, won't fix, with rationale
- **DECIDED DEFER** — won't fix now (no clean fix, blocked on upstream, etc.), with rationale
- **DECIDED NO-OP** — fact-check showed the issue isn't real or already covered elsewhere
- **DECIDED ACCEPT** — surfaced risk acknowledged as acceptable for this use case

When writing the checkpoint memo (see Final report below), use these labels so the user can scan past decisions later. Reversals are normal: a SKIP can flip to APPLIED in a later round if the user changes their mind. Don't argue against reversals — re-classify and apply.

## Phase 4 — Apply approved refactors

For each approved proposal:

1. Apply edits via the `Edit` tool. For new helper files (e.g. extracted Tier 2 utilities), use `Write`.
2. Track the set of touched paths — this drives Phases 5 and 6.

## Phase 5 — Svelte MCP autofixer (gated; mandatory per CLAUDE.md when applicable)

**Gate:** if no touched file has `.svelte` extension, skip this phase entirely and record `autofixer: skipped (no .svelte touches)` in the final report.

When at least one `.svelte` file is touched, the autofixer returns two categories — treat them differently:

- **`issues`** — hard problems (compile errors, accessibility violations, bad patterns the compiler refuses). **Always fix.**
- **`suggestions`** — advisory hints. May identify real bugs, OR may be false-positives against intentional design (e.g. an `$effect` that assigns state on purpose for a latching pattern, or an `$effect` that calls a function for imperative event dispatch — both legitimate even though the autofixer's heuristic flags them). **Inspect each one.**

```
For each touched .svelte file:
  Loop:
    invoke mcp__svelte__svelte-autofixer with the file content
    for each ISSUE       → apply the fix
    for each SUGGESTION  → inspect:
                            • if it identifies a real bug → apply the fix
                            • if it's an intentional design choice (with comment or
                              documented rationale) → document in the final report
                              as "verified false-positive: <one-line why>"
    exit loop when no ISSUES remain
    (suggestions do NOT gate exit — they're advisory)
```

**Exception — edits that are syntactically inert.** If the only changes to a `.svelte` file are added/changed `import` statements and identifier substitutions (no JSX, template, or control-flow changes), running the autofixer on the full file surfaces only pre-existing unrelated issues — those fall under the no-improvise red flag below. Document as `skipped — edits syntactically inert` in the final report; rely on `pnpm check:fast` to catch any real breakage. This applies most often when a Tier 1/2 extraction touches a large consumer file (e.g. a routes-level `+page.svelte`) that wasn't itself the focus of review.

## Phase 6 — Code quality (mandatory per CLAUDE.md)

Order: format + lint FIRST (may modify files), then type-check.

```bash
# .svelte files (touched subset only)
pnpm prettier --write <touched-svelte-paths>

# .ts / .svelte.ts / .mts files (touched subset only)
pnpm oxfmt --write <touched-ts-paths>
pnpm oxlint --fix <touched-ts-paths>

# type-check — choose by file location
pnpm check:fast            # if any touched file is under src/
pnpm check:scripts:fast    # if any touched file is under scripts/
```

If the touched set is **≥ 10 files** OR includes moves/renames, fall back to project-scope:

```bash
pnpm fmt
pnpm lint:fix
pnpm check:fast
```

Don't re-run `--check` variants (`oxfmt --check`, `prettier --check`, plain `oxlint`) after the `--write` / `--fix` form — they're terminal per CLAUDE.md (the writer's exit code IS the check's exit code).

## Final report

```
Review code — done
─────────────────────────────
Scope:        <resolved scope, e.g. "src/lib/components/" or "working tree (4 files)">
Runtime tags: WORKERD <n> · UNIVERSAL <n> · BROWSER <n> · NODE <n> · BUN <n> · DENO <n> · ANY <n>
Files seen:   <N> total (<n> .svelte, <n> .ts/.svelte.ts/.mts)

Review issues found (L1 + L2 + L3):
  Correctness:   <n>     Security: <n>    Performance: <n>    Footgun: <n>    Best-practice: <n>

Modernize:
  ES2022 (A):        <n proposed> | <n applied>
  ES2023 (B):        <n proposed> | <n applied>
  ES2024+ (C/D):     <n proposed> | <n applied>  (flagged: needs polyfill / baseline review)
  Web Standards (E): <n proposed> | <n applied>
  TypeScript (F):    <n proposed> | <n applied>

Dedup:
  Tier 1 (Runed):    <n proposed> | <n applied>
  Tier 2 (custom):   <n proposed> | <n applied> | <n skipped>
  Tier 3 (deferred): <n flagged for follow-up>

Skipped (verified): <n with one-line rationales>

Fanout:    <inline | cluster <m> subagents | cluster+dimension <m> subagents | + security specialist>
Autofixer: <clean | <n> iterations to clean | skipped (no .svelte touches) | <n> verified false-positives | <n> skipped (inert)>
Quality:   fmt ✓  lint ✓  check ✓
Working tree: <list of touched paths>

Operational follow-ups (user-side, before deploy):
  - <e.g. "wrangler secret put OPS_TOKEN" — auth gate added in R<n>.<letter>>
  - <e.g. "pnpm wrangler types" — Env binding changed; regen worker-configuration.d.ts>
  - <omit this section if none>

Next: review the diff and commit when ready.
```

If the user `[Q]uit`'d the approval gate, the report still emits — but the Modernize/Dedup rows read `0 applied`, the autofixer/quality rows read `skipped (Q)`, and the working tree row reads `unchanged`.

### Checkpoint memo for large scope

When the analysis surfaces **≥10 total proposals** (Phase 1 + Phase 2 + Phase 3 combined) AND the user is likely to re-engage across multiple turns, write a checkpoint memo to auto-memory at the end of Phase 6 (or at `[Q]uit` time):

```
<auto-memory>/project_review_code_<YYYY-MM-DD>.md
```

The memo captures: the original numbered findings (preserved indexes), each one's outcome label (APPLIED via R<n>.<letter> / DECIDED SKIP / DEFER / NO-OP / ACCEPT with rationale), a Round-by-Round outcomes table, and an operational follow-ups list. This lets the user ask "what's next on the review?" in a future turn or future session and get a precise answer against the original indexes.

Update the memo (don't write a new one) when the user re-engages with more approvals or reversals. Index the memo in `MEMORY.md` so future `/review-code` runs can supersede it cleanly.

## Red flags — never do these

- **Skip reading a file because it was reviewed earlier in the conversation.** Files can be modified, reverted, or hand-edited between runs (including `git checkout --` to test the skill). Always re-read every in-scope file from disk at the start of each run — the in-scope list drives the reads, not mental cache. Trusting recall has caused real misses (e.g. proposing dedup against a stale picture of a file the user reverted).
- **Propose a Tier 1/2 swap that fails any pre-proposal gate.** Reactive-scope mismatch, wrong target, or net-simplicity-bar failure each disqualifies a proposal — even when the surface pattern matches the Tier 1 quick-reference table. "Skipped (verified)" with rationale always beats silently churning code.
- **Apply a refactor that adds lines without simplifying.** The net-simplicity bar is a gate, not a suggestion. If the after-state has more lines AND no clearer cognition, REVERT — don't ship a regression for the sake of "using the primitive."
- **Misclassify a Modernize hint as a Phase 1 finding.** "Hand-rolled pattern X has a built-in modern equivalent Y" is a Phase 2 Modernize proposal, not a correctness/performance/footgun issue. If the only thing wrong with the code is "could use the modern method instead," it belongs in Phase 2.
- **Misclassify a Dedup hint as a Phase 1 finding.** "Hand-rolled pattern X has a Runed primitive Y" is a Phase 3 Dedup proposal, not a Phase 1 entry. If the only thing wrong with the code is "could use Runed instead," it belongs in Phase 3.
- **Fanout when in doubt.** If briefing a subagent feels under-specified or quality would degrade, fall back to inline. Quality > token savings > speed; never compromise review accuracy for fanout speed.
- `git commit` / `git add` / `git stage` / `git restore --staged` — staging and committing are out of scope. The user handles git from there.
- Apply Modernize / Tier 2 / Tier 3 proposals without explicit user approval. Approval = `[A]ll` or specific indexes; `[Q]uit` and ambiguous replies are NOT approval.
- Skip the autofixer when `.svelte` files are touched — Svelte MCP autofixer is mandatory per CLAUDE.md when Svelte code is written or edited; loop until zero issues (suggestions are advisory and may legitimately remain when verified false-positive).
- Skip code-quality — `pnpm fmt` / `lint:fix` / `check:fast` are mandatory per CLAUDE.md after edits.
- Re-run `--check` variants after `--write` / `--fix` — wasted work; the writers are terminal.
- Edit files outside the resolved scope — improvising additional changes mid-execute is forbidden; surface as a follow-up.
- Read `docs/.cache/svelte.dev/llms-full.txt` in full — always Grep with targeted patterns.
- **Skip the cloudflare plugin precondition** when scope contains WORKERD or product-subtagged files. CF rules drift; the canonical source is each `cloudflare:*/references/rules.md` (or cloudflare-docs MCP / WebFetch fallback). The precondition is hard — see Preconditions item 4 for the why.
- **Hand-write Cloudflare best-practices from memory** instead of resolving via the chain (project plugin → personal plugin → cloudflare-docs MCP → WebFetch). Memory is for orientation, not authority. Verify before flagging.
- Use `mcp__svelte__playground-link` — out of scope; CLAUDE.md says don't call it when code is in the user's project.

## Done when

- [ ] Preconditions passed
- [ ] Scope resolved; per-file runtime tagged + CF product subtag where WORKERD; fanout strategy chosen; reference docs primed when applicable
- [ ] If WORKERD or CF product subtag in scope: cloudflare reference resolved via the chain (project plugin → personal plugin → cloudflare-docs MCP → WebFetch); rules from the matching `cloudflare:*/references/rules.md` consulted before flagging
- [ ] Phase 1 review produced (or "no issues found" stated) — findings tagged L1/L2/L3 + runtime
- [ ] Phase 2 modernize proposals produced (or "no candidates" stated)
- [ ] Phase 3 dedup proposals produced (or "no candidates" stated)
- [ ] User approved (`[A]ll` / indexes) or `[Q]uit`
- [ ] If approved: refactors applied; autofixer issues clear when `.svelte` touched (suggestions inspected and documented); code-quality green
- [ ] Final report delivered with fanout + runtime breakdown
- [ ] If ≥10 total proposals (Phase 1 + Phase 2 + Phase 3): checkpoint memo written/updated at `<auto-memory>/project_review_code_<YYYY-MM-DD>.md` with outcome label per finding (APPLIED via R<n>.<letter> / DECIDED SKIP / DEFER / NO-OP / ACCEPT) and indexed in `MEMORY.md`
- [ ] Working tree in expected state; no stage/commit operations performed
