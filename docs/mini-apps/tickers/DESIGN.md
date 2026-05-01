# Tickers — Design

App-specific design for the Tickers mini-app. For shell defaults (color tokens, typography, motion, layout primitives), see the root `DESIGN.md`.

## Identity

- **Purpose:** Personal portfolio glance — gold/silver, major crypto, VN-market headlines (VNINDEX broad-market + VN30 large-cap + VNMID mid-cap indices + VCB blue-chip equity), plus a personalized watchlist (up to 10 crypto + 10 stock tickers).
- **Mood:** TradingView-density meets CoinGecko-clean. Weighty, precise, not flashy.
- **Reference sites:** TradingView (data density), CoinGecko (clean tables), Phu Quy (anti-pattern: cluttered SPA).
- **Room background:** Inherits shell `--rl-color-bg`. No mini-app override.

## Tokens — tickers extensions

Declared in `src/routes/tickers/tickers.css`, applied to `.tickers-root` (set by `+layout.svelte`). Visible only to descendants via CSS variable inheritance.

### Asset accents

| Token                     | Value     | Asset                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--rl-color-asset-gold`   | `#d4a03a` | SJC gold — rich gold, tied to XAU                                                                                                                                                                                                                                                               |
| `--rl-color-asset-silver` | `#a0a8b8` | PQ silver — lighter metallic, tied to XAG                                                                                                                                                                                                                                                       |
| `--rl-color-asset-btc`    | `#e8993a` | Bitcoin — bright orange, closer to brand                                                                                                                                                                                                                                                        |
| `--rl-color-asset-eth`    | `#5b80e8` | Ethereum — brighter blue, closer to brand                                                                                                                                                                                                                                                       |
| `--rl-color-asset-sol`    | `#a566cf` | Solana — brighter violet, closer to brand                                                                                                                                                                                                                                                       |
| `--rl-color-asset-vn100`  | `#b87333` | VN-market indices — antique bronze (bull statue aesthetic). Token name retains the historical `vn100` slug; in practice it accents every `VN_STOCK_FIXED` index (VNINDEX, VN30, VNMID, plus VN100 if added to watchlist). VCB carries its own `#3a9961` Vietcombank green via `VN_BRAND_COLORS` |

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

Specific size/weight assignments per data role.

**Hybrid rem/px policy** — the dashboard's dense data UI deliberately opts out of the project's mobile root-font shrink (`html { font-size: 14px }` @ ≤720px). Spacing, radius, and gap tokens stay rem so layout scaffolding gets the 12.5% mobile-density discount for free. Typography in viewport-capped data cards (Bullion, VCB Forex, Markets) is **fixed-px** so visible-row counts and identifier widths render identically across mobile and desktop. See `/redstrike: rem-by-default` for the cross-project policy and the empirical failure case (`16rem` table → 10 rows mobile / 11 rows desktop) that drove this split.

| Role                                                                                               | Family | Size (px-fixed)               | Weight  | Tracking                            |
| -------------------------------------------------------------------------------------------------- | ------ | ----------------------------- | ------- | ----------------------------------- |
| Crypto price (chart period change)                                                                 | mono   | 20px (`--rl-text-xl`)         | 700     | —                                   |
| Period change                                                                                      | mono   | 18px (`--rl-text-lg`)         | 700     | -0.5px                              |
| Metal price                                                                                        | mono   | 16px (`--rl-text-md`)         | 700     | -0.3px                              |
| VN index value                                                                                     | mono   | 16px (`--rl-text-md`)         | 700     | — (tiered ladder, "PTS" unit label) |
| **Bullion / Markets numeric values** (Buy/Sell/Avg/24H, Low/High/Price/24H, Floor/Ceil/Price/%Chg) | mono   | **12px** (was `--rl-text-sm`) | 500–600 | -0.3px                              |
| Bullion / Markets asset symbol (Gold, Silver, BTC, FPT, …)                                         | mono   | **12px**                      | 600     | -0.2px                              |
| Bullion metal name (Gold, Silver) + label                                                          | mono   | **11px**                      | 600     | 0.2px                               |
| Bullion sub-panel currency code + value                                                            | mono   | **11px**                      | 500     | 0.3px / -0.2px                      |
| Bullion unit (lượng / kg / chỉ)                                                                    | mono   | **9px**                       | 400     | 0.3px                               |
| OHLC values                                                                                        | mono   | 11px (`--rl-text-xs`)         | 600     | —                                   |
| Chart axis                                                                                         | mono   | 10px (`--rl-text-2xs`)        | —       | —                                   |
| Card tab labels (Bullion / VCB Forex / Binance / VN Stock)                                         | sans   | **12px**                      | 600     | 0.3px                               |
| Shared table column labels (BUY/SELL/AVG/24H, LOW/HIGH/PRICE/24H, FLOOR/CEIL/PRICE/%CHG)           | sans   | **10px**                      | 500     | 0.5px / uppercase                   |
| Card status / footer notes ("1 kVND = 1.000 VND")                                                  | sans   | **10px**                      | 500     | 0.3px                               |
| Markets × close button                                                                             | mono   | **14px**                      | —       | —                                   |
| Peak/bottom marker                                                                                 | mono   | 9px                           | 600     | —                                   |

**Bold = explicitly px-fixed (not rem).** Roles still using rem tokens (`--rl-text-*`) shrink with the project's mobile root-font; that shrink is desired for chart-section labels (which sit alongside rem-spaced chart chrome) and the heavyweight headlines (period-change / metal price / VN index value) where the mobile shrink is visually proportional to the surrounding rem-padded headline area. Anything in a dense data card (Bullion, VCB Forex, Markets) opts out.

## Layout

- **Max content width:** 860px (responsive: single column on mobile, two-column cards at 640px+)
- **Card padding:** 20px (off-scale exception — tickers convention)
- **Card gap:** `--rl-space-md` (16px)
- **Cards grid `align-items: start`:** each spot card sizes to its own content; expanding one card (e.g. the Bullion sub-panel) no longer stretches its row-sibling. `min-height: 215px` on the base `.tickers-card` rule still floors any empty-body state (blank `[+]` placeholder tab). **Dashboard cards are hard-capped** — `max-height: 480px` on `.tickers-cards > .tickers-card`, raised to **`540px` on the first child (Bullion)** so the foreign-currency sub-panel can fit 10 rows when the user expands a metal row. The 480px baseline is 3:4 of a 360px mobile viewport so the dashboard's first fold stays proportional; the 540px Bullion override is the minimum extra headroom needed to surface the full 10-row sub-panel without an outer scroll layer. Below each cap, cards size to natural content; at the cap, the inner scrollers absorb overflow. `.tickers-card` uses `display: flex; flex-direction: column` so a flex:1 child can claim leftover vertical space when the cap engages. **Inner scrollables are pixel-sized** (not rem) so visible-row counts stay stable across the 14px-mobile / 16px-desktop root-font split — see Typography § Hybrid rem/px policy. Three scroll containers at the dashboard level: (a) Bullion's foreign-currency sub-panel `max-height: 228px` (10 rows USD–CAD, ~22.3px row pitch at 11px font + line-height 1.3 + 4+4 pad); (b) the VCB Forex tab's table `max-height: 294px` (10 rows USD–CAD, ~27.2px row pitch at 12px font + line-height 1.2 + 6+6 pad — paired with `font-size: 12px` overrides on `.tickers-forex-code` / `.tickers-forex-num` so mobile and desktop both show exactly 10 rows with no peek of the 11th); (c) the Markets card's `.tickers-crypto-spots-scroll` / `.tickers-stock-spots-scroll` (`flex: 1; min-height: 0; overflow-y: auto` so it absorbs whatever the cap leaves after the header). All three use `scrollbar-width: thin` + tuned `scrollbar-color`; the sub-panel and forex table also reserve a stable scrollbar gutter, the Markets scroll opts out (see Markets card section below for the right-edge-reclaim rationale).
- **Container padding:** `--rl-space-lg` `--rl-space-md` (24px vertical, 16px horizontal)
- **Chart section (mobile ≤639px):** Full viewport width via negative margins (`calc(-1 * var(--rl-space-md))`), 10px internal padding, no border-radius, no side borders
- **Chart section header:** Two rows — asset tabs with freshness dot + refresh button (row 1, bg `--rl-color-surface` with bottom border), Candle + Interval controls (row 2, bg `--rl-color-chart-bg`)
- **Card tab strip:** Horizontally scrollable (`overflow-x: auto`, hidden scrollbar, wheel-to-horizontal JS). Watchlist tabs render after fixed tabs with `×` close buttons. Tab creation animates left-to-right (180ms `cubicOut` `expandX` transition). `+` button is `position: sticky; right: 0` — flows after last tab when content fits, docks to right edge when overflowing (Chrome new-tab pattern).
- **Chart tab row:** Horizontally scrollable via `.tickers-chart-tabs-scroll` with `overflow-x: auto` + hidden scrollbar; fixed anchors (Gold / Silver / BTC / ETH / SOL / VNINDEX / VN30 / VNMID / VCB — sourced dynamically from `VN_STOCK_FIXED`) render first, watchlist symbols appended after; status indicator pinned via sibling flex
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
- **Scroll:** `max-height: 176px` (~7 pair rows on desktop, ~8 on mobile — sized so the parent card's natural expanded height lands at the 480px cap), same tuned scrollbar as the VCB Forex table.
- **Flags:** 18×12 (country-flag aspect), not round — distinct from VCB Forex's round flags so the sub-panel reads as a reference list, not a primary table.
- **Values:** `formatForeign(vnd, rate.avg)` in `vi-VN` locale (dot-thousands, matching the main kVND row's separator convention). AVG column highlighted with the same semibold-bright treatment.
- **Empty / loading states:** "Loading foreign-currency rates…" while the eager mount fetch is in flight, "Rates unavailable" on error.
- **Eager-warmed:** `+page.svelte` fires a one-shot `$effect` on mount that calls `refreshForex()` regardless of tab, so the sub-panel has rates ready the instant a user taps.

#### VCB Forex tab

- **Dense 6-column grid:** `flag(22px) | code(minmax 2.25rem) | buy(1fr) | sell(1fr) | avg(1fr) | 24h(1fr)`. 10px column gap — matches the Bullion card's rhythm for cross-tab visual continuity.
- **Flag inset:** flag is 18×18 rounded (circle) inside a 22px col-1 with `justify-content: flex-start` + `padding-inline-start: 4px`. 4px optical nudge (vs 2px mathematical center) lands the round flag visually balanced against the Bullion tab's rectangular ingot at col-1.
- **Row padding:** `6px var(--rl-space-sm) 6px 0` paired with `line-height: 1.2` — gives a comfortable ~27.2px row pitch at the px-fixed 12px font without burning vertical budget. The default browser line-height (~1.5) at 12px would add ~6px per row, dropping the visible row count by 2.
- **Font:** code + numeric values are **fixed `12px`** (overriding the shared `--rl-text-sm` rem token only inside this card). Same px-fix as the Bullion + Markets cards — see Typography § Hybrid rem/px policy.
- **Flag size:** 14×14 (was 18×18) — the row's height driver is now line-height, not flag-height; shrinking the flag freed enough vertical to fit the full 10-row Tier A + Tier B set.
- **Scroll container:** `max-height: 294px` (10 pair rows USD–CAD with no peek of the 11th, on both 14px-mobile and 16px-desktop roots — the px-fixed font + line-height + flag size mean row pitch is identical across viewports). `overflow-y: auto`, `scrollbar-gutter: stable`, `scrollbar-width: thin`, tuned `scrollbar-color: rgba(255,255,255,0.14) transparent`.
- **Sticky header:** keeps column labels visible while rows scroll.
- **Tier dividers:** `border-top: 1px solid var(--rl-color-border-strong)` above rows at `VCB_TIER_DIVIDER_INDICES` (5, 12) — registers the A→B and B→C transitions without a label.
- **Value hierarchy:** AVG headlined (same bright-bold as Bullion's AVG), BUY/SELL muted.
- **Flat → `—`** via `formatDelta` (`'unknown'` when snapshots are stale / yesterday missing); `0.00%` reserved for genuine post-publish flat days.

### Markets card (Binance + VN-Stock tabs)

Single dual-tab card holding two equally-weighted data-source surfaces side by side: **Binance** (crypto spots — BTC/ETH/SOL fixed + watchlist crypto pairs) and **VN Stock** (Vietnamese stocks — `VN_STOCK_FIXED` rows VNINDEX/VN30/VNMID/VCB + watchlist VN equities). Both tabs share the card chrome (header strip + freshness dot + refresh button) but render independent body grids; switching tabs is a body-only swap with no chrome remount. Mirrors the dual-tab pattern already in production on the Bullion card (which holds `[Bullion] [VCB Forex]` siblings under one chrome).

Per-tab brand-accent active styling: the **Binance** tab wears Binance yellow `#F0B90B`, the **VN Stock** tab wears VN copper `--rl-color-asset-vn100` (`#b87333` — token name retains the historical `vn100` slug). Each active tab "wears" its data-source identity; the row dots inside each tab's body carry per-asset colors (BTC orange, ETH blue, etc., on Binance; copper for the VN indices, brand green for VCB, directional for index watchlist rows on VN Stock).

**Per-active-tab freshness/refresh swap.** The single `FreshnessDot` + refresh button in the card header read from the active tab's data source — Binance freshness + `refreshCrypto()` on the Binance tab, SSI freshness + `refreshStocks()` on the VN Stock tab. Same swap pattern Bullion uses between its two tabs.

The header strip also carries a `[+]` button to the right of the real tabs. **The `[+]` is reserved for opening blank tabs** — future use cases (notes, alerts, custom panels, per-exchange views). Clicking `[+]` creates a `Tab N` placeholder and switches the body to a "content coming soon" state; each placeholder has a `×` to close, and the active-tab fallback on close is `'binance'`. Placeholders are capped at the watchlist cap (10) to prevent runaway accumulation. **Adding watchlist symbols does NOT use `[+]`** — it's done by typing into the permanent input row at the bottom of either data tab's grid.

#### Binance tab body (BTC / ETH / SOL + watchlist crypto)

The body is one grid: rows 1–3 are the fixed BTC/ETH/SOL majors, rows 4..N are the user's watchlist symbols (cap 10 total per `use-watchlist.svelte.ts`), and the final row is a permanent ticker-input field for adding the next symbol. All data rows share a single batched Binance fetch.

#### 7-column grid

```
10px | 4.5rem | 1fr  | 1fr  | 1fr   | 0.9fr | 8px
dot    symbol   Low    High   Price   24H     ×
```

`column-gap: 10px`, `row-gap: 12px`. **Col 1 (10px = dot's exact diameter)** has no right-side breathing strip — the dot→symbol distance is the column-gap alone (10px) instead of 14px. A previous 14px col 1 carried a 4px buffer right of the dot; eliminating it tightens the leading visual rhythm and donates the freed 4px to the four numeric tracks. Diverges from Forex's 22px ingot column on purpose: dots are smaller than flags, and the input row's `+` glyph (`--rl-text-md`, 7–9px wide) anchors at col 1's left via `justify-self: start` so it still visually aligns with the dots above. **Col 2 (4.5rem fixed, ~63px at 14px root)** is the symbol cell — a fixed width rather than `minmax(2.25rem, auto)` so adding a long-symbol watchlist row (`VNDIAMOND`, `FUEVFVND`, `1000PEPE /USDT`) doesn't shift every numeric column leftward. 4.5rem is sized to fit `VNDIAMOND` (9-char mono at `--rl-text-sm` ≈ 63px) with effectively zero buffer. A previous 5rem (~80px) was tuned conservatively for `1000PEPE /USDT`-class crypto pairs but turned out wider than necessary for every actual content sample — the freed ~7px flows to the four numeric tracks via fr ratios. Symbols beyond 4.5rem clip with `…` via `text-overflow: ellipsis` on the asset cell (fail-safe for the rare exotic pair). **Cols 3–6 (`1fr 1fr 1fr 0.9fr`)** rebalance the four numeric tracks against actual content. The three numeric tracks are equal because in mono with `font-variant-numeric: tabular-nums` every digit advances at the same width — Price's heavier font weight doesn't widen `$78.477` vs `$76.204` at the same font-size, so a Price-only fr bump just leaves dead space inside that cell. 24H is the only consistently-shorter content (`+99,99%` max ~43px at `--rl-text-sm`) and surrenders 10% to keep all four numeric cells with comparable slack at both root font sizes — at the tighter desktop 2-column layout (16px root, ~354px grid) every numeric cell ends up with ~4px of slack. **Col 7 (8px)** is the × column on watchlist rows. The button anchors to col 7's right edge via `justify-self: end` plus a -4px right margin so the visible glyph sits flush at the row's right edge with ~6px breathing room from the %CHG content right (column-gap 10 + col 7 width 8 minus the button's hit-area math = ~6px). A previous 16px col 7 stacked too much dead space (~26px from %CHG to ×); collapsing to 0 made × literally touch the percent sign. 8px is the goldilocks middle. The parent scroll container drops `scrollbar-gutter: stable` so the × also reclaims ~10px of right-edge space when no scrollbar is rendered (short watchlist); when the watchlist scrolls, the thin scrollbar takes that ~10px back and the rightmost content shifts left — an acceptable transition signal that "more rows are below."

#### Top header

Mirrors the Bullion / VCB Forex pattern — column labels (`Low · High · Price · 24H`) sit above the data rows, styled via `.tickers-table-header` + `.tickers-table-col-label` (uppercase, `--rl-text-2xs`, 0.5px tracking, muted, 1px bottom border). The header is a subgrid child (`grid-column: 1 / -1; grid-template-columns: subgrid`) so labels align pixel-perfect with the columns below.

#### Row content

- **Brand dot** (col 1) — 10px circle in the asset's brand color, **left-aligned** (`justify-self: start`) so it lines up vertically with the input row's `+` glyph below. Fixed rows use `CRYPTO[i].accent` (BTC orange, ETH blue, SOL purple). Watchlist rows look up `BRAND_COLORS[base]` via `brandFor(symbol)`, falling back to `#6b8aad` for unknown bases.
- **Symbol** (col 2) — mono semibold. Fixed rows show the bare ticker (`BTC`). Watchlist rows render `formatCryptoDisplay(symbol).primary` plus a smaller, muted `/QUOTE` suffix (e.g. `ETH /BTC`) — the pair reads as one token, the suffix disambiguates non-USDT quotes without crowding the numeric cells.
- **Low / High** (cols 3–4) — fixed **12px** mono medium, muted (`--rl-color-text-subtle`). Right-aligned. Per-quote formatting via `formatUSDT` (fixed) or `formatCryptoPrice(value, quote)` (watchlist).
- **Price** (col 5) — fixed **12px** mono semibold, `--rl-color-text`. The headline cell — bright + bolder than Low/High at the same size; weight + color carry the headline emphasis without a font-size jump (an earlier `--rl-text-md` bold draft made Price visibly larger and broke the row's vertical rhythm). Right-aligned.
- **24H** (col 6) — fixed **12px** mono semibold, signed and colored via `.up` / `.down` (green / red). Formatted by `formatPctSigned` — returns `'—'` when `Math.abs(pct) < 0.005` so flat moves don't render a misleading `0.00%`.
- **×** (col 7, watchlist only) — fixed **14px** mono, faint at rest, brightens on hover with a subtle surface-raised background. Negative-margin compensates for the hit-area padding so the visible glyph aligns with the empty col-7 placeholders on fixed rows. **`transform: translateY(-2px)`** lifts the glyph onto the row's optical centerline — `×` is rendered baseline-anchored (the font's ascent/descent split is ~75/25), so default text-flow drops it ~2px below the line-box center and reads as sagging onto the row's text baseline. The 2px nudge is purely visual; it doesn't affect layout or the hit area.

#### Permanent input row (last row)

After the watchlist rows, a permanent input row is rendered while `watchlist.crypto.length < cap`. Layout: a faint `+` indicator in col 1 (also `justify-self: start` so it pixel-aligns with the brand dots above), the existing `TickerTabInput` component spanning cols 2–7. The component's popover surfaces matching Binance pairs as the user types; clicking a suggestion immediately commits the symbol to the watchlist (it appears as a real row above) and **the input force-remounts via a `{#key cryptoInputKey}` block** — bumping the key on every `onPick` / `onClose` clears the field and resets internal state, ready for the next entry without a click on `[+]`. The input row is `position: sticky; bottom: 0` so a long scrolled watchlist can't push the add affordance off-screen.

Two behaviors run on every successful pick:

- **Smart fetch** — `tickers.fetchOneCrypto(symbol)` pulls _only_ the new pair from Binance's `/ticker/24hr` endpoint and merges it into `cryptoTickers` (~120ms typically). Re-fetching every existing watchlist symbol on each add would waste the request (Binance's `/ticker/24hr` weight scales with the symbols-list size, and the existing rows are at most 5 min stale). Fire-and-forget; the new row appears with a Skeleton placeholder until the fetch resolves.
- **Auto-scroll-to-bottom** — `cryptoSpotsScrollEl.scrollTo({ top: scrollHeight, behavior: 'smooth' })` runs inside `tick().then(...)` so the freshly-appended row scrolls into view. Without this, on a long scrolled-down list the sticky input row would occlude its own new entry. Note: `TickerTabInput.onMount` deliberately does **not** auto-focus the input — an auto-focus would trigger the browser's default scroll-into-view on the input element, racing with this scrollTo. Letting the user click into the input is the simpler, less surprising default.

#### Blank tabs (`[+]` flow)

`[+]` in the header pushes a placeholder id into `cryptoPlaceholders` and switches `marketsCardTab` to `p:N`. The body renders an "Empty tab — content coming soon." centered hint instead of either data grid. Each placeholder tab has a `×` to close. The active-tab fallback on close is `'binance'`. Placeholders are capped at the watchlist cap (10).

#### VN-Stock tab body (`VN_STOCK_FIXED` + watchlist VN equities)

Mirrors the Binance tab's row pattern: rows 1–N are the fixed `VN_STOCK_FIXED` lineup (`VNINDEX`, `VN30`, `VNMID`, `VCB` — analog to BTC/ETH/SOL fixed rows on the Binance tab), the next rows are the user's watchlist VN equities (cap 10 total — independent from the crypto cap), and the final row is the permanent input field for adding the next symbol. Same 7-column grid template, same `transform: translateY(-2px)` × nudge, same sticky-bottom permanent input row, same `{#key stockInputKey}` force-remount on each pick. The structural twin to Binance — sharing scoped CSS class names will fire the rule-of-two refactor in a follow-up.

**Fixed rows.** A deliberate mix of **three indices and one blue-chip equity**, spanning the breadth → depth axis of the VN equity market. See ARCHITECTURE.md § "VN-Stock fixed rows" for the per-symbol rationale (VNINDEX = broadest market signal + freshness anchor, VN30 = institutional benchmark, VNMID = mid-cap breadth, VCB = single-stock sentiment proxy). The same `{#each VN_STOCK_FIXED as symbol}` block renders all four; per-row shape is type-discriminated via `'price' in q`:

- **Indices (VNINDEX, VN30, VNMID).** Directional dot · symbol label · **`—`** · **`—`** · close (plain bright, via `formatVnIndex`) · pctChange (signed, colored). The dot color is **directional**, not branded: `brandForVnRow(symbol, q)` returns green/red/faint-gray keyed off `pctChange` — same rule that applies to every watchlist index row (VNDIAMOND, HNXINDEX, …). Indices have no canonical brand color, so a sentiment dot tells the user something useful at a glance instead of a constant copper. The `—` em-dashes in the Floor and Ceil cells are deliberate — an INDEX has no regulatory band, so those columns genuinely don't apply. The dash signals "n/a for indices" rather than missing data. The Price cell skips the VN-iBoard color rule (band-state colors only apply to tradeable equities) and renders plain bright.
- **Equity (VCB).** Brand-color dot (`#3a9961` Vietcombank green from `VN_BRAND_COLORS`) · `VCB` label · floor / ceiling (full VND from `StockQuote`) · price (VN-iBoard 5-state `data-color` rule applied) · pctChange (signed, colored). Same shape as a watchlist equity row.

Col 7 is empty across all four fixed rows — they can't be removed via `×`. Promoting a symbol to fixed status (e.g. VCB joining `VN_STOCK_FIXED` in 2026-05-01, or VNINDEX/VN30 joining the lineup later) auto-prunes any pre-existing watchlist entry for that symbol on next page load, so the user never sees a duplicate row in the watchlist below. See ARCHITECTURE.md § Watchlist for the persistence-layer reservation/pruning contract.

**Watchlist equity rows.** Brand dot (or copper fallback for unmapped equities, directional for index rows via `brandForVnRow`) · symbol (`FPT`, `MWG` …) · floor (full VND) · ceiling (full VND) · price (with VN-iBoard color rule applied via `data-color`) · pctChange (signed, colored) · `×` button.

**Column set diverges from Binance** (`Floor · Ceil · Price · %Chg` vs. Binance's `Low · High · Price · 24H`). Reason: VN-savvy users expect the regulatory ±7% floor/ceiling band on every equity row — it's the canonical VN-market display convention from iBoard / SSI / TCBS / VPS. The session organic Low/High data isn't currently exposed by the SSI client wrapper for individual stocks (only `IndexQuote` carries `low`/`high`), and forcing two different range semantics into the same column header would mislead. Choosing Floor/Ceil keeps equity-row UX correct at the cost of two `—` cells on every index row (VNINDEX / VN30 / VNMID and any watchlist indices) — a feature, not a bug.

**VN-iBoard 5-state price-color rule** (equity rows only). The Price cell receives a `data-color` attribute keyed by row state via `computePriceColor(q)`:

- `ceiling` (purple `--rl-color-vn-ceiling`) — `price >= ceiling` (at or above today's regulatory upper band)
- `floor` (blue `--rl-color-vn-floor`) — `price <= floor` (at or below today's regulatory lower band)
- `up` (green `--rl-color-up`) — `price > refPrice` (above prior close)
- `down` (red `--rl-color-down`) — `price < refPrice` (below prior close)
- `flat` (yellow `--rl-color-vn-flat`) — `price === refPrice` (unchanged from prior close)

Order matters: ceiling/floor checks come first so a stock at the band edge isn't misread as "up/down vs ref"; flat is the fallthrough. This 5-state coloring is the most distinctive VN-market UX cue — it embeds the regulatory-band info directly into the price cell (compensating for choosing not to dedicate columns to floor/ceiling values would have… wait, we DO dedicate columns. So the color is doubly redundant on stocks at the extreme — feature, not bug). The fixed index rows (VNINDEX / VN30 / VNMID) and any watchlist indices omit `data-color` on their price cells and fall through to plain bright text.

**Permanent input row** (last row of the grid) renders while `watchlist.stocks.length < cap`. Same shape as Binance's input row — `+` glyph in col 1 + `TickerTabInput` (`type="stock"`, `minWidthCh={6}`) spanning cols 2–7, position-sticky to the bottom edge. Picks trigger `tickers.fetchOneStock(symbol)` (single-symbol cached server fetch via `/tickers/api/stocks/quote?symbol=...` — far cheaper than re-batching the whole watchlist) and a smooth auto-scroll to the new row's position via `tick().then(() => stockSpotsScrollEl?.scrollTo(...))`.

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

## TickerTabInput component

Shared symbol-picker primitive used by both the Binance and VN-Stock tabs in their permanent input row. Renders a bare `<input>` (no chrome) plus a portal-mounted shadcn-svelte `Popover` that surfaces matching pairs as the user types.

- **Auto-expand input:** width grows with typed characters via `width: max(minWidthCh, len+1)ch`. The `minWidthCh` prop (default `3`) lets the host pick a wider footprint for inviting reads — both Markets-card permanent input rows pass `minWidthCh={6}`.
- **Popover suggestions:** anchored to the input, portal-rendered (escapes `overflow: hidden`). OLED-optimized bg `var(--rl-color-bg)`, deep shadow `0 8px 24px rgba(0,0,0,0.6)`. Dark thin scrollbar. Results fetched via debounced server-side search (200ms). Keyboard nav: `↑`/`↓` cycle through results (wraps at bounds), `Enter` picks highlighted, `Esc` clears query or discards.
- **Auto-focus deliberately disabled:** `onMount` does NOT focus the input. An auto-focus would trigger the browser's default scroll-into-view on the input element, racing with the auto-scroll-to-bottom that runs on `onPick`. Letting the user click into the input is the simpler, less surprising default.
- **Force-remount on pick/close:** the host owns a `*InputKey` `$state` counter that bumps on every successful pick or `onClose`; wrapping the input in a `{#key}` block discards and rebuilds the component (whose internal `query` state doesn't reset on its own after `add` succeeds), readying the field for the next entry without an extra click.

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
