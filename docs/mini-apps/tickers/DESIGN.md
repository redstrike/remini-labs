# Tickers — Design

App-specific design for the Tickers mini-app. For shell defaults (color tokens, typography, motion, layout primitives), see the root `DESIGN.md`.

## Identity

- **Purpose:** Personal portfolio glance — gold/silver, major crypto, VN stock index.
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
| `--rl-color-asset-eth`    | `#6b7fcc` | Ethereum — saturated blue, closer to brand     |
| `--rl-color-asset-sol`    | `#8a6db8` | Solana — deeper violet, closer to brand        |
| `--rl-color-asset-vn100`  | `#b87333` | VN100 — antique bronze (bull statue aesthetic) |

### Directional semantics

Western convention across **all** asset classes (crypto, metals, stocks). VN broker UIs offer inverted red=up as a user preference; we stick with Western for cross-asset consistency.

| Token               | Value     | Use                                       |
| ------------------- | --------- | ----------------------------------------- |
| `--rl-color-up`     | `#2d9f6f` | Price up, gain (muted green)              |
| `--rl-color-down`   | `#c44e4e` | Price down, loss (muted red)              |
| `--rl-color-spread` | `#d4874d` | Buy/sell spread, range hi/lo (warm amber) |

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
| Spread             | mono   | 13px                   | 600                    | —                                |
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
- **Container padding:** `--rl-space-lg` `--rl-space-md` (24px vertical, 16px horizontal)
- **Chart section (mobile ≤639px):** Full viewport width via negative margins (`calc(-1 * var(--rl-space-md))`), 10px internal padding, no border-radius, no side borders
- **Chart section header:** Two rows — asset tabs with freshness dot + refresh button (row 1, bg `--rl-color-surface` with bottom border), Candle + Interval controls (row 2, bg `--rl-color-chart-bg`)
- **Chart tab row:** Horizontally scrollable via `.tickers-chart-tabs-scroll` with `overflow-x: auto` + thin scrollbar; status indicator pinned via sibling flex
- **Price scale nudge:** `position: relative; left: 5px` on `.tv-lightweight-charts td:nth-child(3)` to push price axis toward right edge

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

## Animations

Layered on top of shell motion tokens:

- **Price value:** fade-in on refresh — `var(--rl-duration-short)` `var(--rl-ease-enter)`
- **Chip toggle:** background+color — `var(--rl-duration-micro)` `var(--rl-ease-move)`
- **Card hover:** background — `var(--rl-duration-short)` `var(--rl-ease-move)`
- **Skeleton loading:** pulse opacity 0.4–1.0 (2s infinite)
- **Refresh spinner:** 1s default, per-source override (metals 500ms, crypto 200ms) tuned to API latency
- **Loading overlay:** progress bar (0→96% over 10s, fast-start curve) + blur(2px) + opacity(0.5), completes 90→100% + fade on data arrival

## Interaction

- **Now tick:** `NOW_TICK_MS = 6s` (10 updates/min) — drives FreshnessDot state transitions
- **Visibility fetch:** On tab resume, fetch metals/crypto if last fetch > 10s ago; stocks only if `Date.now() >= computeNextPollTime(lastFetch)` — respects market schedule
- **Force refresh:** user-triggered `forceRefreshAll()` bypasses schedule
