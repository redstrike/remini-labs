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

| Route            | Purpose                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spots/metals`  | Gold + silver spot prices via Phu Quy table API; also embeds 24h `dayStats` (changePercent, low, high) per metal from the 7D chart endpoint |
| `/spots/crypto`  | BTC/ETH/SOL spot prices via Binance `/ticker/24hr` (batch)                                                                                  |
| `/spots/stocks`  | VN100 index quote via SSI `iboard-query/exchange-index/VN100`                                                                               |
| `/charts/metals` | Daily OHLC candles via Phu Quy historical                                                                                                   |
| `/charts/stocks` | Daily OHLC candles via SSI `iboard-api/statistics/charts/history` (UDF parallel arrays)                                                     |
| `/search/crypto` | Symbol autocomplete — Binance `exchangeInfo` compacted to quote-grouped dict, 7d cache                                                      |
| `/search/stocks` | Symbol autocomplete — SSI `stock-info` master list, 7d cache, `{symbol, name, kind}`                                                        |
| `/stocks/quote`  | Individual stock quote via SSI `/stock/{SYMBOL}` + `/le-table/stock/{SYMBOL}`                                                               |

Crypto charts fetch direct from Binance browser-side (CORS-permissive) — no SvelteKit proxy.

The `api/` folder is **server-side scope only**. Shared client+server utilities (e.g. `vn-stock-schedule.ts`) live at the app route root (`src/routes/tickers/`), not under `api/`.

## Caching

All server-side caching uses Cloudflare Workers Cache API (`caches.open('tickers')`).

| Endpoint              | Workers Cache debounce                                    | Stale fallback     | Cache-Control header                       |
| --------------------- | --------------------------------------------------------- | ------------------ | ------------------------------------------ |
| `/spots/metals`       | 900s                                                      | none               | `public, max-age=900, must-revalidate`     |
| `/spots/metals` (USD) | 3600s (inner VCB USD/VND hedge, separate cache key)       | unbounded          | `public, max-age=3600, must-revalidate`    |
| `/spots/crypto`       | 300s (`probeCache`)                                       | none               | `public, max-age=300, must-revalidate`     |
| `/spots/stocks`       | phase-aware (min 60s during trading, hours during closed) | none               | `public, max-age=<phase>, must-revalidate` |
| `/charts/metals`      | 900s                                                      | none               | `public, max-age=900, must-revalidate`     |
| `/charts/stocks`      | phase-aware (min 10s)                                     | none               | `public, max-age=<phase>, must-revalidate` |
| `/search/crypto`      | 7d; stale-while-revalidate via `waitUntil`                | dict always served | `public, max-age=604800, must-revalidate`  |
| `/search/stocks`      | 7d; stale-while-revalidate via `waitUntil`                | dict always served | `public, max-age=604800, must-revalidate`  |

`X-Cached-At` header stamps storage time (Workers Cache ignores `Cache-Control` for `cache.match()` — manual TTL check needed in `probeCache()`).

`probeCache(key, ttl)` helper in `src/routes/tickers/api/cache.ts` returns `{ debounced, cached, cache }` — debounced response if within TTL, cache handle for `cache.put` after a fresh fetch. `cached` (age-unlimited) is still returned by the function but no endpoint currently implements stale-on-error.

**SSR chart cache warming:** `+page.ts` fires a background `fetch('/tickers/api/charts/metals')` during SSR (`!browser` guard, `.catch(() => {})` discarded). No payload returned to client — pure pre-warm to seed the CF Workers Cache before the first browser-side chart request.

## Client polling

| Asset class      | Cadence              | Stale threshold                         |
| ---------------- | -------------------- | --------------------------------------- |
| Metals (Phu Quy) | 15 min               | 15 min (same as poll cadence)           |
| Crypto (Binance) | 5 min                | 5 min                                   |
| Forex (VCB)      | 60 min               | 60 min — matches VCB's daily cadence    |
| Stocks (SSI)     | phase-aware schedule | dynamic (stretches across closed hours) |

Polling primitives: metals and crypto use `setInterval` (fixed cadence); stocks use self-rescheduling `setTimeout` — unifies trading cadence and closed-hour drains under one `expiresAt` concept; zero wasted wakes on Saturdays or overnight.

On tab resume (visibility change): fetch metals/crypto if last fetch > 10s ago; stocks only if `Date.now() >= computeNextPollTime(lastFetch)`.

On mount: if SSR crypto data is older than `SSR_FRESHNESS_MS = 60s` (equals server debounce window), triggers an immediate Binance refetch rather than waiting for the first poll interval.

Chart loading indicator: shown only if a chart fetch takes longer than `LOADING_DELAY_MS = 250ms` — prevents a flash on fast network connections.

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
- **Server cache TTL:** `max(60s, msUntilNextPoll())` for spot quotes, `max(10s, msUntilNextPoll())` for chart data. No stale-on-error serving. Cache-Control scaled to phase.
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
- **Price display (stablecoin quotes — USDT, USDC, FDUSD, TUSD, BUSD, DAI):** unified tiered ladder from `shared/number-format.ts` with `$` prefix
- **Price display (non-USDT):** same unified ladder, no `$` prefix; quote asset shown as unit label
- **Charts:** Pre-built daily OHLC via Binance `/klines` (not raw points). Always fetches 1Y; shorter durations sliced client-side.
- **Candle aggregation:** 3D/1W merge pre-built 1D candles (first open, last close, max high, min low).
- **Mirror fallback:** `binanceFetch()` tries GCP first, falls back to AWS on `403`/`451` blocks or network errors. Sticky per V8 isolate via `activeIdx`.

## Metals-specific details

- **Source:** Phu Quy backend API (`be.phuquy.com.vn`), proxied via SvelteKit API routes
- **Fetch:** `globalThis.fetch` (not `event.fetch` — Phu Quy 403s on SvelteKit's origin headers)
- **Timeout:** 5s `AbortController` on all upstream calls
- **Gold prices:** Table API provides per-chỉ prices, × 10 for per-lượng. Both shown in compact table.
- **Silver prices:** Table API provides per-unit prices. Sorted small unit first (lượng → kg). Excludes `BM1OZ` and "miếng" (mỹ nghệ) items.

### Day stats (24H change, L/H)

- **Composition:** `/spots/metals` fans out to the table endpoint + a 7D chart per metal in one `Promise.all`. Each chart fetch is wrapped in `.catch(() => null)` — if it flakes, `dayStats.gold` or `.silver` is `null` and the UI falls back to `—` without dropping the spot prices.
- **Reference (prior close):** Last chart point whose ICT calendar date is strictly before today. Naturally handles weekends/holidays — if today is Monday, reference is Friday's last tick. No special casing.
- **Current:** Last chart point whose ICT date == today. Pre-open (no real today ticks yet), falls back to reference → `changePercent === 0` → displayed as `—`.
- **Formula:** `(current.sellPrice - reference.sellPrice) / reference.sellPrice * 100`. **`sellPrice` only** (retail-relevant — matches how gold shops quote daily prices). Unit-invariant, so no unit conversion at this layer.
- **L/H:** `min`/`max` of today's points only (not the full 7-day range). Scoped to the day genuinely represents today's intraday range.
- **ICT date extraction:** Phu Quy emits ICT-local ISO timestamps with no TZ suffix (`"2026-04-21T13:43:10.957"`). `timestamp.slice(0, 10)` pulls the ICT calendar date directly — avoids `new Date()` reparsing, which would silently misinterpret on UTC Workers runtime.
- **Unit normalization (client-side in `use-tickers`):** Phu Quy's SJC chart returns per-luong, silver chart returns per-chi. `goldDayStats` applies ÷10 so L/H match the Chỉ row; `silverDayStats` applies ×10 to match the Lượng row. `changePercent` passes through untouched (percent is unit-invariant).
- **Flat → "—" display:** `formatPctSigned` returns `—` when `|value| < 0.005`. Rounded-zero almost always means pre-open or post-close flat, not a confident "zero change." Distinct from VCB's `formatDelta` on purpose — forex has crisp 23:00 snapshot rollovers where flat days are real; metals trade intraday so rounded-zero is essentially always the no-reference case.

## Forex-specific details (VCB)

- **Source:** Vietcombank public exchange-rates API (`www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD`). CORS-permissive → the dual-runtime client in `shared/vcb-forex-client.ts` runs identically under Workers SSR and browser, no SvelteKit proxy needed.
- **Eager mount fetch:** `+page.svelte` fires a one-shot `$effect` on mount that calls `refreshForex()` — not gated by the active tab. Drives the Bullion card's tap-to-expand sub-panel (needs rates on-hand to render without a loading flash). A `forexEagerFired` flag guards against refetch loops if the first attempt fails. After a successful first fetch, `forexPollActive` flips and the 60-min `setInterval` takes over.
- **Publishing schedule:** Empirical probe of 30 consecutive days showed VCB stamps every snapshot with `UpdatedDate: YYYY-MM-DDT23:00:00+07:00` — one daily close at 23:00 ICT, plus a handful of intraday updates during business hours (no documented schedule). `FOREX_POLL_MS = 60 min` matches the cadence without pounding VCB.
- **Fetch timeout:** 8s `AbortSignal.timeout` on each VCB call — keeps `Promise.all(today, yesterday)` from hanging the spinner if VCB's edge stalls.
- **24H delta:** Per-row `(today.avg - yesterday.avg) / yesterday.avg * 100`. Today + yesterday snapshots fetched in parallel (distinct `?date=` params). `avg = (transfer + sell) / 2` — mid-market rather than sell-only for less biased movement.
- **Yesterday caching:** Once fetched, `forexYesterday` is sticky for the session and only refetched when the ICT calendar day rolls over (detected by comparing `forexYesterday.date` against a fresh `toVcbDateParam(vcbYesterday(now))`).
- **Stale-snapshot detection:** VCB rolls unpublished future-date queries to the latest available snapshot, so during overnight (before ~23:00 ICT publish), `?date=today` and `?date=yesterday` resolve to the same underlying data with identical `UpdatedDate`. Detected in the `forexRows` derived: when `today.updatedAt === yesterday.updatedAt`, yesterday is passed as `undefined` → `formatDelta` returns `—` (unknown) across every row instead of a falsely-confident `0.00%`.
- **Currency order and tiers:** `VCB_CURRENCY_ORDER` defines explicit display order — Tier A (top 5: USD/EUR/JPY/CNY/KRW), Tier B (common 7), Tier C (thin-volume 8). Hairline dividers rendered above rows listed in `VCB_TIER_DIVIDER_INDICES` (5, 12).
- **Flag SVG bundling:** `import.meta.glob('../assets/flags/*.svg', { query: '?url', eager: true })` — emitted as fingerprinted static files under `/_app/immutable/assets/`, not inlined into JS. EUR uses the EU flag (`eu`).
- **USD hedge (server-side):** `/spots/metals` also embeds a VCB USD/VND avg (`usdVndAvg` field) fetched via the same client under a separate 1h cache key with unbounded stale fallback. Independent of the browser-side forex poll; lets server-rendered metal prices carry an approximate USD equivalent without a second client fetch.

## Clock sync

Transparent service (`src/lib/clock-sync.ts`) patches `Date.now()` and `new Date()` globally. Initial sync via SSR `serverTime` (10s drift threshold), re-sync every 15 min via `/api/clock` using NTP-lite (round-trip compensated).

Rationale: developers use `Date.now()` normally, clock sync is invisible. Critical for accurate freshness display when client clock skews.

## Event bus

Typed event bus per mini-app (`createEventBus<TickersEvents>()`). Data layer emits `fetching`/`fetched` events; UI subscribes and manages spinner state independently. Per-source chart events (`chart:metals:*`, `chart:crypto:*`, `chart:stocks:*`) decouple spinner from unrelated fetches.

Properties: error-isolated, Set-deduped, snapshot iteration.

## Formatting

Single source of truth: `shared/number-format.ts` — a 5-tier precision ladder (`≥1000 → 0dp · 100-999 → 1dp · 1-99 → 2dp · 0.0001-0.9999 → 4dp · <0.0001 → 8dp`) memoized per `locale:decimals` pair. Covers fiat, crypto, and forex rates. See `DESIGN.md` § "Unified number formatting" for the full table.

- **VND:** tiered ladder in `vi-VN` locale (dot-thousands). SSI prices arrive in 1000s — multiplied by 1000 before formatting.
- **Stablecoin crypto** (`USDT, USDC, FDUSD, TUSD, BUSD, DAI`): tiered ladder in `en-US` with `$` prefix
- **Non-stablecoin crypto:** tiered ladder in `en-US`, no `$` prefix; quote asset as unit label
- **Forex (foreign-currency view in Bullion sub-panel):** `formatForeign(vnd, rate.avg)` = tiered ladder in `vi-VN` (dot-thousands) — matches the kVND parent row's separator convention
- **VN index:** tiered ladder (typically 2dp at `~1000` range), `PTS` unit label
- **Date locale:** `en-GB` (dd/mm/yyyy date-first), avoids `vi-VN`'s time-first format
- **Relative time:** "2 mins ago" for fresh data, full date after 24h for stale
