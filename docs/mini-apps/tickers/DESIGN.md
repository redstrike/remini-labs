# Tickers — Design

App-specific design for the Tickers mini-app. For shell defaults (color tokens, typography, motion, layout primitives), see the root `DESIGN.md`.

## Identity

- **Purpose:** Personal portfolio glance — gold/silver, major crypto, VN stock index, plus a personalized watchlist (up to 10 crypto + 10 stock tickers).
- **Mood:** TradingView-density meets CoinGecko-clean. Weighty, precise, not flashy.
- **Reference sites:** TradingView (data density), CoinGecko (clean tables), Phu Quy (anti-pattern: cluttered SPA).
- **Room background:** Inherits shell `--rl-color-bg`. No mini-app override.

## Tokens — tickers extensions

Declared in `src/routes/tickers/tickers.css`, applied to `.tickers-root` (set by `+layout.svelte`). Visible only to descendants via CSS variable inheritance.

### Asset accents

| Token                     | Value     | Asset                                          |
| ------------------------- | --------- | ---------------------------------------------- |
| `--rl-color-asset-gold`   | `#d4a03a` | SJC gold — rich gold, tied to XAU              |
| `--rl-color-asset-silver` | `#a0a8b8` | PQ silver — lighter metallic, tied to XAG      |
| `--rl-color-asset-btc`    | `#e8993a` | Bitcoin — bright orange, closer to brand       |
| `--rl-color-asset-eth`    | `#5b80e8` | Ethereum — brighter blue, closer to brand      |
| `--rl-color-asset-sol`    | `#a566cf` | Solana — brighter violet, closer to brand      |
| `--rl-color-asset-vn100`  | `#b87333` | VN100 — antique bronze (bull statue aesthetic) |

### Directional semantics

Western convention across **all** asset classes (crypto, metals, stocks). VN broker UIs offer inverted red=up as a user preference; we stick with Western for cross-asset consistency.

| Token               | Value     | Use                              |
| ------------------- | --------- | -------------------------------- |
| `--rl-color-up`     | `#2d9f6f` | Price up, gain (muted green)     |
| `--rl-color-down`   | `#c44e4e` | Price down, loss (muted red)     |
| `--rl-color-spread` | `#d4874d` | Range hi/lo markers (warm amber) |

### Tickers surfaces

| Token                 | Value     | Notes                                                                     |
| --------------------- | --------- | ------------------------------------------------------------------------- |
| `--rl-color-chart-bg` | `#121218` | Chart section background — slightly darker than card surface for contrast |

## Typography roles

Specific size/weight assignments per data role. References the shell text scale.

| Role               | Family | Size                   | Weight                 | Tracking                         |
| ------------------ | ------ | ---------------------- | ---------------------- | -------------------------------- |
| Crypto price       | mono   | 20px (`--rl-text-xl`)  | 700 (`--rl-font-bold`) | —                                |
| Metal price        | mono   | 16px (`--rl-text-md`)  | 700                    | -0.3px                           |
| Period change      | mono   | 18px (`--rl-text-lg`)  | 700                    | -0.5px                           |
| VN index value     | mono   | 16px (`--rl-text-md`)  | 700                    | — (2 decimals, "PTS" unit label) |
| Metal 24H / range  | mono   | 12px (`--rl-text-sm`)  | 600                    | —                                |
| OHLC values        | mono   | 11px (`--rl-text-xs`)  | 600                    | —                                |
| Chart axis         | mono   | 10px (`--rl-text-2xs`) | —                      | —                                |
| Card label         | sans   | 12px (`--rl-text-sm`)  | 600                    | 0.3px / uppercase                |
| Metal table label  | sans   | 10px (`--rl-text-2xs`) | 500                    | 0.5px / uppercase                |
| Card status        | sans   | 11px (`--rl-text-xs`)  | 500                    | —                                |
| Peak/bottom marker | mono   | 9px                    | 600                    | —                                |

## Layout

- **Max content width:** 860px (responsive: single column on mobile, two-column cards at 640px+)
- **Card padding:** 20px (off-scale exception — tickers convention)
- **Card gap:** `--rl-space-md` (16px)
- **Cards grid `align-items: start`:** each spot card sizes to its own content; expanding one card (e.g. the VCB Forex 19rem-max table) no longer stretches its row-sibling. `min-height: 215px` on the base `.tickers-card` rule still floors any empty-body state (new-tab placeholder) for the VN100 card. **The dashboard's top-row pair (Bullion + Binance) is hard-capped at `20rem` (320px)** via `.tickers-cards > .tickers-card:nth-child(-n + 2) { height: 20rem; display: flex; flex-direction: column }`. The flex-column layout lets the body slot (last child) absorb leftover space — Binance's scroll container fills via `flex: 1; min-height: 0`, Bullion's groups stack from the top with a tiny tail of empty space below the footer-note. The cap targets the first two children of `.tickers-cards` only, leaving the standalone VN100 card (3rd sibling) at its natural content-driven height.
- **Container padding:** `--rl-space-lg` `--rl-space-md` (24px vertical, 16px horizontal)
- **Chart section (mobile ≤639px):** Full viewport width via negative margins (`calc(-1 * var(--rl-space-md))`), 10px internal padding, no border-radius, no side borders
- **Chart section header:** Two rows — asset tabs with freshness dot + refresh button (row 1, bg `--rl-color-surface` with bottom border), Candle + Interval controls (row 2, bg `--rl-color-chart-bg`)
- **Card tab strip:** Horizontally scrollable (`overflow-x: auto`, hidden scrollbar, wheel-to-horizontal JS). Watchlist tabs render after fixed tabs with `×` close buttons. Tab creation animates left-to-right (180ms `cubicOut` `expandX` transition). `+` button is `position: sticky; right: 0` — flows after last tab when content fits, docks to right edge when overflowing (Chrome new-tab pattern).
- **Chart tab row:** Horizontally scrollable via `.tickers-chart-tabs-scroll` with `overflow-x: auto` + hidden scrollbar; watchlist symbols appended after the fixed 6 (Gold/Silver/BTC/ETH/SOL/VN100); status indicator pinned via sibling flex
- **Price scale nudge:** `position: relative; left: 5px` on `.tv-lightweight-charts td:nth-child(3)` to push price axis toward right edge

### Bullion card (Gold SJC, Silver PQ) + Forex tab

One card holds two tabs — **Bullion** (default) and **VCB Forex** — sharing a single header strip with freshness dot + refresh button. The Bullion tab shows both metals at-a-glance; tapping a row expands a scrollable foreign-currency sub-panel. The forex tab surfaces the full VCB rate table.

#### Shared 6-column grid (Bullion)

```
22px | 3rem  | 1fr  | 1fr  | 1fr  | 1fr
icon   label   BUY    SELL   AVG    24H
```

`column-gap: 10px`. Numeric columns are proportional (`1fr` × 4) so BUY/SELL/AVG/24H stay balanced at every viewport and the grid anchors to both card edges. Fixed col 1 (22px) = ingot width; fixed col 2 (3rem) = "Gold"/"Silver" label width.

#### Main metal rows

- **Ingot icon** (22×22) — SJC gold bar and PQ silver bar SVGs under `assets/metals/`. Col 1 flush-left.
- **Label** — "Gold" / "Silver". No unit suffix on the label; the footer line carries unit context once: `Gold per Lượng · Silver per Kg · 1 kVND = 1,000 VND`.
- **BUY / SELL / AVG** — kVND values via `formatKVND` (tiered rule from `shared/number-format.ts`). **AVG is the promoted headline** (`.tickers-metal-avg` → bright text, semibold) — mid-market reference is the unbiased glance value; BUY/SELL muted one tier.
- **24H** — per-metal change % + a small disclosure chevron. Chevron rotates 180° when the row is expanded. Button element (native keyboard + `aria-expanded` + `aria-controls`).
- **Flat → `—`** via `formatPctSigned`. No misleading `0.00%` pre-open.

#### Expand-on-tap sub-panel (foreign currency rates)

Tapping Gold or Silver reveals a scrollable sub-panel inside the same card — converts the metal's VND buy/sell/avg into every VCB currency. Exclusive: one metal expanded at a time.

- **Layout:** subgrid inheriting the 6 parent tracks, so BUY/SELL/AVG values line up pixel-perfect with the parent row's columns.
- **Asset cell** (flag + code): spans cols 1–2 (`grid-column: 1 / 3`), `justify-content: center`. Visually centers the pair between the ingot and label — reads as a "child hanging under the parent" nested-tree signal, not a competing label.
- **Scroll:** `max-height: 14rem`, same tuned scrollbar as the VCB Forex table.
- **Flags:** 18×12 (country-flag aspect), not round — distinct from VCB Forex's round flags so the sub-panel reads as a reference list, not a primary table.
- **Values:** `formatForeign(vnd, rate.avg)` in `vi-VN` locale (dot-thousands, matching the main kVND row's separator convention). AVG column highlighted with the same semibold-bright treatment.
- **Empty / loading states:** "Loading foreign-currency rates…" while the eager mount fetch is in flight, "Rates unavailable" on error.
- **Eager-warmed:** `+page.svelte` fires a one-shot `$effect` on mount that calls `refreshForex()` regardless of tab, so the sub-panel has rates ready the instant a user taps.

#### VCB Forex tab

- **Dense 6-column grid:** `flag(22px) | code(minmax 2.25rem) | buy(1fr) | sell(1fr) | avg(1fr) | 24h(1fr)`. 10px column gap — matches the Bullion card's rhythm for cross-tab visual continuity.
- **Flag inset:** flag is 18×18 rounded (circle) inside a 22px col-1 with `justify-content: flex-start` + `padding-inline-start: 4px`. 4px optical nudge (vs 2px mathematical center) lands the round flag visually balanced against the Bullion tab's rectangular ingot at col-1.
- **Row padding:** `10px var(--rl-space-sm) 10px 0` — 10px vertical gives the 20-row table breathing room; the `--rl-space-sm` inline-end reserves space for the scrollbar gutter so the 24H cell never sits flush.
- **Scroll container:** `max-height: 19rem`, `overflow-y: auto`, `scrollbar-gutter: stable`, `scrollbar-width: thin`, tuned `scrollbar-color: rgba(255,255,255,0.14) transparent`.
- **Sticky header:** keeps column labels visible while rows scroll.
- **Tier dividers:** `border-top: 1px solid var(--rl-color-border-strong)` above rows at `VCB_TIER_DIVIDER_INDICES` (5, 12) — registers the A→B and B→C transitions without a label.
- **Value hierarchy:** AVG headlined (same bright-bold as Bullion's AVG), BUY/SELL muted.
- **Flat → `—`** via `formatDelta` (`'unknown'` when snapshots are stale / yesterday missing); `0.00%` reserved for genuine post-publish flat days.

### Crypto spots card (Binance — BTC / ETH / SOL + watchlist)

Single consolidated card titled **Binance** (Binance brand yellow `#F0B90B` accents the active tab). The card body is one grid: rows 1–3 are the fixed BTC/ETH/SOL majors, rows 4..N are the user's watchlist symbols (cap 10 total per `use-watchlist.svelte.ts`), and the final row is a permanent ticker-input field for adding the next symbol. All data rows share a single batched Binance fetch.

The header strip carries `[Binance]` plus a `[+]` button. **The `[+]` is reserved for opening blank tabs** (per-exchange views, custom panels — future use cases). Clicking `[+]` creates a `Tab N` placeholder; clicking on a placeholder switches the body to a "content coming soon" state. **Adding watchlist symbols does NOT use `[+]`** — it's done by typing into the permanent input row at the table bottom.

#### 7-column grid

```
14px | minmax(2.25rem, auto) | 1fr  | 1fr  | 1fr  | 1fr  | 16px
dot    symbol                  Low    High   Price  24H    ×
```

`column-gap: 10px`, `row-gap: 12px`. **Col 1 (14px)** is just enough for the 10px brand dot with a 4px breathing strip on the right — diverges from Forex's 22px ingot column on purpose: dots are smaller than flags, so the wider track left dead space. Shrinking it lets the dot and the input row's `+` glyph land at the same left edge AND donates ~8px (split as ~2px each) to the four numeric `1fr` columns for breathing room. **Col 7 (16px)** is a dedicated × column populated only on watchlist rows; fixed rows leave it empty — the always-visible × is a discoverability win that justifies the asymmetric 7th track.

#### Top header

Mirrors the Bullion / VCB Forex pattern — column labels (`Low · High · Price · 24H`) sit above the data rows, styled via `.tickers-table-header` + `.tickers-table-col-label` (uppercase, `--rl-text-2xs`, 0.5px tracking, muted, 1px bottom border). The header is a subgrid child (`grid-column: 1 / -1; grid-template-columns: subgrid`) so labels align pixel-perfect with the columns below.

#### Row content

- **Brand dot** (col 1) — 10px circle in the asset's brand color, **left-aligned** (`justify-self: start`) so it lines up vertically with the input row's `+` glyph below. Fixed rows use `CRYPTO[i].accent` (BTC orange, ETH blue, SOL purple). Watchlist rows look up `BRAND_COLORS[base]` via `brandFor(symbol)`, falling back to `#6b8aad` for unknown bases.
- **Symbol** (col 2) — mono semibold. Fixed rows show the bare ticker (`BTC`). Watchlist rows render `formatCryptoDisplay(symbol).primary` plus a smaller, muted `/QUOTE` suffix (e.g. `ETH /BTC`) — the pair reads as one token, the suffix disambiguates non-USDT quotes without crowding the numeric cells.
- **Low / High** (cols 3–4) — `--rl-text-sm` mono semibold, muted (`--rl-color-text-subtle`). Right-aligned. Per-quote formatting via `formatUSDT` (fixed) or `formatCryptoPrice(value, quote)` (watchlist).
- **Price** (col 5) — `--rl-text-md` mono bold, `--rl-color-text`. The headline cell, typographically promoted above Low/High so the rightmost numeric anchor reads first at a glance. Right-aligned.
- **24H** (col 6) — `--rl-text-sm` mono semibold, signed and colored via `.up` / `.down` (green / red). Formatted by `formatPctSigned` — returns `'—'` when `Math.abs(pct) < 0.005` so flat moves don't render a misleading `0.00%`.
- **×** (col 7, watchlist only) — `--rl-text-md` mono, faint at rest, brightens on hover with a subtle surface-raised background. Negative-margin compensates for the hit-area padding so the visible glyph aligns with the empty col-7 placeholders on fixed rows. **`transform: translateY(-2px)`** lifts the glyph onto the row's optical centerline — `×` is rendered baseline-anchored (the font's ascent/descent split is ~75/25), so default text-flow drops it ~2px below the line-box center and reads as sagging onto the row's text baseline. The 2px nudge is purely visual; it doesn't affect layout or the hit area.

#### Permanent input row (last row)

After the watchlist rows, a permanent input row is rendered while `watchlist.crypto.length < cap`. Layout: a faint `+` indicator in col 1 (also `justify-self: start` so it pixel-aligns with the brand dots above), the existing `TickerTabInput` component spanning cols 2–7. The component's popover surfaces matching Binance pairs as the user types; clicking a suggestion immediately commits the symbol to the watchlist (it appears as a real row above) and **the input force-remounts via a `{#key cryptoInputKey}` block** — bumping the key on every `onPick` / `onClose` clears the field and resets internal state, ready for the next entry without a click on `[+]`. The input row is `position: sticky; bottom: 0` so a long scrolled watchlist can't push the add affordance off-screen.

Two behaviors run on every successful pick:

- **Smart fetch** — `tickers.fetchOneCrypto(symbol)` pulls _only_ the new pair from Binance's `/ticker/24hr` endpoint and merges it into `cryptoTickers` (~120ms typically). Re-fetching every existing watchlist symbol on each add would waste the request (Binance's `/ticker/24hr` weight scales with the symbols-list size, and the existing rows are at most 5 min stale). Fire-and-forget; the new row appears with a Skeleton placeholder until the fetch resolves.
- **Auto-scroll-to-bottom** — `cryptoSpotsScrollEl.scrollTo({ top: scrollHeight, behavior: 'smooth' })` runs inside `tick().then(...)` so the freshly-appended row scrolls into view. Without this, on a long scrolled-down list the sticky input row would occlude its own new entry. Note: `TickerTabInput.onMount` deliberately does **not** auto-focus the input — an auto-focus would trigger the browser's default scroll-into-view on the input element, racing with this scrollTo. Letting the user click into the input is the simpler, less surprising default.

#### Blank tabs (`[+]` flow)

`[+]` in the header pushes a placeholder id into `cryptoPlaceholders` and switches `cryptoTab` to `p:N`. The body renders an "Empty tab — content coming soon." centered hint instead of the spots grid. Each placeholder tab has a `×` to close. The active-tab fallback on close is `'binance'`. Placeholders count against the same 10-slot cap as watchlist symbols (shared budget — keeps the strip compact).

### Unified number formatting

Single tiered-precision ladder in `shared/number-format.ts` — covers fiat, crypto, forex rates:

```
>= 1000           → 0 decimal places
100 – 999         → 1 decimal place
1 – 99            → 2 decimal places
0.0001 – 0.9999   → 4 decimal places
< 0.0001          → 8 decimal places
```

Callers pick the locale (`en-US` for comma-thousands, `vi-VN` for dot-thousands) and prepend any symbol. Formatter instances memoized by `locale:decimals` pair — ≤15 entries in practice.

## Charts

- **Library:** lightweight-charts v5 (TradingView)
- **Type:** Candlestick (OHLC), built from intraday sell price points grouped by day for metals; pre-built daily candles for crypto/stocks
- **Up/down candle colors:** `var(--rl-color-up)` / `var(--rl-color-down)` (wick colors match)
- **Grid:** `rgba(42, 42, 54, 0.3)` both axes
- **Chart background:** `var(--rl-color-chart-bg)` — darker than card surface for contrast
- **Crosshair:** `rgba(255, 255, 255, 0.1)`, dashed (style 3), label bg matches chart background
- **OHLC bar:** Dynamic overlay — updates on crosshair hover, shows "Latest" tag when not hovering. Compact M/K notation (e.g., 174.5M) with 1 decimal place
- **Period change:** First candle open vs last candle close, absolute (full number) + percentage
- **Peak/bottom markers:** Custom ISeriesPrimitive — short horizontal line (12px) with price label
    - Color: `rgba(255, 255, 255, 0.5)` line, `rgba(255, 255, 255, 0.6)` text
    - Auto-flips left/right when label would overflow chart edge
- **Candle sizes:** 1D, 3D, 1W — grouped by bucket key (epoch days mod N)
- **Durations:** 7D, 15D, 30D (API: 1M), 90D (API: 3M), 180D (API: 6M), 1Y (API: 1Y). Always fetches 1Y per asset; shorter durations are sliced client-side
- **Candle width scaling:** Explicit `barSpacing`, never `fitContent()`. Tier-based system with 6 tiers (7D→15D→30D→90D→180D→1Y), stepping down per interval:
    - Mobile (standard=10px, step=1px): 12→11→10→9→8→7 (1D), 13→12→11→10→9→8 (3D), 14→13→12→11→10→9 (1W)
    - Desktop (standard=17px, step=2px): 21→19→17→15→13→11 (1D), 23→21→19→17→15→13 (3D), 25→23→21→19→17→15 (1W)
    - Candle size bonus: 1D=0, 3D=+1×step, 1W=+2×step
    - Tier thresholds use 1D-equivalent candle count (numCandles × sizeFactor) to keep tier stable across candle sizes

## Watchlist tab UX (VN100 stocks card)

Chrome-tab-inspired pattern for adding/managing custom tickers. **Scope: VN100 stocks card only.** The Binance crypto card migrated to the row-based pattern above (single consolidated grid with a permanent input row at the bottom); the Bullion card has no watchlist.

- **+ button:** 18×18 circle (`border-radius: 50%`), `align-self: flex-start`, `position: sticky; right: 0` inside the scroll container. Invisible bg at rest (matches card surface); circle bg appears on hover. Hidden when `filled + placeholders >= 10` (per-asset-class cap).
- **Placeholder tab:** clicking `+` creates a transient tab with an inline `<input>` (via `TickerTabInput` component). Input auto-expands width as user types (`width: max(minWidthCh, len+1)ch`, default `minWidthCh = 3`). No placeholder text.
- **Popover suggestions:** shadcn-svelte `Popover` anchored to the input, portal-rendered (escapes `overflow: hidden`). OLED-optimized bg `var(--rl-color-bg)`, deep shadow `0 8px 24px rgba(0,0,0,0.6)`. Dark thin scrollbar. Results fetched via debounced server-side search (200ms). Keyboard nav: `↑`/`↓` cycle through results (wraps at bounds), `Enter` picks highlighted, `Esc` clears query or discards tab.
- **Filled tabs:** display formatted pair label — USDT-quoted pairs strip the suffix (`ADAUSDT` → `ADA`), others show muted quote (`ETHBTC` → `ETH` + muted `/BTC` at `0.78em`). `×` button for removal. Brand accent color on active tab when base matches `BRAND_COLORS` map.
- **Placeholders are transient** — cleared on page reload. Only filled tabs persist via `localStorage`.
- **Expand animation:** new tab wraps animate width 0 → natural via custom Svelte `expandX` transition (180ms, `cubicOut`). Reverses on removal.

`TickerTabInput` is shared with the Binance card's permanent input row, where it's rendered with `minWidthCh={6}` (wider host gets a more inviting input footprint) inside a grid cell instead of a tab wrap.

### Brand colors (popular tokens)

Applied to active watchlist tab text + underline when the pair's base asset matches. Hues slightly desaturated from canonical brand for OLED dark palette fit.

`BTC #e8993a · ETH #5b80e8 · SOL #a566cf · USDT #4dab8c · USDC #4f8cc9 · BNB #d4a829 · XRP #5e9bc7 · ADA #4877c7 · DOGE #c4a644 · AVAX #d8595a · TRX #c45050 · LINK #5377c5 · MATIC/POL #8e6cc4 · DOT #c4528d · LTC #8b9aa8 · NEAR #4cbf86 · ATOM #7479a8 · TON #4d9bc7 · ARB #4d8cc7 · OP #d8595a · APT #3ec8b3 · SUI #5badd9 · INJ #3ec8d8 · PEPE #5fb35a · SHIB #d8893a · HBAR #a8a8b0 · FIL #4d9bc7`

Unmatched tokens use neutral white active state.

## Animations

Layered on top of shell motion tokens:

- **Price value:** fade-in on refresh — `var(--rl-duration-short)` `var(--rl-ease-enter)`
- **Chip toggle:** background+color — `var(--rl-duration-micro)` `var(--rl-ease-move)`
- **Card hover:** background — `var(--rl-duration-short)` `var(--rl-ease-move)`
- **Skeleton loading:** pulse opacity 0.4–1.0 (2s infinite)
- **Refresh spinner:** 1s default, per-source override (metals 500ms, crypto 200ms, stocks 400ms); chart section hardcoded 500ms — all tuned to avg API latency
- **Loading overlay:** progress bar (0→96% over 10s, fast-start curve) + blur(2px) + opacity(0.5), completes 90→100% + fade on data arrival
- **Tab expand:** `expandX` custom Svelte transition — width animates 0 → measured natural width (180ms, `cubicOut`). Reverses on tab removal.

## Interaction

- **Now tick:** `NOW_TICK_MS = 6s` (10 updates/min) — drives FreshnessDot state transitions
- **Visibility fetch:** On tab resume, fetch metals/crypto if last fetch > 10s ago; stocks only if `Date.now() >= computeNextPollTime(lastFetch)` — respects market schedule
- **Force refresh:** user-triggered `forceRefreshAll()` bypasses schedule
