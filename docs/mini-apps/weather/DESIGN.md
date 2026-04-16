# Weather — Design

App-specific design for the Weather mini-app. For shell defaults, see the root `DESIGN.md`.

## Identity

- **Purpose:** Glanceable local weather — temperature, condition, feels-like, location.
- **Mood:** Watch-face simplicity. Single card. No forecast grids, no atmospheric overlays.
- **Room background:** Inherits shell `--rl-color-bg` for the page; the inner "device" preview frame paints its own gradient (see Tokens below).

## Tokens — weather extensions

Declared in `src/routes/weather/weather.css`, applied to `.weather-root` (set by `+layout.svelte`). Visible only to descendants via CSS variable inheritance.

### Sandbox device frame

The current weather page uses a "preview device" framing — a phone/tablet/laptop toggle wraps the inner card so the user can preview responsive behavior. The device frame paints a deep blue-gray gradient distinct from the shell bg.

| Token                            | Value     | Use                        |
| -------------------------------- | --------- | -------------------------- |
| `--rl-color-weather-device-from` | `#0d1117` | Top stop (180deg gradient) |
| `--rl-color-weather-device-mid`  | `#111827` | Mid stop at 40%            |
| `--rl-color-weather-device-to`   | `#0f172a` | Bottom stop                |

### Condition accents

The accent is a 3px left border on the card + tinted temperature number. Reflects weather mood without sacrificing readability.

| Token                            | Value     | Condition                  |
| -------------------------------- | --------- | -------------------------- |
| `--rl-color-weather-clear-day`   | `#c9a84c` | Clear (day) — gold         |
| `--rl-color-weather-hot`         | `#c47a4d` | Hot (>35°C) — amber        |
| `--rl-color-weather-clear-night` | `#6b8aad` | Clear (night) — steel blue |
| `--rl-color-weather-cloud`       | `#8a8a96` | Cloudy — gray              |
| `--rl-color-weather-rain`        | `#5b8fb9` | Rain — blue                |
| `--rl-color-weather-snow`        | `#9ab8d4` | Snow — ice                 |
| `--rl-color-weather-storm`       | `#8b7bb8` | Storm — purple             |

The `getAccentColor()` function in `+page.svelte` returns CSS variable references like `'var(--rl-color-weather-storm)'` — bound via `style:--accent={accent}` on the card.

## Card treatment

- **Background:** shell `--rl-color-surface`
- **Border:** shell `--rl-color-border`, `--rl-radius-lg`
- **Left accent:** 3px solid `var(--accent, var(--rl-color-text-subtle))`
- **Width cap:** `max-width: 440px` (iPhone 17 Pro Max class). Phones fill their container; tablets/laptops/desktops stay at big-phone width instead of stretching.
- **No frosted glass, no backdrop-blur** — kept simple after a previous experiment that hurt readability on mobile/daylight.

## Typography

- **Temperature:** `var(--rl-font-mono)`, 56px (responsive — see container queries below), 700 weight, `letter-spacing: -1.5px`, tinted by accent
- **Temperature unit:** `var(--rl-font-mono)`, 22px, 500 weight, faint
- **Condition:** sans, 16px (`--rl-text-md`), 600
- **Feels-like:** sans, 13px, subtle
- **Location:** sans, 13px, 500, faint

## Responsive layout (container queries on `.weather-device`)

Card switches between single-column (phone) and two-column (tablet+) layouts as the inner device frame width crosses thresholds.

| Container width | Temp size | Icon size | Card padding | Grid layout                                             |
| --------------- | --------- | --------- | ------------ | ------------------------------------------------------- |
| Base (< 720px)  | 48px      | 48px      | 20px         | `'info icon' / 'stats stats'` (row stats)               |
| ≥ 720px         | 56px      | 64px      | 28px         | `'info icon' / 'info stats'` (column stats)             |
| ≥ 1280px        | 72px      | 96px      | 32px         | `'info icon' / 'info stats'` (column stats), max 1600px |

## Location label priority

Ward > District > City > lat/lng. Prefer two tokens ("Ward, District" or "District, City"); degrade to a single token when adjacent level is missing.

GPS-resolved `gpsCity` wins over IP-derived `ipCity`. **Approximate badge** (with ISP) is shown only while on the IP fallback path, even after reverse-geocode resolves a precise label.

## States

- **Loading skeleton:** pulse opacity 0.4–1.0 (2s infinite). Card has `--accent: var(--rl-color-border)` to mute the border-left.
- **Permission prompt:** centered, `--rl-space-2xl` `--rl-space-lg` padding, surface bg
- **Permission denied state:** uses `--rl-color-warning` (amber) for icon + warning copy

## No animations beyond functional

No atmospheric overlays, no CSS particles, no animated icons. Motion is reserved for functional transitions (spinner, pulse dot).

## Data display rules

- **Temperature:** rounded integer, accent-colored
- **Feels-like:** rounded integer
- **Wind:** `km/h` suffix, mono font
- **Humidity:** `%` suffix, mono font
