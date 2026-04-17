# Tickers — Architecture

Data sources, API endpoints, caching, polling, and market schedule for the Tickers mini-app. For visual design, see `DESIGN.md` in the same folder.

## Data sources

| Asset class                | Upstream   | Endpoint                                                              | Auth | Notes                                                                    |
| -------------------------- | ---------- | --------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| Gold / silver              | Phu Quy    | `be.phuquy.com.vn` (proxied via SvelteKit API)                        | none | Origin-gated CORS — needs server proxy                                   |
| Crypto (fixed + watchlist) | Binance    | `api-gcp.binance.com/api/v3` (with `api.binance.com` mirror fallback) | none | AWS-fronted host blocked from CF Workers — GCP mirror is primary         |
| VN stocks + indices        | SSI iBoard | `iboard-query.ssi.com.vn` (quotes), `iboard-api.ssi.com.vn` (charts)  | none | Browser-shaped UA + `Origin: https://iboard.ssi.com.vn` headers required |

Why SSI for VN: institutional-grade backend, rides through HOSE's 17:00–21:00 ICT post-close batch window that breaks VNDirect's `api-finfo` (ES shard failures).

VN100 over VNINDEX: free-float weighting, single-stock cap (10%), liquidity + profitability filters, quarterly review — avoids VNINDEX distortion by low-free-float mega-caps (VCB, VIC, VHM) and non-profitable tickers.

## API routes (SvelteKit endpoints under `src/routes/tickers/api/`)

| Route            | Purpose                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| `/spots/metals`  | Gold + silver spot prices via Phu Quy table API                                         |
| `/spots/crypto`  | BTC/ETH/SOL spot prices via Binance `/ticker/24hr` (batch)                              |
| `/spots/stocks`  | VN100 index quote via SSI `iboard-query/exchange-index/VN100`                           |
| `/charts/metals` | Daily OHLC candles via Phu Quy historical                                               |
| `/charts/stocks` | Daily OHLC candles via SSI `iboard-api/statistics/charts/history` (UDF parallel arrays) |
| `/search/crypto` | Symbol autocomplete — Binance `exchangeInfo` compacted to quote-grouped dict, 7d cache  |
| `/search/stocks` | Symbol autocomplete — SSI `stock-info` master list, 7d cache, `{symbol, name, kind}`    |
| `/stocks/quote`  | Individual stock quote via SSI `/stock/{SYMBOL}` + `/le-table/stock/{SYMBOL}`           |

Crypto charts fetch direct from Binance browser-side (CORS-permissive) — no SvelteKit proxy.

The `api/` folder is **server-side scope only**. Shared client+server utilities (e.g. `vn-stock-schedule.ts`) live at the app route root (`src/routes/tickers/`), not under `api/`.

## Caching

All server-side caching uses Cloudflare Workers Cache API (`caches.open('tickers')`).

| Endpoint         | Debounce TTL                                                 | Stale fallback | Cache-Control header                                              |
| ---------------- | ------------------------------------------------------------ | -------------- | ----------------------------------------------------------------- |
| `/spots/metals`  | 60s                                                          | 1h             | `public, s-maxage=3600, max-age=0, stale-if-error=3600`           |
| `/spots/crypto`  | 60s                                                          | 1h             | `public, s-maxage=3600, max-age=0, stale-if-error=3600`           |
| `/spots/stocks`  | phase-aware (60s during trading, hours during closed market) | +5min grace    | `public, s-maxage=<phase>, max-age=0, stale-if-error=<phase+300>` |
| `/charts/metals` | 60s                                                          | 1h             | same as spots                                                     |
| `/charts/stocks` | 60s                                                          | 1h             | same as spots                                                     |

`X-Cached-At` header stamps storage time (Workers Cache ignores `Cache-Control` for `cache.match()` — manual TTL check needed in `probeCache()`).

`probeCache(key, ttl)` helper in `src/routes/tickers/api/cache.ts` returns `{ debounced, cached, cache }` — debounced response if within TTL, raw cached for stale-on-error fallback, cache handle for `cache.put` after fresh fetch.

## Client polling

| Asset class      | Cadence              | Stale threshold                           |
| ---------------- | -------------------- | ----------------------------------------- |
| Metals (Phu Quy) | 15 min               | 60 min hard (Phu Quy updates irregularly) |
| Crypto (Binance) | 5 min                | 5 min                                     |
| Stocks (SSI)     | phase-aware schedule | dynamic (stretches across closed hours)   |

Polling primitive: self-rescheduling `setTimeout` (not `setInterval`) — unifies trading cadence and closed-hour drains under one `expiresAt` concept; zero wasted wakes on Saturdays or overnight.

On tab resume (visibility change): fetch metals/crypto if last fetch > 10s ago; stocks only if `Date.now() >= computeNextPollTime(lastFetch)`.

## VN market schedule (`src/routes/tickers/vn-stock-schedule.ts`)

All times ICT (UTC+7, no DST). Drives both client polling cadence and server cache TTLs.

| Phase      | Time range (ICT)      | Client next-poll                               | Server `max-age`     |
| ---------- | --------------------- | ---------------------------------------------- | -------------------- |
| pre-open   | 00:00–09:00 (Mon–Fri) | today 09:00                                    | until today 09:00    |
| trading    | 09:00–15:00 (Mon–Fri) | now + 5 min (capped at 15:00 → jumps to 21:00) | 5 min                |
| post-close | 15:00–21:00 (Mon–Fri) | today 21:00                                    | until today 21:00    |
| eod-final  | 21:00–24:00 (Mon–Thu) | tomorrow 09:00                                 | until tomorrow 09:00 |
| eod-final  | 21:00–24:00 (Fri)     | next Mon 09:00                                 | until next Mon 09:00 |
| weekend    | Sat / Sun (all day)   | next Mon 09:00                                 | until next Mon 09:00 |

- **VN holidays (Tết, 30/4, 2/9) are NOT modeled** — app polls in vain on those days, upstream serves stale. Accepted trade-off.
- **Server cache TTL:** `max(60s, msUntilNextPoll())` fresh, `fresh + 5min` grace for upstream errors. Cache-Control scaled to phase.
- **FreshnessDot:** TTL stretches to next scheduled fetch during closed hours so the dot stays green during known-stable drains rather than turning red.

## Watchlist

Personalized crypto + stock tickers. Fixed tickers (BTC/ETH/SOL, VN100) are always present; watchlist adds user-chosen pairs alongside them.

### Persistence

- **Storage:** `localStorage` key `tickers.watchlist` → `{ crypto: string[], stocks: string[] }`
- **Cap:** 10 per asset class (filled + transient placeholders counted)
- **SSR-safe:** `browser` guard on load; `try/catch` on write (Safari private mode)
- **Normalization:** symbols stored uppercase, deduped on add

### Symbol search

Server-side search with 7-day cached dictionaries (Workers Cache, stale-while-revalidate via `waitUntil`). Dev mode (no Workers Cache) falls through to live fetch.

- **Crypto dict shape:** `Record<quoteAsset, baseAsset[]>` — quote-grouped, ~30KB stringified
- **Stock dict:** full `StockInfo[]` from SSI `stock-info` — all types (stock, index, warrant, futures, ETF, bond)
- **Search ranking (crypto):** 6 tiers — baseExact → symbolExact → basePrefix → symbolPrefix → baseSubstring → symbolSubstring
- **Search ranking (stocks):** symbolPrefix → symbolSubstring → nameSubstring (searches Vi + En + fullName)
- **Result limit:** 10 per query
- **Slash tolerance:** "/" stripped client-side so both "BNB/BTC" and "BNBBTC" match

### Data flow

- **Crypto watchlist:** merged into the fixed-symbol Binance batch call (`/ticker/24hr`). Same 5-min polling cycle, same visibility refetch. No separate polling loop.
- **Stock watchlist:** parallel `Promise.allSettled` fetch via `/stocks/quote?symbol=X` per symbol. Rides the existing VN market schedule. Immediate fetch on mount (bypasses schedule delay for first load).
- **Charts:** watchlist crypto → `fetchCryptoKlines(symbol)`, watchlist stocks → `/charts/stocks?symbol=X` (SSI handles both indices and stocks). Cache TTL follows asset type (crypto = 5 min, stock = VN market phase).

### SSI type mapping (observed from live data)

| SSI `type` | Kind    | Examples             |
| ---------- | ------- | -------------------- |
| `s`        | stock   | FPT, VIC, VCB        |
| `i`        | index   | VN100, VN30, VNINDEX |
| `w`        | warrant | CFPT2513             |
| `f`        | futures | VN30F1M              |
| `e`        | etf     | E1VFVN30             |
| `b`        | bond    | VIC123029            |

## Crypto-specific details

- **Fixed symbols:** BTCUSDT, ETHUSDT, SOLUSDT (always fetched)
- **Watchlist symbols:** any valid Binance TRADING pair (validated against `exchangeInfo` via picker)
- **Price display (USDT):** tiered precision: <100 → 2dp, 100–999 → 1dp, ≥1000 → 0dp, with `$` prefix
- **Price display (non-USDT):** adaptive precision based on magnitude — ≥1000 → 2dp, ≥1 → 4dp, ≥0.01 → 6dp, <0.01 → 8dp. No `$` prefix; quote asset shown as unit label
- **Charts:** Pre-built daily OHLC via Binance `/klines` (not raw points). Always fetches 1Y; shorter durations sliced client-side.
- **Candle aggregation:** 3D/1W merge pre-built 1D candles (first open, last close, max high, min low).
- **Mirror fallback:** `binanceFetch()` tries GCP first, falls back to AWS on `403`/`451` blocks or network errors. Sticky per V8 isolate via `activeIdx`.

## Metals-specific details

- **Source:** Phu Quy backend API (`be.phuquy.com.vn`), proxied via SvelteKit API routes
- **Fetch:** `globalThis.fetch` (not `event.fetch` — Phu Quy 403s on SvelteKit's origin headers)
- **Timeout:** 5s `AbortController` on all upstream calls
- **Gold prices:** Table API provides per-chỉ prices, × 10 for per-lượng. Both shown in compact table.
- **Silver prices:** Table API provides per-unit prices. Sorted small unit first (lượng → kg). Excludes `BM1OZ` and "miếng" (mỹ nghệ) items.

## Clock sync

Transparent service (`src/lib/clock-sync.ts`) patches `Date.now()` and `new Date()` globally. Initial sync via SSR `serverTime` (10s drift threshold), re-sync every 15 min via `/api/clock` using NTP-lite (round-trip compensated).

Rationale: developers use `Date.now()` normally, clock sync is invisible. Critical for accurate freshness display when client clock skews.

## Event bus

Typed event bus per mini-app (`createEventBus<TickersEvents>()`). Data layer emits `fetching`/`fetched` events; UI subscribes and manages spinner state independently. Per-source chart events (`chart:metals:*`, `chart:crypto:*`, `chart:stocks:*`) decouple spinner from unrelated fetches.

Properties: error-isolated, Set-deduped, snapshot iteration.

## Formatting

- **VND:** No fractional digits (1 VND is negligibly small). SSI returns prices in 1000s — multiplied by 1000 for display.
- **USDT/stablecoins:** Tiered precision with `$` prefix (see Crypto)
- **Non-stablecoin crypto:** Adaptive precision without `$` prefix; quote asset as unit label
- **VN index:** 2 decimals, `1,775.65` style
- **Date locale:** `en-GB` (dd/mm/yyyy date-first), avoids `vi-VN`'s time-first format
- **Relative time:** "2 mins ago" for fresh data, full date after 24h for stale
