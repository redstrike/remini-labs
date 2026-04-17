# Design System — Remini Labs

## Product Context

- **Brand:** Remini Labs — experimental mini-apps by redstrike (Tung Nguyen)
- **What this is:** Collection of personal everyday tools as mini-apps
- **Who it's for:** Personal use, everyday tools
- **Project type:** Dark-themed, mobile-first, OLED-optimized; each mini-app is its own "room" with distinct atmosphere
- **Mini-apps:** Tickers (gold/silver, crypto, VN stock index charts), Weather (local weather with atmospheric UI)

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian with a touch of Luxury
- **Decoration level:** Minimal — typography and data density do the work
- **Mood:** A well-made instrument panel. Weighty, precise, not flashy.
- **Reference sites:** TradingView (data density), CoinGecko (clean tables)

## Architecture

The design system has two layers:

- **Shell** (this document) — neutral defaults: tokens, typography, motion, layout primitives, branding chrome.
- **Mini-app rooms** — each `src/routes/<app>/` owns its visual identity. Per-app design lives in `docs/mini-apps/<app>/DESIGN.md`; per-app data architecture in `docs/mini-apps/<app>/ARCHITECTURE.md`.

Mini-apps inherit shell defaults by default. They may override semantic tokens or add app-only tokens inside their `@scope`-equivalent boundary (`.<app>-root` class on the mini-app's `+layout.svelte` wrapper).

When the same pattern surfaces in two mini-apps, it graduates into the shell.

## Design Tokens

Two-tier token system, namespaced `--rl-*`, declared in `src/app.css`. Components consume tokens via `var(--rl-*)` in scoped styles. Mini-apps rebind semantic tokens inside their `.<app>-root` wrapper — shell propagation flows through CSS variable inheritance, no `@layer` ceremony required.

A bridge block remaps shadcn-svelte's primitive tokens (`--background`, `--foreground`, `--border`, etc.) onto our `--rl-*` semantics, so shell components (sidebar, buttons, header) automatically adopt our palette through standard `bg-background`/`text-muted-foreground` Tailwind utilities.

### Color tokens

**Primitive ramp** — Tailwind neutral, OLED-optimized, cataract-friendly mid-tones:

| Token                 | Value     | Notes                                         |
| --------------------- | --------- | --------------------------------------------- |
| `--rl-color-gray-950` | `#0a0a0a` | Page bg — near-true-black, OLED power-optimal |
| `--rl-color-gray-900` | `#171717` | Surface lift                                  |
| `--rl-color-gray-800` | `#262626` | Surface raised, hover                         |
| `--rl-color-gray-700` | `#404040` | Border                                        |
| `--rl-color-gray-600` | `#525252` | Border strong                                 |
| `--rl-color-gray-500` | `#737373` | Faint text floor (≥4.7:1 on bg)               |
| `--rl-color-gray-400` | `#a3a3a3` | Subtle text                                   |
| `--rl-color-gray-300` | `#d4d4d4` | Muted text                                    |
| `--rl-color-gray-200` | `#e5e5e5` | Secondary text                                |
| `--rl-color-gray-100` | `#f5f5f5` | Primary text — neutral off-white              |
| `--rl-color-gray-50`  | `#fafafa` | Highest emphasis, rare                        |

**Semantic surfaces** (rebind point for mini-apps):

| Token                       | Default                    | Purpose               |
| --------------------------- | -------------------------- | --------------------- |
| `--rl-color-bg`             | `var(--rl-color-gray-950)` | Page background       |
| `--rl-color-surface`        | `var(--rl-color-gray-900)` | Card surface          |
| `--rl-color-surface-raised` | `var(--rl-color-gray-800)` | Hover, raised surface |
| `--rl-color-border`         | `var(--rl-color-gray-700)` | Standard borders      |
| `--rl-color-border-strong`  | `var(--rl-color-gray-600)` | Emphasized borders    |

**Text tiers** — 5 levels, all WCAG AA+ contrast on `--rl-color-bg`, ~15% luminance steps:

| Token                       | Default    | Contrast | Use                            |
| --------------------------- | ---------- | -------- | ------------------------------ |
| `--rl-color-text`           | `gray-100` | ~16:1    | Primary, headings, prices      |
| `--rl-color-text-secondary` | `gray-200` | ~12:1    | Strong labels                  |
| `--rl-color-text-muted`     | `gray-300` | ~9:1     | Helpers                        |
| `--rl-color-text-subtle`    | `gray-400` | ~6:1     | Metadata, captions             |
| `--rl-color-text-faint`     | `gray-500` | ~4.7:1   | Lowest priority, just-readable |

**Status semantics** (cross-cutting):

| Token                | Value     | Variant                                          |
| -------------------- | --------- | ------------------------------------------------ |
| `--rl-color-success` | `#2d9f6f` | `--rl-color-success-bg` = `rgba(45,159,111,0.1)` |
| `--rl-color-warning` | `#d4874d` | `--rl-color-warning-bg` = `rgba(212,135,77,0.1)` |
| `--rl-color-danger`  | `#c44e4e` | `--rl-color-danger-bg` = `rgba(196,78,78,0.1)`   |

**Data freshness states** — used by shared `FreshnessDot` component:

| Token                    | Value     | Pulse        |
| ------------------------ | --------- | ------------ |
| `--rl-color-state-fresh` | `#34d399` | 3s (green)   |
| `--rl-color-state-good`  | `#f0c850` | 2s (yellow)  |
| `--rl-color-state-aging` | `#e8993a` | 1.5s (amber) |
| `--rl-color-state-stale` | `#ef4444` | 0.75s (red)  |

### Spacing

T-shirt scale, 4px base unit. Token: `var(--rl-space-*)`. **Stored as rem** so the mobile density shrink (below) cascades through every spacing consumer.

`0(0) 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)` — px-equivalents at 16px desktop base.

Off-scale values (5, 6, 10, 12, 13, 20, 22, 28) stay inline as one-offs — they don't earn token slots until they recur across the project.

### Radius

`--rl-radius-sm: 0.25rem` (chips, badges) · `md: 0.375rem` (buttons) · `lg: 0.75rem` (cards) · `full: 9999px` (dots, pills — stays px as a sentinel).

### Mobile density (≤720px)

`html { font-size: 14px }` — drops the root from 16 to 14. Every rem-based token (spacing, radius, text, shadcn component sizes) shrinks ~12.5% in one step. Desktop unchanged. One knob; no per-component overrides needed.

### Typography

- **Display / prices:** `var(--rl-font-mono)` = `'Geist Mono', 'GeistMono', monospace` — tabular-nums
- **Body / labels:** `var(--rl-font-sans)` = `'Geist', 'Geist Sans', system-ui, sans-serif`
- **Loading:** Google Fonts CDN (`fonts.googleapis.com`)

**Size scale** — t-shirt, covers 10–32px:

`--rl-text-2xs(10) xs(11) sm(12) base(14) md(16) lg(18) xl(20) 2xl(24) 3xl(32)` — px-equivalents at 16px desktop base; stored as rem.

Sub-10px (8, 9) stays inline — too rare to standardize. Per-role size assignments (e.g. "crypto price", "metal price") live in per-mini-app DESIGN files.

**Weight scale:** `--rl-font-normal(400) medium(500) semibold(600) bold(700)`

### Motion

**Duration** (named, semantic intent):

`--rl-duration-micro(75ms) short(150ms) medium(250ms) long(400ms)`

**Easing** (semantic intent — describe what the motion _does_, not the bezier mechanics):

| Token              | Curve                          | Use                             |
| ------------------ | ------------------------------ | ------------------------------- |
| `--rl-ease-enter`  | `cubic-bezier(0, 0, 0.2, 1)`   | Element entering view           |
| `--rl-ease-exit`   | `cubic-bezier(0.4, 0, 1, 1)`   | Element leaving view            |
| `--rl-ease-move`   | `cubic-bezier(0.4, 0, 0.2, 1)` | Hover, color, position changes  |
| `--rl-ease-linear` | `linear`                       | Mechanical (spinners, progress) |

### Breakpoints

Phone 360px (mobile minimum) · Tablet 720px · Desktop 1024px. Legacy 320px is **not supported**. Used in both `@media` and `@container` queries via `var(--rl-breakpoint-*)`.

### Z-index

Named tiers prevent number drift: `--rl-z-base(0) raised(10) dropdown(20) sticky(30) overlay(40) modal(50) toast(60)`

### Shadow

`--rl-shadow-sm/md/lg/xl` — restrained, OLED-friendly (dark surfaces don't need much elevation cue).

## Layout

- **Approach:** Grid-disciplined — strict card stacking, predictable alignment.
- **Mini-app max-width:** per app (tickers caps at 860px; weather scales differently — see per-app docs).

## App Shell / Branding

- **Brand name:** Remini Labs
- **Page title:** `{AppName} — Remini Labs` (e.g., "Tickers — Remini Labs")
- **Meta description:** Includes AI tools used (Claude Code, Antigravity), mini-app names
- **Sidebar header:** Favicon (20px) + "Remini Labs" (text-sm, font-semibold, tracking-tight), links to home
- **Sidebar footer:** `Crafted with ❤️ ☕ and 🤖 by redstrike` (13px mobile / 12px desktop, whitespace-nowrap)
- **Header breadcrumb:** `Remini Labs › {AppName}` on all screens, brand links to home
- **Home link behavior:** When already on home, clicking brand/home collapses sidebar instead of navigating
- **Mini-app rooms:** Each mini-app has its own background/atmosphere via `.<app>-root` token rebinds — distinct from the default shell bg

## Theming

- **Mode:** Dark-only today. Token structure (primitive ramp + semantic layer) is designed to support a future light mode by adding a `[data-theme="light"]` block that rebinds semantics — primitives don't change.
- **No JS theming logic exists yet.** When light mode lands, prefer `light-dark()` or a `data-theme` attribute on `<html>` over runtime class toggles.

## Decisions Log

| Date       | Decision                                      | Rationale                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-31 | Initial design system created                 | /design-consultation based on competitive research (TradingView, CoinGecko, crypto dashboards)                                                                                                                                                                                                                                            |
| 2026-03-31 | Geist + Geist Mono over Inter/Roboto          | Crisper rendering, superior mono pairing, not overused in financial space                                                                                                                                                                                                                                                                 |
| 2026-03-31 | Muted gold/silver accents over neon           | Asset-class-tied colors. Physical metals, not crypto speculation                                                                                                                                                                                                                                                                          |
| 2026-03-31 | Warm near-black over pure #000                | Easier on eyes for morning use. Feels crafted, not default dark mode                                                                                                                                                                                                                                                                      |
| 2026-04-01 | Google Fonts CDN over jsdelivr                | jsdelivr doesn't host Geist package; Google Fonts is reliable                                                                                                                                                                                                                                                                             |
| 2026-04-01 | 860px max-width with responsive grid          | Two-column card layout on tablet+, single column on mobile (tickers)                                                                                                                                                                                                                                                                      |
| 2026-04-01 | Time-based freshness with 4 states            | FreshnessDot: green/gold/amber/red based on elapsed vs TTL. Battery-like HP drain metaphor                                                                                                                                                                                                                                                |
| 2026-04-03 | Each mini-app is its own "room"               | Distinct atmosphere per app; navigating feels like entering a new space                                                                                                                                                                                                                                                                   |
| 2026-04-03 | Rebrand to "Remini Labs"                      | Umbrella brand for all mini-apps, consistent in titles, sidebar, meta                                                                                                                                                                                                                                                                     |
| 2026-04-03 | Sidebar brand in Header slot + breadcrumb nav | Brand at top of sidebar, header shows "Remini Labs › Tickers" on all screens                                                                                                                                                                                                                                                              |
| 2026-04-03 | Home links collapse sidebar when on home      | Avoids unnecessary navigation; improves mobile UX                                                                                                                                                                                                                                                                                         |
| 2026-04-03 | Bumped text colors                            | Improved readability on dark backgrounds without losing visual hierarchy                                                                                                                                                                                                                                                                  |
| 2026-04-14 | NOW_TICK_MS = 6s (10 updates/min)             | Animation interval math: 2× longest pulse (3s fresh), above 20upm perceptual floor. Cross-browser research confirmed 1s-6s safe for mobile battery                                                                                                                                                                                        |
| 2026-04-14 | FreshnessDot debug prop                       | Optional inline text showing elapsed/ttl/percentage/countdown. Zero-cost when off                                                                                                                                                                                                                                                         |
| 2026-04-16 | Two-tier token system + shell/mini-app split  | Namespace `--rl-*`, primitive→semantic, OLED-optimized warm-near-black bg (`#08080c`), 5 text tiers (cataract-friendly mid-tones), shadcn bridge for shell utility classes. Shell DESIGN.md becomes neutral; mini-app design moves to `docs/mini-apps/<app>/`. Mini-app data architecture moves to `docs/mini-apps/<app>/ARCHITECTURE.md` |
