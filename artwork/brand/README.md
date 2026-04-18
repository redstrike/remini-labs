# Brand

Remini Labs brand identity — logo mark, color, and typography guidelines.

## Files

| File                 | What                                    | Authoritative?                   |
| -------------------- | --------------------------------------- | -------------------------------- |
| `logo-mark-2560.png` | The primary "R" monogram, 2560×2560 PNG | **Yes** — single source of truth |

## Provenance

The logo mark was:

1. Initially generated with **Gemini 3.1 Pro** as a 640×640 raster in early 2026
2. Upscaled 4× via **Real-ESRGAN** (`realesrgan-x4plus` model) to 2560×2560
3. Chosen as the master after a perceptual A/B against a bicubic-upscaled
   variant — the AI-upscaled version read as crisper and more brand-appropriate
   when zoomed, even though a fidelity-to-source metric favored bicubic
   (documented reasoning: source was itself AI-generated and imperfect, so
   fidelity-to-source was not the right optimization target)

The original 640 and bicubic variants were discarded; this 2560 is now the
canonical master.

## Known gap

There is **no vector (SVG) source** for the logo mark. All derivatives are
rasterized from this PNG. Future work: commission or redraw the mark as SVG
for truly resolution-independent scaling. Until then, 2560 is "high enough"
for any realistic use case (print poster at 300 DPI ≈ 21 cm square).

## Usage rules (brand guidelines)

- **Clear space**: minimum 1× the width of the R's stem around the mark
- **Backgrounds**: designed for dark backgrounds (`#0a0a0a` OLED black); use
  `#E8318A` brand magenta as an accent
- **Minimum size**: don't display smaller than 16×16 — details collapse
- **Do not**: warp, stretch non-uniformly, recolor the gradient, add shadows
  or outer glows, place on photos without a darkening overlay
- **Accent color**: `#E8318A` (magenta) — used in Safari pinned-tab tint,
  the brand-tile accent ring on the default OG card, text-selection in
  `app.html`, and the "R" wordmark in the shell

## Derivatives

Runtime icon PNGs are regenerated from this master by:

```bash
pnpm gen:brand-assets
```

This reads `logo-mark-2560.png`, produces three Lanczos3-downscaled derivatives
in `static/`, and writes the files that the site actually serves:

- `static/favicon.png` (192×192) — PWA minimum + browser tab
- `static/favicon-512.png` (512×512) — PWA install dialog + Lighthouse
- `static/apple-touch-icon.png` (180×180) — iOS home screen

See `scripts/gen-brand-assets.mts` for the generator implementation.

## Color palette (shared with DESIGN.md)

| Token        | Hex       | Role                                              |
| ------------ | --------- | ------------------------------------------------- |
| Brand accent | `#E8318A` | Magenta — primary brand highlight                 |
| Background   | `#0a0a0a` | OLED near-black — primary surface                 |
| Theme color  | `#08080c` | Near-black with slight blue tint — browser chrome |

Full token list lives in `DESIGN.md` and `src/app.css`. Brand accent is
imported into the default OG card as an accent ring and used as the Safari
pinned-tab tint in `app.html`.
