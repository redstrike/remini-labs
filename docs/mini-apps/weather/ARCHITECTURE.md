# Weather — Architecture

Data source, location resolution, caching, and remote functions for the Weather mini-app. For visual design, see `DESIGN.md` in the same folder.

## Data source

- **Upstream:** Open-Meteo (`api.open-meteo.com`)
- **Auth:** none (free, unlimited)
- **Why:** No API key, accurate ECMWF/GFS models, generous quotas

## API routes (SvelteKit endpoints under `src/routes/weather/api/`)

| Route                  | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `/api/ip-location`     | IP-derived coarse location fallback (city, ISP, lat/lng) |
| `/api/reverse-geocode` | Ward/District/City label resolution from precise lat/lng |

Weather data fetch uses the SvelteKit **remote function** at `weather.remote.ts` — single source of truth for the weather query, used by SSR and client.

## Location resolution

Two-path strategy with explicit precedence:

1. **GPS path (preferred):** `navigator.geolocation.getCurrentPosition()` → reverse-geocode → precise label
2. **IP path (fallback):** `/api/ip-location` returns coarse location + ISP

Label priority chain (same for both paths): **Ward > District > City > lat/lng**. Two-token label preferred ("Ward, District" or "District, City").

`gpsCity` wins over `ipCity` whenever GPS resolves. The Approximate badge (with ISP) stays visible while still on the IP fallback path, even after reverse-geocode succeeds — the underlying coordinates are coarse, the user should know.

## Caching

- **Client cache:** `createCache()`-shaped wrapper, single 15 min hard TTL
- **No stale ladder** — dropped after experiment with drastic-location/stale-refresh ladder added complexity without UX benefit. Single TTL = simpler state, no cached-vs-live dual sources.

## Permission states

- **idle:** no fetch in progress, displaying current weather (or empty state)
- **locating:** `navigator.geolocation.getCurrentPosition()` in flight
- **fetching:** Open-Meteo request in flight
- **denied:** user blocked GPS — show "Location Access Blocked" prompt with reload button

## Refresh behavior

- **Manual:** refresh button calls `requestLocation()` which restarts the GPS → fetch flow
- **No auto-refresh** — weather doesn't move fast enough to warrant background polling for a glanceable view

## Why remote functions

Weather query is identical SSR + client. SvelteKit remote functions (`*.remote.ts`) collapse the dual implementation into one function callable from both contexts. Cleaner than a `+page.server.ts` + parallel client function pair.
