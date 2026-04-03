# Design System — Remini Labs

## Product Context
- **Brand:** Remini Labs — experimental mini-apps by redstrike (Tung Nguyen)
- **What this is:** Multi-asset price dashboard, starting with SJC gold and Phu Quy silver
- **Who it's for:** Personal use, morning coffee price check
- **Space/industry:** Vietnamese domestic precious metals pricing
- **Project type:** Dark-themed, mobile-first dashboard (mini-app within Remini Labs)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with a touch of Luxury
- **Decoration level:** Minimal — typography and data density do the work
- **Mood:** A well-made instrument panel. Weighty, precise, not flashy. Physical precious metals, not crypto speculation.
- **Reference sites:** TradingView (data density), CoinGecko (clean tables), Phu Quy (anti-pattern: cluttered, slow SPA)

## Typography
- **Display/Prices:** Geist Mono — tabular-nums, precise, modern monospace for price numbers
- **Body/Labels:** Geist — clean geometric sans, pairs with Geist Mono
- **UI/Chips:** Geist at 500 weight, smaller sizes
- **Data/Tables:** Geist Mono — tabular-nums for aligned columns
- **Code:** Geist Mono
- **Loading:** Google Fonts CDN (`fonts.googleapis.com`)
- **Scale:**
  - Price: 24px / 700 weight / -0.5px tracking (Geist Mono) — 22px on tablet+
  - Period change: 18px / 700 weight / -0.5px tracking (Geist Mono)
  - Title: 16px / 600 weight / -0.2px tracking
  - Spread: 13px / 600 weight (Geist Mono)
  - Body: 14px / 400 weight
  - Label: 12px / 600 weight / 0.8px tracking / uppercase
  - OHLC values: 11px / 600 weight (Geist Mono)
  - Chip: 10px / 500 weight
  - Caption: 10px / 500 weight
  - Chart axis: 10px (Geist Mono)
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
- **Gold accent:** #c9a84c — muted gold, tied to XAU asset class
- **Silver accent:** #8a94a8 — cool steel, tied to XAG asset class
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
- **Chart section header:** Two rows — Gold/Silver tabs (row 1, bg #1a1a24 with bottom border), Candle + Interval controls (row 2, bg #121218)
- **Price scale nudge:** `position: relative; left: 5px` on `.tv-lightweight-charts td:nth-child(3)` to push price axis toward right edge
- **Border radius:** sm:4px (chips, badges) md:6px (buttons) lg:12px (cards) full:9999px (dots)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms)
- **Animations:**
  - Price value: fade-in on refresh (150ms ease-out)
  - Chip toggle: background+color transition (120ms ease)
  - Card hover: background transition (150ms ease)
  - Skeleton loading: pulse opacity 0.4-1.0 (2s infinite)
  - Refresh dot: pulse opacity (2s infinite)

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
- **Caching:** Client-side Map with 30-min TTL, keyed by asset (always 1Y data)

## Data Architecture
- **Source:** Phu Quy backend API (`be.phuquy.com.vn`), proxied via SvelteKit API routes
- **Fetch:** `globalThis.fetch` (not `event.fetch` — Phu Quy blocks SvelteKit origin headers)
- **Timeout:** 5s AbortController on all upstream calls
- **Server cache:** Cloudflare Cache API with X-Cached-At header for TTL enforcement (60s fresh, 300s stale fallback)
- **Clock sync:** Transparent service (`src/lib/clock-sync.ts`) patches Date.now() and new Date() globally. Initial sync via SSR serverTime (10s drift threshold), re-sync every 15 min via /api/clock using NTP-lite (round-trip compensated).
- **Client polling:** 15-min interval, guarded with `browser` check for SSR safety
- **Gold prices:** Summary API provides native luong/chi prices (not chi×10 conversion)
- **Silver prices:** API returns VND/chi; multiply by 266.667 for VND/kg (1kg = 266.667 chi)
- **Silver filter:** Excludes BM1OZ and "miếng" (mỹ nghệ) items, sorts kg first then lượng
- **Stale indicator:** Green dot = last fetch succeeded, amber dot = fetch failed (showing cached data). Status shows relative time ("Just now", "2 mins ago") with fallback to absolute date (en-GB format + UTC+7) after 24h. Tap to toggle between fetch time and source data time.
- **Time format:** en-GB Intl.DateTimeFormat, fixed to Asia/Ho_Chi_Minh timezone, appended with UTC+7

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-31 | Initial design system created | /design-consultation based on competitive research (TradingView, CoinGecko, crypto dashboards) |
| 2026-03-31 | Geist + Geist Mono over Inter/Roboto | Crisper rendering, superior mono pairing, not overused in financial space |
| 2026-03-31 | Muted gold/silver accents over neon | Asset-class-tied colors. Physical metals, not crypto speculation |
| 2026-03-31 | Warm near-black #0f0f14 over pure #000 | Easier on eyes for morning use. Feels crafted, not default dark mode |
| 2026-04-01 | Google Fonts CDN over jsdelivr | jsdelivr doesn't host Geist package; Google Fonts is reliable |
| 2026-04-01 | globalThis.fetch over event.fetch | Phu Quy API returns 403 when SvelteKit's origin headers are present |
| 2026-04-01 | Cloudflare Cache API over in-memory cache | Module-level variables reset on Worker cold starts |
| 2026-04-01 | 180D uses 1Y data filtered client-side | Phu Quy's 6M API endpoint returns only ~1 week of data (broken) |
| 2026-04-01 | Summary API for gold luong prices | chi×10 ≠ luong price; summary API has native luong/chi values |
| 2026-04-01 | 860px max-width with responsive grid | Two-column card layout on tablet+, single column on mobile |
| 2026-04-01 | Fetch-based stale detection over time-based | Simpler: green = fetch OK, amber = fetch failed showing cached data |
| 2026-04-01 | 15-min polling interval | Phu Quy updates a few times per hour; 5-min was overkill for personal dashboard |
| 2026-04-03 | Chart section full-bleed on mobile | Negative margins to cancel parent padding, recovers horizontal space for chart |
| 2026-04-03 | Two-tone chart section: #1a1a24 tab row + #121218 body | Visual separation between asset tabs and chart content |
| 2026-04-03 | 14D → 15D duration | Rounder number, feels more natural |
| 2026-04-03 | Always-1Y fetch + client-side slicing for all durations | One fetch per asset, instant duration switching |
| 2026-04-03 | Explicit barSpacing over fitContent() | fitContent overrides barSpacing, making candle widths unpredictable across candle sizes |
| 2026-04-03 | Tier-based candle width with additive size bonus | Linear 1px/2px steps feel predictable; multiplicative scaling caused jarring width jumps |
| 2026-04-03 | OHLC compact M/K notation | Saves horizontal space, faster to parse at a glance |
| 2026-04-03 | autoSize: true for chart container | Lets lightweight-charts manage its own ResizeObserver, fixing price scale alignment |
| 2026-04-03 | X-Cached-At header for cache TTL | Cloudflare Cache API ignores Cache-Control for cache.match(); manual TTL check needed |
| 2026-04-03 | Transparent clock sync via Date.now() patch | Dumb-proof DX: developers use Date.now() normally, clock sync is invisible |
| 2026-04-03 | 10s drift threshold for initial sync | Absorbs slow 4G network latency without false-triggering server fallback |
| 2026-04-03 | NTP-lite for background re-sync | Round-trip compensated for ~50ms accuracy, runs every 15 min via /api/clock |
| 2026-04-03 | 60-minute stale threshold | Phu Quy updates irregularly; 30 min caused false amber during normal upstream gaps |
| 2026-04-03 | en-GB locale for date formatting | vi-VN outputs time-first; en-GB gives dd/mm/yyyy date-first as expected |
| 2026-04-03 | Relative time with absolute fallback | "2 mins ago" for fresh data, full date after 24h for stale |
| 2026-04-03 | Tap-to-toggle for source time | Desktop has title tooltip; mobile needs tap since no hover exists |
| 2026-04-03 | Bumped text colors: #4a4a56→#6b6b76, #6b6b76→#8a8a96 | Improved readability on dark backgrounds without losing visual hierarchy |
| 2026-04-03 | Rebrand to "Remini Labs" | Umbrella brand for all mini-apps, consistent in titles, sidebar, meta |
| 2026-04-03 | Sidebar brand in Header slot + breadcrumb nav | Brand at top of sidebar, header shows "Remini Labs › Tickers" on all screens |
| 2026-04-03 | Home links collapse sidebar when on home | Avoids unnecessary navigation; improves mobile UX |
