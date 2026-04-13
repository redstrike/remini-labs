# Design System — Remini Labs

## Product Context

- **Brand:** Remini Labs — experimental mini-apps by redstrike (Tung Nguyen)
- **What this is:** Collection of personal everyday tools as mini-apps
- **Who it's for:** Personal use, everyday tools
- **Project type:** Dark-themed, mobile-first, each mini-app is its own "room" with distinct atmosphere
- **Mini-apps:** Tickers (gold/silver prices + crypto charts), Weather (local weather with atmospheric UI)

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian with a touch of Luxury
- **Decoration level:** Minimal — typography and data density do the work
- **Mood:** A well-made instrument panel. Weighty, precise, not flashy. Precious metals and major crypto assets — personal portfolio tracking, not speculation.
- **Reference sites:** TradingView (data density), CoinGecko (clean tables), Phu Quy (anti-pattern: cluttered, slow SPA)

## Typography

- **Display/Prices:** Geist Mono — tabular-nums, precise, modern monospace for price numbers
- **Body/Labels:** Geist — clean geometric sans, pairs with Geist Mono
- **UI/Chips:** Geist at 500 weight, smaller sizes
- **Data/Tables:** Geist Mono — tabular-nums for aligned columns
- **Code:** Geist Mono
- **Loading:** Google Fonts CDN (`fonts.googleapis.com`)
- **Scale:**
    - Crypto price: 20px / 700 weight (Geist Mono) — 18px on tablet+
    - Metal price: 16px / 700 weight / -0.3px tracking (Geist Mono)
    - Period change: 18px / 700 weight / -0.5px tracking (Geist Mono)
    - Title: 16px / 600 weight / -0.2px tracking
    - Spread: 13px / 600 weight (Geist Mono)
    - Body: 14px / 400 weight
    - Label: 12px / 600 weight / 0.8px tracking / uppercase
    - OHLC values: 11px / 600 weight (Geist Mono)
    - Metal table labels: 10px / 500 weight
    - Caption: 10px / 500 weight
    - Chart axis: 10px (Geist Mono)
    - Card status text: 8px
    - Peak/bottom markers: 9px (Geist Mono)

## Color

- **Approach:** Restrained — gold and silver accents are the only color, tied to asset classes
- **Background:** #0f0f14 — warm near-black (not pure black)
- **Surface:** #1a1a24 — slightly lifted card background
- **Surface hover:** #22222e
- **Border:** #2a2a36
- **Primary text:** #e8e6e3 — warm off-white (not harsh #fff)
- **Secondary text:** #8a8a96 — interactive labels (Buy/Sell, chips, tabs, unit, spread)
- **Status text:** #9a9aa6 — header status bar timestamp
- **Muted text:** #6b6b76 — chart labels (OHLC, Candle, Interval), refresh button icon
- **Dim text:** #4a4a56 — reserved for lowest-priority elements
- **Gold accent:** #d4a03a — rich gold, tied to XAU asset class
- **Silver accent:** #a0a8b8 — lighter metallic, tied to XAG asset class
- **BTC accent:** #e8993a — bright orange, closer to BTC brand
- **ETH accent:** #6b7fcc — saturated blue, closer to ETH brand
- **SOL accent:** #8a6db8 — deeper violet, closer to SOL brand
- **Semantic:**
    - Up: #2d9f6f (muted green)
    - Down: #c44e4e (muted red)
    - Spread: #d4874d (warm amber)
    - Success: rgba(45,159,111,0.1) bg + #2d9f6f text
    - Error: rgba(196,78,78,0.1) bg + #c44e4e text
    - Warning: rgba(212,135,77,0.1) bg + #d4874d text
- **Dark mode:** This IS the dark mode. No light mode planned.

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — not terminal-dense, not marketing-spacious
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout

- **Approach:** Grid-disciplined — strict card stacking, predictable alignment
- **Max content width:** 860px (responsive: single column on mobile, two-column cards on 640px+)
- **Card padding:** 20px
- **Card gap:** 16px
- **Container padding:** 24px vertical, 16px horizontal
- **Chart section (mobile ≤639px):** Full viewport width (negative margins cancel container padding), 10px internal padding, no border-radius, no side borders
- **Chart section header:** Two rows — asset tabs with freshness dot + refresh button (row 1, bg #1a1a24 with bottom border), Candle + Interval controls (row 2, bg #121218)
- **Price scale nudge:** `position: relative; left: 5px` on `.tv-lightweight-charts td:nth-child(3)` to push price axis toward right edge
- **Border radius:** sm:4px (chips, badges) md:6px (buttons) lg:12px (cards) full:9999px (dots)

## App Shell / Branding

- **Brand name:** Remini Labs
- **Page title:** `{AppName} — Remini Labs` (e.g., "Tickers — Remini Labs")
- **Meta description:** Includes AI tools used (Claude Code, Antigravity), mini-app names
- **Sidebar header:** Favicon (20px) + "Remini Labs" (text-sm, font-semibold, tracking-tight), links to home
- **Sidebar footer:** `Crafted with ❤️ ☕ and 🤖 by redstrike` (13px mobile / 12px desktop, whitespace-nowrap)
- **Header breadcrumb:** `Remini Labs › {AppName}` on all screens, brand links to home
- **Home link behavior:** When already on home, clicking brand/home collapses sidebar instead of navigating
- **Mini-app rooms:** Each mini-app has its own background/atmosphere, distinct from the default app bg (#0f0f14)

## Weather App

- **Room background:** Deep blue-gray gradient (`#0d1117` → `#111827` → `#0f172a`), min-height fills viewport
- **Layout:** Single card — temperature, condition, feels-like, location. No details card, no forecast grid. Glanceable like a watch face.
- **Card width cap:** `max-width: 440px` (iPhone 17 Pro Max class), `margin-inline: auto`. Phones fill their container; tablets/laptops/desktops stay at big-phone width instead of stretching.
- **Location label priority:** Ward > District > City > lat/lng. Prefer two tokens ("Ward, District" or "District, City"), degrade to a single token when the adjacent level is missing. GPS-resolved `gpsCity` wins over IP-derived `ipCity`; the Approximate badge (with ISP) is shown only while on the IP fallback path, even after reverse-geocode resolves a precise label.
- **Card treatment:** Standard dark surface (`#1a1a24`, border `#2a2a36`, radius 12px) — matches Tickers cards. No frosted glass, no backdrop-blur.
- **Condition accent:** 3px left border + accent-tinted temperature number. Conveys weather mood without sacrificing readability.
    - Clear day: `#c9a84c` (gold)
    - Hot (>35°C): `#c47a4d` (amber)
    - Clear night: `#6b8aad` (steel blue)
    - Cloudy: `#8a8a96` (gray)
    - Rain: `#5b8fb9` (blue)
    - Snow: `#9ab8d4` (ice)
    - Storm: `#8b7bb8` (purple)
- **Typography:** Temperature in Geist Mono 56px/700, condition 16px/600, feels-like 13px in secondary text, location 13px/500 in muted text
- **No animations:** No atmospheric overlays, no CSS particles, no animated icons. Motion is reserved for functional transitions (spinner, pulse dot).
- **Data source:** Open-Meteo API (free, no key, unlimited)

## Motion

- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms)
- **Animations:**
    - Price value: fade-in on refresh (150ms ease-out)
    - Chip toggle: background+color transition (120ms ease)
    - Card hover: background transition (150ms ease)
    - Skeleton loading: pulse opacity 0.4-1.0 (2s infinite)
    - Freshness dot: 4-state pulse (fresh 3s / good 2s / aging 1.5s / stale 0.75s), colors: green #34d399 / gold #f0c850 / amber #e8993a / red #ef4444
    - Refresh spinner: 1s default, per-source override (metals 500ms, crypto 200ms) tuned to API latency
    - Loading overlay: progress bar (0→96% over 10s, fast-start curve) + blur(2px) + opacity(0.5), completes 90→100% + fade on data arrival

## Charts

- **Library:** lightweight-charts v5 (TradingView)
- **Type:** Candlestick (OHLC), built from intraday sell price points grouped by day
- **Colors:** Up candles #2d9f6f, down candles #c44e4e (wick colors match)
- **Grid:** rgba(42, 42, 54, 0.3) both axes
- **Chart background:** #121218 — darker than card surface for contrast
- **Crosshair:** rgba(255, 255, 255, 0.1), dashed (style 3), label bg #121218
- **OHLC bar:** Dynamic overlay — updates on crosshair hover, shows "Latest" tag when not hovering. Values use compact M/K notation (e.g., 174.5M) with 1 decimal place.
- **Period change:** First candle open vs last candle close, absolute (full number) + percentage
- **Peak/bottom markers:** Custom ISeriesPrimitive — short horizontal line (12px) with price label
    - Color: rgba(255, 255, 255, 0.5) line, rgba(255, 255, 255, 0.6) text
    - Auto-flips left/right when label would overflow chart edge
- **Candle sizes:** 1D, 3D, 1W — grouped by bucket key (epoch days mod N)
- **Durations:** 7D, 15D, 30D (API: 1M), 90D (API: 3M), 180D (API: 6M), 1Y (API: 1Y). Always fetches 1Y per asset; shorter durations are sliced client-side.
- **Candle width scaling:** Explicit barSpacing, never fitContent(). Tier-based system with 6 tiers (7D→15D→30D→90D→180D→1Y), stepping down per interval:
    - Mobile (standard=10px, step=1px): 12→11→10→9→8→7 (1D), 13→12→11→10→9→8 (3D), 14→13→12→11→10→9 (1W)
    - Desktop (standard=17px, step=2px): 21→19→17→15→13→11 (1D), 23→21→19→17→15→13 (3D), 25→23→21→19→17→15 (1W)
    - Candle size bonus: 1D=0, 3D=+1×step, 1W=+2×step
    - Tier thresholds use 1D-equivalent candle count (numCandles × sizeFactor) to keep tier stable across candle sizes
- **Caching:** Client-side Map keyed by asset (always 1Y data), TTL per asset class (15m metals, 5m crypto — matches polling intervals)

## Data Architecture

- **Source:** Phu Quy backend API (`be.phuquy.com.vn`), proxied via SvelteKit API routes
- **Fetch:** `globalThis.fetch` (not `event.fetch` — Phu Quy blocks SvelteKit origin headers)
- **Timeout:** 5s AbortController on all upstream calls
- **Server cache (metals):** Cloudflare Cache API, 60s fresh / 300s stale fallback
- **Server cache (crypto):** 10s debounce only (dedup rapid-fire requests), no stale fallback — fresh data or 502 error
- **Clock sync:** Transparent service (`src/lib/clock-sync.ts`) patches Date.now() and new Date() globally. Initial sync via SSR serverTime (10s drift threshold), re-sync every 15 min via /api/clock using NTP-lite (round-trip compensated).
- **Client polling:** Metals 15 min, crypto 5 min (separate intervals)
- **Visibility fetch:** On tab resume, fetch both sources if last fetch > 10s ago (per-source debounce)
- **Gold prices:** Table API provides per-chỉ prices, × 10 for per-lượng. Both units shown in compact table.
- **Silver prices:** Table API provides per-unit prices. Sorted small unit first (lượng → kg).
- **Silver filter:** Excludes BM1OZ and "miếng" (mỹ nghệ) items
- **Freshness indicator:** 4-state FreshnessDot component (fresh/good/aging/stale) based on elapsed time vs poll interval. Dot color + pulse speed change as data ages. Per-card and per-chart refresh button with spinner driven by event bus. Optional `debug` prop renders inline elapsed/ttl/percentage text (zero-cost when off).
- **Now tick:** `NOW_TICK_MS = 6s` (10 updates/min) — drives freshness state transitions. Two full cycles of the longest pulse (3s fresh), 3 breath lag at 2s "good" pulse, above perceptual responsive floor (20upm). `now` state also synced on every fetch completion and visibility return for instant dot reset.
- **Chart freshness:** FreshnessDot in chart asset tabs row (right-aligned, dot-only). TTL follows client polling intervals per asset class (15m metals, 5m crypto), not a fixed cache TTL. Chart auto-refreshes when matching spot poll succeeds.
- **Event bus:** Typed event bus per mini-app. Data layer emits `fetching`/`fetched` events, UI subscribes and manages spinner state independently. Per-source chart events (`chart:metals:*`, `chart:crypto:*`) decouple spinner from unrelated fetches. Error-isolated, Set-dedup, snapshot iteration.
- **VND formatting:** No fractional digits (1 VND is negligibly small)
- **USDT formatting:** Tiered precision — <100: 2dp, 100-999: 1dp, >=1000: 0dp

## Crypto Data

- **Source:** Binance public API (`api.binance.com/api/v3`), no API key needed
- **Symbols:** BTCUSDT, ETHUSDT, SOLUSDT
- **Price display:** USDT (tiered precision: <100 → 2dp, 100-999 → 1dp, >=1000 → 0dp)
- **Spots endpoint:** `/tickers/api/spots/crypto` — batch fetch all 3 symbols via Binance `/ticker/24hr`
- **Charts endpoint:** `/tickers/api/charts/crypto?symbol=X` — daily OHLC candles via Binance `/klines`
- **Server cache:** 10s debounce only, no stale fallback
- **Chart data:** Pre-built OHLC candles (not raw points) — `ChartData.candles` field
- **Duration:** Always fetch 365 daily candles (1Y), slice client-side like metals
- **Candle aggregation:** 3D/1W merge pre-built 1D candles (first open, last close, max high, min low)
- **Layout:** Tabbed card (BTC/ETH/SOL) alongside metals card, side-by-side on tablet+
- **Accent colors:** Per-coin brand colors (BTC #e8993a, ETH #6b7fcc, SOL #8a6db8)

## Decisions Log

| Date       | Decision                                                 | Rationale                                                                                                                                                         |
| ---------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-31 | Initial design system created                            | /design-consultation based on competitive research (TradingView, CoinGecko, crypto dashboards)                                                                    |
| 2026-03-31 | Geist + Geist Mono over Inter/Roboto                     | Crisper rendering, superior mono pairing, not overused in financial space                                                                                         |
| 2026-03-31 | Muted gold/silver accents over neon                      | Asset-class-tied colors. Physical metals, not crypto speculation                                                                                                  |
| 2026-03-31 | Warm near-black #0f0f14 over pure #000                   | Easier on eyes for morning use. Feels crafted, not default dark mode                                                                                              |
| 2026-04-01 | Google Fonts CDN over jsdelivr                           | jsdelivr doesn't host Geist package; Google Fonts is reliable                                                                                                     |
| 2026-04-01 | globalThis.fetch over event.fetch                        | Phu Quy API returns 403 when SvelteKit's origin headers are present                                                                                               |
| 2026-04-01 | Cloudflare Cache API over in-memory cache                | Module-level variables reset on Worker cold starts                                                                                                                |
| 2026-04-01 | 180D uses 1Y data filtered client-side                   | Phu Quy's 6M API endpoint returns only ~1 week of data (broken)                                                                                                   |
| 2026-04-01 | Gold prices from table API (chi × 10 = lượng)            | Summary API (`/get-price`) is dead upstream; table API has all needed data                                                                                        |
| 2026-04-01 | 860px max-width with responsive grid                     | Two-column card layout on tablet+, single column on mobile                                                                                                        |
| 2026-04-01 | Time-based freshness with 4 states                       | FreshnessDot: green/gold/amber/red based on elapsed vs TTL. Battery-like HP drain metaphor                                                                        |
| 2026-04-01 | Split polling: metals 15min, crypto 5min                 | Metals prices move slowly; crypto needs fresher data. Visibility fetch on tab resume for both                                                                     |
| 2026-04-03 | Chart section full-bleed on mobile                       | Negative margins to cancel parent padding, recovers horizontal space for chart                                                                                    |
| 2026-04-03 | Two-tone chart section: #1a1a24 tab row + #121218 body   | Visual separation between asset tabs and chart content                                                                                                            |
| 2026-04-03 | 14D → 15D duration                                       | Rounder number, feels more natural                                                                                                                                |
| 2026-04-03 | Always-1Y fetch + client-side slicing for all durations  | One fetch per asset, instant duration switching                                                                                                                   |
| 2026-04-03 | Explicit barSpacing over fitContent()                    | fitContent overrides barSpacing, making candle widths unpredictable across candle sizes                                                                           |
| 2026-04-03 | Tier-based candle width with additive size bonus         | Linear 1px/2px steps feel predictable; multiplicative scaling caused jarring width jumps                                                                          |
| 2026-04-03 | OHLC compact M/K notation                                | Saves horizontal space, faster to parse at a glance                                                                                                               |
| 2026-04-03 | autoSize: true for chart container                       | Lets lightweight-charts manage its own ResizeObserver, fixing price scale alignment                                                                               |
| 2026-04-03 | X-Cached-At header for cache TTL                         | Cloudflare Cache API ignores Cache-Control for cache.match(); manual TTL check needed                                                                             |
| 2026-04-03 | Transparent clock sync via Date.now() patch              | Zero-effort DX: developers use Date.now() normally, clock sync is invisible                                                                                       |
| 2026-04-03 | 10s drift threshold for initial sync                     | Absorbs slow mobile network latency without false-triggering server fallback                                                                                      |
| 2026-04-03 | NTP-lite for background re-sync                          | Round-trip compensated for ~50ms accuracy, runs every 15 min via /api/clock                                                                                       |
| 2026-04-03 | 60-minute stale threshold                                | Phu Quy updates irregularly; 30 min caused false amber during normal upstream gaps                                                                                |
| 2026-04-03 | en-GB locale for date formatting                         | vi-VN outputs time-first; en-GB gives dd/mm/yyyy date-first as expected                                                                                           |
| 2026-04-03 | Relative time with absolute fallback                     | "2 mins ago" for fresh data, full date after 24h for stale                                                                                                        |
| 2026-04-03 | Tap-to-toggle for source time                            | Desktop has title tooltip; mobile needs tap since no hover exists                                                                                                 |
| 2026-04-03 | Bumped text colors: #4a4a56→#6b6b76, #6b6b76→#8a8a96     | Improved readability on dark backgrounds without losing visual hierarchy                                                                                          |
| 2026-04-03 | Rebrand to "Remini Labs"                                 | Umbrella brand for all mini-apps, consistent in titles, sidebar, meta                                                                                             |
| 2026-04-03 | Sidebar brand in Header slot + breadcrumb nav            | Brand at top of sidebar, header shows "Remini Labs › Tickers" on all screens                                                                                      |
| 2026-04-03 | Home links collapse sidebar when on home                 | Avoids unnecessary navigation; improves mobile UX                                                                                                                 |
| 2026-04-03 | Each mini-app is its own "room"                          | Distinct atmosphere per app; navigating feels like entering a new space                                                                                           |
| 2026-04-03 | Weather atmospheric gradients over static images         | CSS gradients age better, zero bundle cost, no maintenance                                                                                                        |
| 2026-04-03 | CSS particle effects (rain, snow, fog, glow) over images | Same atmospheric feel, zero asset loading, easy to tune                                                                                                           |
| 2026-04-03 | Frosted glass cards on weather gradients                 | Cards float above atmosphere; data stays readable on any gradient                                                                                                 |
| 2026-04-03 | Weather room deep blue-gray bg                           | Distinct from default app bg (#0f0f14); hints at sky before data loads                                                                                            |
| 2026-04-03 | Open-Meteo over alternatives                             | Free, no API key, unlimited calls, accurate ECMWF/GFS models                                                                                                      |
| 2026-04-04 | Add crypto (BTC, ETH, SOL) from Binance                  | Personal portfolio tracking; Binance for personal context, public API no key needed                                                                               |
| 2026-04-04 | Per-coin vivid accent colors                             | BTC #e8993a, ETH #6b7fcc, SOL #8a6db8 — closer to native brand colors, distinct at small sizes                                                                    |
| 2026-04-04 | Pre-built OHLC candles for crypto                        | Binance provides daily OHLC directly — more accurate than reconstructing from ticks                                                                               |
| 2026-04-04 | Tabbed cards: metals + crypto side by side               | Compact layout; tabs within cards for asset switching                                                                                                             |
| 2026-04-04 | USDT price display                                       | Standard crypto convention; matches Binance data directly, no exchange rate needed                                                                                |
| 2026-04-04 | Configurable chart price formatter                       | USD vs VND formatting via prop; chart component stays currency-agnostic                                                                                           |
| 2026-04-04 | Weather rework: accent bar over atmospheric gradients    | Bright gradients + particle effects killed readability on mobile/daylight. Accent-colored left border + tinted temp preserves condition awareness on dark surface |
| 2026-04-04 | Remove Details + 7-day forecast cards                    | Low-value data for a glanceable weather app. Single card with temp/condition/feels-like/location is enough                                                        |
| 2026-04-04 | Weather scoped CSS over shadcn Card components           | Matches Tickers pattern, consistent surface colors, no backdrop-blur fragility                                                                                    |
| 2026-04-05 | API route restructure: /spots + /charts                  | Symmetric naming: `/api/spots/{metals,crypto}` for live prices, `/api/charts/{metals,crypto}` for historical                                                      |
| 2026-04-05 | Remove dead Phu Quy /get-price endpoint                  | Upstream returns empty data; gold now uses table API (chi × 10 for lượng)                                                                                         |
| 2026-04-05 | Crypto server cache: 10s debounce, no stale fallback     | Single user app; prefer fresh data or error over stale. Debounce prevents hammering Binance                                                                       |
| 2026-04-05 | Event bus for fetch state decoupling                     | Data layer emits events, UI subscribes. Spinner state owned by page, not data layer                                                                               |
| 2026-04-05 | FreshnessDot: 4-state battery-like indicator             | Green/gold/amber/red with accelerating pulse. 6px circle. Reusable component                                                                                      |
| 2026-04-05 | LoadingOverlay: reusable progress bar + blur             | Extracted from tickers chart. 1px progress line, asset-accent colored                                                                                             |
| 2026-04-05 | Compact metal table: all units in one view               | Buy/Sell columns with unit rows (Chỉ/Lượng), spread row with / separator. No sub-tabs                                                                             |
| 2026-04-05 | SSR chart cache warmup (fire-and-forget)                 | Start chart fetch during SSR but don't await — progressive loading feels faster than blocking                                                                     |
| 2026-04-05 | verbatimModuleSyntax enabled                             | Required for TypeScript 7 (Go rewrite). SvelteKit supports it natively                                                                                            |
| 2026-04-09 | Weather card capped at 440px                             | iPhone 17 Pro Max class cap — glanceable card shouldn't stretch across tablet/desktop viewports                                                                   |
| 2026-04-09 | Unified location label: Ward > District > City > lat/lng | Same priority chain for GPS and IP paths; gpsCity wins over ipCity; Approximate badge tied to IP fallback, not to label precision                                 |
| 2026-04-09 | Weather: single 15 min hard TTL, no stale ladder         | Dropped drastic-location/stale-refresh ladder in favor of one createCache() TTL; simpler state, no cached-vs-live dual sources                                    |
| 2026-04-14 | Chart freshness dot + auto-refresh + refresh button      | FreshnessDot in chart tabs row; per-asset TTL (15m metals, 5m crypto) replaces fixed 30m CHART_CACHE_TTL; auto-refresh piggybacks on spot poll success             |
| 2026-04-14 | Per-source chart bus events                              | `chart:metals:*` / `chart:crypto:*` — decouples chart spinner from unrelated fetches (e.g. crypto poll doesn't spin metals chart spinner)                         |
| 2026-04-14 | NOW_TICK_MS = 6s (10 updates/min)                        | Animation interval math: 2× longest pulse (3s fresh), above 20upm perceptual floor. Cross-browser research confirmed 1s-6s safe for mobile battery; platform handles background throttling |
| 2026-04-14 | FreshnessDot debug prop                                  | Optional inline text showing elapsed/ttl/percentage/countdown. Zero-cost when off ($derived early-returns, {#if} block not mounted)                               |
| 2026-04-14 | Sync `now` on every fetch completion                     | Freshness dots snap to green immediately on fetch success instead of waiting up to 6s for next tick                                                               |
