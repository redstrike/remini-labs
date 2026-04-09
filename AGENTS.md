## Commands

```bash
pnpm preview:cf       # Wrangler local preview (Cloudflare Workers runtime)
pnpm deploy:cf        # Deploy to Cloudflare Workers
pnpm check            # svelte-kit sync + svelte-check
pnpm check:scripts    # tsc --noEmit for scripts/*.mts
pnpm fmt              # oxfmt + prettier (Svelte)
pnpm lint             # oxlint
pnpm test:e2e         # Playwright
pnpm docs:fetch <url> # cache external docs to docs/.cache/
```

Always run `pnpm fmt` and `pnpm lint` after coding tasks, before presenting work.

## Stack

SvelteKit 2 + Svelte 5 (runes) · TypeScript · Tailwind 4 · shadcn-svelte · Cloudflare Workers (adapter-cloudflare) · pnpm · oxlint/oxfmt · Playwright. Monorepo of experimental mini-apps under `src/routes/<app>/` (currently: `weather`, `tickers`). See `DESIGN.md` for visual system.

## Dev server

Maintain a background dev server on **port 5173** for fast feedback on warnings and runtime errors. The command is always `pnpm dev --host` (the `--host` flag exposes the server on the LAN so the user can test on real phones/tablets).

**On session start / before needing the dev server:**

1. Check if port 5173 is in use.
2. **If free** → start `pnpm dev --host` in the background. Done.
3. **If occupied by your own prior background shell** → reuse it. Done.
4. **If occupied by an unknown process** → ASK the user before killing:
   - User approves → force-kill any process on ports **5173–5179**, then start `pnpm dev --host` in background.
   - User declines → **do nothing.** Do not start a second server, do not switch ports. Another agent session may own it; leave it alone.

Never kill port-5173 processes without explicit user approval in the current turn.

## Docs lookup strategy (latency-optimized)

**Scope:** this section applies ONLY to **documentation retrieval** (reading docs, reference material, API references). It does NOT affect non-docs tools — autofixers, code analyzers, browser automators, generators, etc. remain primary tools for their own jobs regardless of how docs are fetched.

For documentation lookups about Svelte/SvelteKit, shadcn-svelte, or any external library, **try the local cache first**, then a docs-retrieval MCP tool if one exists and the cache misses, then the web. The goal is zero network latency per doc lookup.

### Order of preference (DOCS LOOKUPS ONLY)

1. **Local cache first** — `docs/.cache/<host>/<pathname>` via Grep / Read. Zero network hops.
2. **MCP docs-retrieval tool second** — any MCP tool whose purpose is to fetch documentation text (e.g. `svelte__get-documentation`, `svelte__list-sections`, or similar tools from other MCP servers that may be available). Use when the cache misses or when you need the freshest version of a specific section.
3. **Web fetch last** — only if steps 1 and 2 fail or the content isn't documentation.

### Currently cached bulk references

- **Svelte + SvelteKit full docs:** `docs/.cache/svelte.dev/llms-full.txt` (~1.1 MB, single file containing the entire site). Grep it with targeted patterns instead of reading it whole. This replaces MCP round-trips for common lookups.
- **shadcn-svelte:** `docs/.cache/shadcn-svelte.com/llms.txt` (index) + any per-component pages cached on demand.

### How to use the cache

- **For a known concept/API** (e.g. `$derived`, `bind:this`, `load function`, `adapter-cloudflare`):
  ```
  Grep pattern="$derived" path="docs/.cache/svelte.dev/llms-full.txt" -C 20
  ```
  Faster than any remote call. Use `-C` context to read surrounding explanation.

- **For a specific file in a multi-file source** (e.g. shadcn-svelte per-component):
  1. Read the index: `docs/.cache/shadcn-svelte.com/llms.txt`
  2. Pick the URL of the page you need from the index
  3. Fetch and cache it: `pnpm docs:fetch <url>`
  4. Read the cached file locally

### Fetching new docs into the cache

```bash
pnpm docs:fetch <url> [<url>...]        # fetch any LLM-friendly markdown URL
pnpm docs:fetch <url> --force           # bypass 7-day TTL
```

The cache path is derived mechanically from `url.host` + `url.pathname`:
```
https://svelte.dev/llms-full.txt              → docs/.cache/svelte.dev/llms-full.txt
https://shadcn-svelte.com/docs/components/button.md
                                              → docs/.cache/shadcn-svelte.com/docs/components/button.md
```

`docs/.cache/` is gitignored — it's a pure local cache. Cache-on-use only; never bulk-download. Shared 7-day TTL via file `mtime`.

Script: `scripts/fetch-docs.mts`.

## MCP servers

MCP servers may be configured at project scope (`.mcp.json`) or inherited from user scope. Treat them as first-class tools and use them per their documented purpose. The docs-cache rule in the previous section affects ONLY documentation-retrieval tools; everything else — analyzers, generators, automators, playground creators — is unaffected and remains primary for its own job.

### Project-scope MCP servers

Listed in `.mcp.json` at repo root. Currently configured:

**Svelte MCP** — provides both documentation retrieval and code analysis.
- **`svelte-autofixer` — MANDATORY for Svelte code.** Analyzes *your* code against the Svelte compiler and returns issues/suggestions. You MUST run it whenever writing Svelte code, before sending it to the user. Keep calling it until no issues or suggestions are returned. The local docs cache does NOT replace this — autofixer analyzes code, not docs.
- **`playground-link`** — generates a Svelte Playground link with the provided code. Only call after user confirmation, and NEVER if code was written to files in their project.
- **`get-documentation` / `list-sections`** — docs-retrieval tools. Fall under the "Docs lookup strategy" rule above: cache first (`docs/.cache/svelte.dev/llms-full.txt`), then these as fallback when the cached file doesn't surface what you need.

### Browser automation: chrome-devtools (default) vs playwright (E2E only)

Both `chrome-devtools` and `playwright` MCP servers are configured. **`chrome-devtools` is the default** — it mirrors how a human developer actually works in the browser (open DevTools, inspect, click around, read the network tab). **`playwright` is reserved for E2E test authoring and headless test-suite runs.** Do not call both for the same job.

**Decision tree — start here:**

1. **Are you authoring or running an E2E test?** (writing a `.spec.ts` under `tests/` or `e2e/`, running the existing Playwright suite, generating a regression test from a repro)
   → **Use `playwright`.** It matches the project's `@playwright/test` setup and produces tests that can be checked in.

2. **Anything else** — interactive debugging, dogfooding the dev server, QA sweeps, visual checks, network/console inspection, performance profiling, Lighthouse audits, hydration debugging, "does this button work", "why is this slow", "what does this look like at 360px"
   → **Use `chrome-devtools`.** It is the general-purpose browser tool. It mirrors the human developer workflow: navigate, click, inspect, snapshot, evaluate JS, read the network tab, take a perf trace.

**Why this ordering:**

- `chrome-devtools` exposes the full DevTools protocol — performance traces, network waterfall, console messages, memory snapshots, Lighthouse — none of which `playwright` exposes natively. For most ad-hoc work this is what you actually want.
- `playwright`'s value is its **stable locator model** and integration with the existing test runner. That value only pays off when the output is a checked-in test. For one-off interactive work, it is overkill.
- A human developer reaches for DevTools first and writes a Playwright test second. The agent should mirror that.

**Hard rules:**

- **Default to `chrome-devtools`.** Only switch to `playwright` when the task is explicitly "write/run an E2E test."
- **Never run both browsers in parallel for the same investigation.** Pick one, finish, close it. Two headless Chromes at once on this machine will fight for ports and confuse the tool list.
- **Both tools target the dev server on `https://localhost:5173`** (see Dev server section). Make sure it's running before navigating.
- **For interactive QA flows that find a bug worth regression-testing**: investigate with `chrome-devtools`, then write the repro as a `playwright` E2E test as a final step. Do not flip back and forth mid-investigation.

**Microsoft Learn MCP** (`microsoft-learn`) — remote Microsoft docs server providing `microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch`. High-quality, current, diagram-rich reference content. Treat it as a peer to `context7` for the topics it covers well.

**Reach for Microsoft Learn when the question is about:**

- **Cloud architecture & distributed systems** — Azure Architecture Center, Well-Architected Framework, reference architectures, multi-region patterns, CAP tradeoffs, capacity planning
- **Reliability & resilience patterns** — retry/backoff, circuit breaker, bulkhead, idempotency, saga, outbox, compensating transactions
- **Caching, queueing, eventing** — cache-aside, write-through, message broker patterns, event sourcing, CQRS, dead-letter handling
- **Identity & security** — OAuth/OIDC flows, token lifetimes, RBAC vs ABAC, secret rotation, zero-trust, threat modeling (STRIDE)
- **Observability concepts** — three pillars, SLO/SLI design, structured logging, distributed tracing
- **.NET / C# / ASP.NET Core / Microsoft Orleans / EF Core** — the user works in .NET outside this project. Comparative or cross-stack questions ("how does X work in Orleans?", ".NET equivalent of Y?", new .NET / Azure SDK / preview features potentially newer than your training data) → Microsoft Learn is the primary source. Use `microsoft_code_sample_search` for snippets.

**Do NOT reach for it when:**

- The question is about Svelte, SvelteKit, Tailwind, shadcn-svelte, TypeScript language semantics, Node, pnpm, or Vite — those have better dedicated sources (`docs/.cache/`, svelte MCP, context7).
- The question is about Cloudflare specifically — prefer `cloudflare-observability` MCP and Cloudflare's own docs; Microsoft Learn answers will be Azure-flavored.

**Priority among docs sources** (extends the global "Order of preference" list above):

1. Local `docs/.cache/` if relevant
2. **Microsoft Learn MCP and `context7` are co-equal** — pick by domain:
   - Cloud architecture / .NET / distributed-systems concepts → Microsoft Learn
   - JS/TS library API, npm package usage → context7
3. Web fetch — last resort

### User-scope or future project-scope MCP servers

Other MCP servers may be available in your session without being listed here. Use them for their documented purpose. The classification rule still applies:

- **If the tool retrieves documentation text** → cache-first per the Docs lookup strategy section
- **If the tool does something else** (code analysis, browser automation, design-to-code, DB queries, search, etc.) → use it directly; the docs cache is irrelevant

Do not refuse to use an MCP tool just because it's not listed in `.mcp.json`. Do not assume an MCP tool exists unless it's actually surfaced in your session.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

### Project workflow skills (gstack-style, short slash-commands)

- Product ideas, "is this worth building", startup-style brainstorm → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

### Superpowers process skills (rigorous multi-step workflows)

These skills encode disciplined processes. Invoke them BEFORE touching code or tools for tasks that fit their trigger.

- **Any creative/build work** — "let's build X", "add this feature", "refactor Y" — invoke `superpowers:brainstorming` FIRST to explore intent and requirements before jumping to implementation
- **Bugs, test failures, unexpected behavior** — invoke `superpowers:systematic-debugging` for phased root-cause investigation (use alongside or instead of `investigate` when the bug is non-trivial)
- **Multi-step tasks with a spec or requirements** — invoke `superpowers:writing-plans` BEFORE touching code to produce a written implementation plan
- **Executing an existing written plan** — invoke `superpowers:executing-plans` (or `superpowers:subagent-driven-development` if tasks are independent and parallelizable)
- **Features and bugfixes that deserve tests** — invoke `superpowers:test-driven-development` before writing implementation
- **Before claiming work is "done" / "fixed" / "passing"** — invoke `superpowers:verification-before-completion` to run actual verification commands and show evidence
- **2+ independent research or exploration tasks that can run in parallel** — invoke `superpowers:dispatching-parallel-agents` to fan out to subagents
- **Starting feature work that needs isolation from current workspace** — invoke `superpowers:using-git-worktrees`
- **Implementation complete, deciding how to integrate** — invoke `superpowers:finishing-a-development-branch`
- **Receiving code review feedback** — invoke `superpowers:receiving-code-review` before implementing suggestions
- **Requesting code review on completed work** — invoke `superpowers:requesting-code-review`

### Routing precedence

When both a gstack-style skill and a superpowers skill could apply:

- Prefer **superpowers** when the task is multi-step, needs planning, or benefits from a disciplined process (e.g. `superpowers:systematic-debugging` over `investigate` for a mysterious bug where root cause isn't obvious)
- Prefer **gstack-style** when the task is a specific, well-defined operation with a known output (e.g. `ship` over generic plan-execute for "create a PR", or `review` over `superpowers:requesting-code-review` for a quick diff check)
- If unclear, ask the user which they prefer for this task

### User-invocable slash commands

If the user types `/<name>` (e.g. `/commit`, `/ship`, `/review-pr`), they are invoking that specific skill by name. Use the Skill tool with that exact name. Do not second-guess the routing when the user is explicit.

## Task delegation & parallelism

The principles below frame the director's mindset; the operational subsections (*When to delegate*, *Briefing subagents*, *Latency mechanisms*, *Synthesis*) translate them into action. Read both — principles alone are too abstract to act on, and rules alone drift toward cargo-culting.

**If a skill is already active in the current turn** (a `superpowers:*` workflow, a `/skill-name` invocation, or any other skill expanded into context), follow that skill's process — it has the priority. The rules below are the project's standalone defaults: they apply when no skill has framed the task, and they should never contradict an active skill. Where an active skill leaves a gap, fall back to these defaults.

### Core principles (the director's playbook)

1. **You are the director/commander.** Your job is to understand intent, classify the task, decompose it, dispatch units to the right execution surface (yourself, parallel tools, subagents, background tasks), and synthesize the result. You are accountable for what the user reads. Never hand the user a raw subagent report and never write "based on the findings, do X" — read, understand, then act.
2. **Classify before dispatching.** Every non-trivial request gets a triage pass *before* any tool call: known target or open-ended? one unit or many independent units? short or long-running? high-stakes? The right execution surface follows from the answer. If you cannot say what a subagent will return and how you will use it, the brief is not ready.
3. **Fast by default; correctness is the gate.** Deliver results as quickly as possible — analyze the task, pick the execution mode that maximizes throughput (parallelism, background tasks, subagents, the right specialist), and ship. Correctness, accuracy, and groundedness are the non-negotiable floor: never let a faster path compromise them. A fast wrong answer is a regression, not a win.
4. **Parallelism is the default for independent work.** When two or more units have no data dependency between them, run them concurrently — multiple tool calls in one message, multiple `Agent` calls in one message. Sequential dispatch of independent work is a bug.
5. **Background long-runners; never block the main loop on waiting.** Builds, test runs, large fetches, broad audits — push them to background bash or background subagents, keep working, and read results only when the next step actually needs them. Idle main-loop time is wasted user time.
6. **Cross-check high-stakes work with an independent subagent.** For security-sensitive changes, ambiguous requirements, or decisions with multiple plausible answers, spawn a reviewer in parallel with your own analysis and compare. Disagreement is the most valuable signal — investigate the conflict; do not pick a winner arbitrarily.
7. **Brief subagents like colleagues who just walked in; pick the most specific one available.** Subagents have zero conversation history — self-contained prompts only (role, prior knowledge, exact targets, relevant tools/skills, expected output shape and length). Specialized beats generic every time: `Explore` over `general-purpose`, `cache-layer-auditor` over `code-reviewer`, project doc cache over web fetch.

### When to delegate (vs. handle in your own loop)

- **Known target, bounded edit** — handle yourself. Spawning a subagent for a one-line edit costs more than the work.
- **Open-ended exploration, large reads, broad audits** — delegate to a subagent. Subagents have their own context window; the bytes they read do not pollute yours.
- **Two or more independent units of work** — run them in parallel (multiple tool calls in one message, or multiple `Agent` calls in one message).
- **Long-running command with other useful work to do** — background it, continue working, read output only when you actually need it.
- **Ambiguous or high-stakes decision** — spawn a reviewer subagent (specialized: `code-reviewer`, `cache-layer-auditor`, `design-conformance-reviewer`) in parallel with your own analysis, then compare.

### Briefing subagents (this is the part that fails most often)

Subagents start with **zero conversation context**. A terse prompt produces shallow work. Every brief must contain:

1. **Role and goal** — "you are a [type] reviewing [thing] to answer [question]". State the role explicitly even when it seems obvious.
2. **What is already known or ruled out** — so the subagent does not redo work you have already done.
3. **Exact targets** — file paths, symbols, URLs, line ranges. Do not make the subagent guess what to look at.
4. **Relevant tools, skills, and references** — name the specific skill, MCP tool, project memory, or doc-cache path it should use. Do not assume it will discover them. Examples: "run `mcp__svelte__svelte-autofixer` after editing", "consult `docs/.cache/svelte.dev/llms-full.txt` first", "this falls under the `cache-layer-auditor` rules in `src/lib/utils/cache.ts`".
5. **Expected output shape and length** — "punch list under 200 words", "file paths only", "yes/no plus one sentence". Unbounded output wastes your context on the relay.

### Latency mechanisms

The four concrete primitives. Match each to the relevant trigger in *When to delegate* above; do not re-derive when to use them.

- **Parallel tool calls** — multiple tool uses in a single assistant message.
- **Background bash** — `Bash` with `run_in_background: true`. Read output via `BashOutput` only when you actually need it.
- **Background subagent** — `Agent` with `run_in_background: true`. Use when you have independent main-loop work to do; foreground when the next step needs the result.
- **Worktree isolation** — `Agent` with `isolation: "worktree"` when a subagent might write files you do not yet want in the working tree.

### Synthesis

- **Subagent output is invisible to the user.** Relay findings in your own words; never paste full reports.
- **Follow-ups must cite concrete file paths and line numbers** — never phrases like "based on the findings, do X". (Principle 1 in operational form.)
- **Cross-check disagreement is the highest-value subagent output.** Treat it as a finding to investigate, not a vote to tally.

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
