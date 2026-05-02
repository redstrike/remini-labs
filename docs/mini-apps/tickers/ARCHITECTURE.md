# Tickers — Architecture

Data sources, API endpoints, caching, polling, and market schedule for the Tickers mini-app. For visual design, see `DESIGN.md` in the same folder.

## Data sources

| Asset class                | Upstream   | Endpoint                                                              | Auth | Notes                                                                    |
| -------------------------- | ---------- | --------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| Gold / silver              | Phu Quy    | `be.phuquy.com.vn` (proxied via SvelteKit API)                        | none | Origin-gated CORS — needs server proxy                                   |
| Crypto (fixed + watchlist) | Binance    | `api-gcp.binance.com/api/v3` (with `api.binance.com` mirror fallback) | none | AWS-fronted host blocked from CF Workers — GCP mirror is primary         |
| VN stocks + indices        | SSI iBoard | `iboard-query.ssi.com.vn` (quotes), `iboard-api.ssi.com.vn` (charts)  | none | Browser-shaped UA + `Origin: https://iboard.ssi.com.vn` headers required |

Why SSI for VN: institutional-grade backend, rides through HOSE's 17:00–21:00 ICT post-close batch window that breaks VNDirect's `api-finfo` (ES shard failures).

VN-Stock fixed rows are the constant `VN_STOCK_FIXED = ['VNINDEX', 'VN30', 'VNMID', 'VCB']` exported from `use-tickers.svelte.ts`. Single source of truth — drives the watchlist reservation set (`reservedStocks`), the chart-tab strip (anchors after the crypto fixed entries), and the body grid render loop. The lineup deliberately spans the breadth → depth axis of the VN equity market:

- **VNINDEX** — every HOSE listing weighted by full market cap. The broadest "what is VN equity doing right now?" signal. Anchors the dashboard's freshness — only `VNINDEX`'s `X-Cached-At` updates `lastStocksFetchedAt` (encoded as `VN_STOCK_HEADLINE` in `use-tickers.svelte.ts`); the other rows ride the same SSI batch but their per-row staleness isn't surfaced in the FreshnessDot.
- **VN30** — top 30 most liquid HOSE tickers (free-float weighted, capped 10%). The institutional / derivatives benchmark — VN30-Futures trade off this index, so its level is what large investors actually transact on.
- **VNMID** — HOSE mid-cap basket (~70 tickers between VN30 and VNSML). Complementary breadth signal — when VN30 leads VNMID hard, the rally is mega-cap-driven; when VNMID leads, breadth is healthier.
- **VCB** — equity, not an index. Vietcombank, the canonical VN30 banking blue-chip used as a single-stock market sentiment proxy.

The `IndexQuote | StockQuote` union shape lets all four share one `stockQuotes` Map; `isVnIndex(symbol)` decides the per-symbol upstream path (`/spots/stocks` for indices, `/stocks/quote` for equities) inside `fetchStocks()`. SSR pre-hydrates every entry in `VN_STOCK_FIXED` via the `vnStockFixed: VnStockFixedSeed[]` field in `+page.ts`'s load return — adding/removing fixed symbols only requires editing the const.

## API routes (SvelteKit endpoints under `src/routes/tickers/api/`)

| Route            | Purpose                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spots/metals`  | Gold + silver spot prices via Phu Quy table API; also embeds 24h `dayStats` (changePercent, low, high) per metal from the 7D chart endpoint                                                                                        |
| `/spots/crypto`  | BTC/ETH/SOL spot prices via Binance `/ticker/24hr` (batch)                                                                                                                                                                         |
| `/spots/stocks`  | VN-index quote via SSI `iboard-query/exchange-index/{SYMBOL}` (VNINDEX, VN30, VNMID, VN100, VNDIAMOND, HNXINDEX, … — any `KNOWN_VN_INDICES` symbol via `?symbol=`; falls back to `DEFAULT_INDEX_SYMBOL` when the param is omitted) |
| `/charts/metals` | Daily OHLC candles via Phu Quy historical                                                                                                                                                                                          |
| `/charts/stocks` | Daily OHLC candles via SSI `iboard-api/statistics/charts/history` (UDF parallel arrays)                                                                                                                                            |
| `/search/crypto` | Symbol autocomplete — Binance `exchangeInfo` compacted to quote-grouped dict, 7d cache                                                                                                                                             |
| `/search/stocks` | Symbol autocomplete — SSI `stock-info` master list, 7d cache, `{symbol, name, kind}`                                                                                                                                               |
| `/stocks/quote`  | Individual stock quote via SSI `/stock/{SYMBOL}` + `/le-table/stock/{SYMBOL}`                                                                                                                                                      |

Crypto charts fetch direct from Binance browser-side (CORS-permissive) — no SvelteKit proxy.

The `api/` folder is **server-side scope only**. Shared client+server utilities (e.g. `vn-stock-schedule.ts`) live at the app route root (`src/routes/tickers/`), not under `api/`.

### Symbol-param validation (VN endpoints)

`/spots/stocks`, `/charts/stocks`, and `/stocks/quote` parse `?symbol=` through a single helper — `parseVnSymbolParam(url, { defaultSymbol? })` exported from `shared/ssi-iboard-client.ts`. The helper normalizes (uppercase), validates against `VN_SYMBOL_RE = /^[A-Z0-9]{1,16}$/`, and returns either `{ symbol }` or `{ errorResponse }` (a 400 JSON envelope). The 16-char cap blocks attacker-controlled payloads from bloating Workers Cache keys via `?symbol=AAAA…` — longest real VN ticker is 9 chars (`FUEVFVND`).

### Search-endpoint factory (dict-style search)

`/search/crypto` and `/search/stocks` share a single implementation factory at `src/routes/tickers/api/dict-search-handler.ts`. `createDictSearchHandler<Dict, Match, ApiResult>({ cacheKey, freshMs, maxAgeSeconds, fetchAll, search, mapResult?, errorTag, errorMessage })` owns the full SWR-with-Workers-Cache pipeline: cold-fetch on miss, background revalidate via `ctx.waitUntil` on stale, structured 502 envelope on cold-fetch failure. Each route file becomes a ~12-line composition that supplies upstream + search + per-match transform; route-specific concerns (e.g. SSI's `KIND_MAP` decoration) stay in the route file as `mapResult`.

### Error envelope (502)

All upstream-failure responses go through `serverError502(event, error, message, extra?)` exported from `src/lib/server-log.ts`. Standardized wire shape: `json({ error: message }, { status: 502 })`. Internally calls `logServerError` with the same kebab-case event tag (`<source>-<resource>-<status>`) so Workers Logs can split fetch failures from refresh failures, and `extra` flows through to the structured log for queryable per-request context (symbol, categoryId, …). Replaces the prior split between `error(502, ...)` (SvelteKit HttpError, `{ message }` shape) and hand-rolled `json({ error }, { status: 502 })` across 8 endpoints.

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

`probeCache(key, ttl)` helper in `src/routes/tickers/api/cache.ts` returns `{ debounced, cached, cache }` — debounced response if within TTL, cache handle for `cache.put` after a fresh fetch. `cached` (age-unlimited) returned by the function for stale-on-error fallback (`/stocks/quote` is the only current consumer; bounded by `STALE_GRACE_MS = 5 min`).

`openTickersCache()` is exported alongside `probeCache` for routes that need direct Cache access outside the debounce path (e.g. the dict-search-handler's SWR pipeline). Returns `Cache | null` (null in Vite dev SSR where the Cache API is absent — handlers fall through to live fetch).

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

On mount: stocks and crypto each fire one batched fetch immediately (covers fixed rows + watchlist) so the client owns live state from first paint onward — SSR is a paint-the-pixels seed for fixed rows, not a freshness contract. Metals defer to their 15-min poll (Phu Quy moves slowly enough that SSR data is good enough until the first interval); forex is lazy (fires only when the Bullion card's tap-to-expand sub-panel is opened).

Chart loading indicator: shown only if a chart fetch takes longer than `LOADING_DELAY_MS = 250ms` — prevents a flash on fast network connections.

## Upstream clients (Phu Quy / SSI / Binance / VCB)

Each upstream lives in its own client module under `src/routes/tickers/shared/`. All four use a thin shared factory — `createFetchWithTimeout({ timeoutMs, headers })` from `shared/fetch-with-timeout.ts` — that bakes `AbortSignal.timeout(N)` and a baseline header set into a `globalThis.fetch` wrapper. Per-client identity stays at the call site:

| Client                 | Timeout | Notable headers                                                                           |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `binance-client.ts`    | 5 s     | `Accept: application/json`                                                                |
| `ssi-iboard-client.ts` | 5 s     | Browser-shaped UA, `Origin: https://iboard.ssi.com.vn`                                    |
| `phuquy-client.ts`     | 5 s     | Project UA — Phu Quy 403s on SvelteKit's `event.fetch` Origin headers, hence `globalThis` |
| `vcb-forex-client.ts`  | 8 s     | Mozilla UA — VCB's TLS handshake is empirically slower than the other upstreams           |

`globalThis.fetch` (not SvelteKit's `event.fetch`) is intentional — `event.fetch` injects an Origin header that several upstreams reject as a CORS pre-flight surrogate.

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

Personalized crypto + stock tickers. Fixed tickers (`BTCUSDT` / `ETHUSDT` / `SOLUSDT` on the Binance tab; `VNINDEX` / `VN30` / `VNMID` / `VCB` on the VN-Stock tab) are always present; watchlist adds user-chosen pairs alongside them.

### Persistence

- **Storage:** `localStorage` key `tickers.watchlist` → `{ crypto: string[], stocks: string[] }` via Runed `PersistedState` with a defensive deserializer (bad shape → reset to empty rather than crash; tolerates manual edits and version drift)
- **Cap:** 10 per asset class (filled + transient placeholders counted)
- **SSR-safe:** `browser` guard on load; `try/catch` on write (Safari private mode)
- **Normalization:** symbols stored uppercase, deduped on add
- **Reserved-set guard + auto-prune migration:** `createWatchlist({ reservedCrypto, reservedStocks })` accepts the fixed-row symbol lists at construction. Two effects: (1) `add()` rejects future picks of any reserved symbol (the picker also blocks them via `RESERVED_CRYPTO` / `RESERVED_STOCKS` sets in `+page.svelte`, but the persistence layer is the second-line guard); (2) a one-shot prune at construction drops any persisted entry that overlaps the reserved set, so promoting a symbol to fixed status (e.g. VCB joining `VN_STOCK_FIXED` in 2026-05-01, or VNINDEX / VN30 joining the lineup later) auto-migrates older watchlists without a manual `localStorage.clear()`. The setter writes back, so the migration sticks across reloads. SSR-safe: `state.current` is the in-memory default until hydration, the prune is a no-op until then.

### Symbol search

Server-side search with 7-day cached dictionaries (Workers Cache, stale-while-revalidate via `waitUntil`). Dev mode (no Workers Cache) falls through to live fetch.

- **Crypto dict shape:** `Record<quoteAsset, baseAsset[]>` — quote-grouped, ~30KB stringified
- **Stock dict:** full `StockInfo[]` from SSI `stock-info` — all types (stock, index, warrant, futures, ETF, bond)
- **Search ranking (crypto):** 6 tiers — baseExact → symbolExact → basePrefix → symbolPrefix → baseSubstring → symbolSubstring
- **Search ranking (stocks):** symbolPrefix → symbolSubstring → nameSubstring (searches Vi + En + fullName)
- **Result limit:** 10 per query
- **Slash tolerance:** "/" stripped client-side so both "BNB/BTC" and "BNBBTC" match

### Data flow

- **Crypto watchlist:** merged into the fixed-symbol Binance batch call (`/ticker/24hr`). One batched fetch on mount, then 5-min poll + visibility refetch. No separate polling loop. SSR pre-paints the fixed BTC/ETH/SOL triple only — watchlist symbols hydrate on mount because `localStorage` isn't visible to SSR.
- **Stock watchlist:** single batched `Promise.allSettled` over `[...VN_STOCK_FIXED, ...watchlist.stocks]` deduped — per-symbol endpoint routing inside the loop (`isVnIndex(symbol)` → `/spots/stocks` for indices like VNINDEX/VN30/VNMID, `/stocks/quote` for equities like VCB/FPT). Both shapes (`IndexQuote | StockQuote`) land in the same `stockQuotes` Map. Rides the existing VN market schedule. Immediate fetch on mount (bypasses schedule delay for first load) so all `VN_STOCK_FIXED` rows + watchlist symbols populate without waiting for the schedule.
- **Single-symbol smart fetch on add:** `fetchOneStock(symbol)` mirrors `fetchOneCrypto` — when the user picks a new watchlist symbol, only that symbol is fetched (auto-routes indices to `/spots/stocks`, equities to `/stocks/quote`) and merged into the Map without disturbing existing rows. Cheaper than re-batching the whole list on each add.
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
- **Fetch:** via `createFetchWithTimeout({ timeoutMs: 5_000, headers })` from `shared/fetch-with-timeout.ts` — see § "Upstream clients" above
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
- **Fetch:** via `createFetchWithTimeout({ timeoutMs: 8_000, headers })` from `shared/fetch-with-timeout.ts` — VCB's TLS handshake is empirically slower than the other upstreams (8s vs 5s default); keeps `Promise.all(today, yesterday)` from hanging the spinner if VCB's edge stalls. See § "Upstream clients".
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

Single source of truth: `shared/number-format.ts` — a 5-tier precision ladder (`≥1000 → 0dp · 100-999 → 1dp · 1-99 → 2dp · 0.0001-0.9999 → 4dp · <0.0001 → 8dp`) memoized per `locale:decimals` pair. Covers fiat, crypto, and forex rates. See `DESIGN.md` § "Unified number formatting" for the full table. **Default locale is `vi-VN` (dot-thousands · comma-decimal)** so every numeric surface — Binance prices, VN equities, VN indices, VCB forex, percent changes, chart period change, OHLC tooltip — reads with one separator convention. Earlier the default was `en-US` (comma-thousands · dot-decimal); that mixed badly with the VND surfaces (which were always vi-VN), and the inconsistency carried no signal value.

- **VND:** tiered ladder in `vi-VN` (dot-thousands · comma-decimal). SSI prices arrive in 1000s — multiplied by 1000 before formatting.
- **Stablecoin crypto** (`USDT, USDC, FDUSD, TUSD, BUSD, DAI`): tiered ladder (default `vi-VN`) with `$` prefix → `$78.490`, `$84,15`
- **Non-stablecoin crypto:** tiered ladder (default `vi-VN`), no `$` prefix; quote asset as unit label → `0,0294`
- **Forex (foreign-currency view in Bullion sub-panel):** `formatForeign(vnd, rate.avg)` = tiered ladder in `vi-VN` — matches every other VND row's separator convention
- **VN index:** tiered ladder in `vi-VN` (so VNINDEX at `1.282` lands as 0dp; HNXINDEX at `250,7` lands as 1dp), `PTS` unit label via the `formatVnIndex` helper (renamed from `formatVN100` once the indices became a family). Replaces the previous locked-2dp formatter — the inconsistent precision across magnitudes read as arbitrary once `VN_STOCK_FIXED` grew from a single VN100 to a multi-index lineup.
- **Date locale:** `en-GB` (dd/mm/yyyy date-first), avoids `vi-VN`'s time-first format
- **Relative time:** "2 mins ago" for fresh data, full date after 24h for stale

### Shared math + date helpers

- `pctChange(from, to)` in `shared/number-format.ts` — guarded percent change (`from ? ((to - from) / from) * 100 : 0`). Same semantics across the 4 upstream clients (Binance/SSI/Phu Quy) and `use-tickers`'s window-slicing — zero/NaN reference → 0.
- `toICTDate(d)` in `shared/ict-date.ts` — `YYYY-MM-DD` in `Asia/Ho_Chi_Minh`, used by every VN-source consumer.
- `toUTCDate(d)` in `shared/ict-date.ts` — `YYYY-MM-DD` in UTC, used when the upstream payload is conventionally UTC-bucketed (Binance daily klines stamped at 00:00 UTC, SSI daily bars stamped at 00:00 UTC of the trading day).
