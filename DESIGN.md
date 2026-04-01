# Design System — Tickers

## Product Context
- **What this is:** Multi-asset price dashboard, starting with SJC gold and Phu Quy silver
- **Who it's for:** Personal use, morning coffee price check
- **Space/industry:** Vietnamese domestic precious metals pricing
- **Project type:** Dark-themed, mobile-first dashboard (mini-app within remini-labs)

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
- **Muted text:** #6b6b76 — labels, timestamps
- **Dim text:** #4a4a56 — captions, placeholders
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
- **Crosshair:** rgba(255, 255, 255, 0.1), dashed (style 3), label bg #1a1a24
- **OHLC bar:** Dynamic overlay — updates on crosshair hover, shows "Latest" tag when not hovering
- **Period change:** First candle open vs last candle close, absolute + percentage
- **Peak/bottom markers:** Custom ISeriesPrimitive — short horizontal line (12px) with price label
  - Color: rgba(255, 255, 255, 0.5) line, rgba(255, 255, 255, 0.6) text
  - Auto-flips left/right when label would overflow chart edge
- **Durations:** 30D (API: 1M), 90D (API: 3M), 180D (API: 1Y filtered), 1Y (API: 1Y)
- **Caching:** Client-side Map with 30-min TTL, keyed by `asset:apiDuration`

## Data Architecture
- **Source:** Phu Quy backend API (`be.phuquy.com.vn`), proxied via SvelteKit API routes
- **Fetch:** `globalThis.fetch` (not `event.fetch` — Phu Quy blocks SvelteKit origin headers)
- **Timeout:** 5s AbortController on all upstream calls
- **Server cache:** Cloudflare Cache API (`caches.default`) with 60s TTL, stale-on-error fallback
- **Client polling:** 15-min interval, guarded with `browser` check for SSR safety
- **Gold prices:** Summary API provides native luong/chi prices (not chi×10 conversion)
- **Silver prices:** API returns VND/chi; multiply by 266.667 for VND/kg (1kg = 266.667 chi)
- **Silver filter:** Excludes BM1OZ and "miếng" (mỹ nghệ) items, sorts kg first then lượng
- **Stale indicator:** Green dot = last fetch succeeded, amber dot = showing cached data after fetch failure

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
