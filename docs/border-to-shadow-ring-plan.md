# Borders → shadow rings — plan & rollout map

> **Status:** parked / documented for later pickup (filed 2026-06-15).
> Supersedes the older "dimensional border experiment" note by adding a full
> audit, a reusable mixin system, two look variants, and a per-file rollout map.
> Backing memory: [`parked_dimensional_border_shadows`](../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_dimensional_border_shadows.md).

## Why

Flat `border: 1px solid …` is the cheap default. Replacing the **decorative**
borders with a `box-shadow` "ring" buys real polish:

- **No layout reflow on state change.** `box-shadow` is outside the box model, so
  hover/focus borders stop nudging content by 1px. This is the single biggest win.
- **Layerable depth.** A ring can stack with an inset top highlight to fake a
  top-lit bevel — sharper edges without more visual weight.
- **Crisper on dark.** Rings sit on top of the element; no subpixel seams where
  bordered boxes abut.

## Scope decision — NOT "remove all borders"

The audit (below) found **628 in-scope visible borders across 53 SCSS files**.
Converting *all* of them is the wrong move. The split:

<table>
<tr><th>Bucket</th><th>Count</th><th>Action</th></tr>
<tr><td>Full-box outlines (<code>border: 1px solid …</code>)</td><td>374</td><td>✅ convert → <code>ring()</code></td></tr>
<tr><td><code>border-color:</code> focus/hover mutations</td><td>234</td><td>✅ convert → <code>ring($color,$w)</code> — biggest no-reflow win</td></tr>
<tr><td>Directional dividers (<code>border-top/bottom</code>)</td><td>79</td><td>⛔ leave — single-edge, load-bearing</td></tr>
<tr><td>Dashed / dotted borders</td><td>13</td><td>⛔ leave — <code>box-shadow</code> can't render dashed</td></tr>
<tr><td><code>border: 1px solid transparent</code> (layout spacers)</td><td>5</td><td>⛔ leave — exist to reserve box space; converting causes reflow</td></tr>
</table>

**The three traps** — converting these breaks layout or look:
1. **Directional dividers** are all-four-sides as a ring; a single-edge `0 1px 0 0`
   shadow is fiddly and these are load-bearing (every row/section shifts if wrong).
2. **Dashed borders** (drop zones, annotation boxes, empty-state guides) — no
   `box-shadow` equivalent. Must stay borders.
3. **Transparent spacer borders** reserve box width; a shadow won't, so hover
   states would reflow.

## The ring system (to build)

A SCSS mixin defined **once** (fixes today's 16.5% tokenisation rate — only 104 of
~628 borders use the `$border` token; the rest are hardcoded hex/rgba). Every call
site then inherits future tweaks for free.

```scss
// proposed — designer/src/styles/_rings.scss (or alongside the $border token in part-1-base)
@mixin ring($color: $border, $w: 1px) {
  box-shadow: 0 0 0 $w $color;
}
@mixin ring-raised($color: $border, $w: 1px) {
  // outer ring + inset top highlight = top-lit bevel
  box-shadow: 0 0 0 $w $color, inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

Three call shapes cover ~95% of in-scope cases:

| Was | Becomes |
|---|---|
| `border: 1px solid $border;` | `@include ring;` |
| `:focus { border-color: $accent; }` | `:focus { @include ring($accent, 2px); }` |
| card outline (dimensional) | `@include ring-raised;` |

> ⚠️ **Merge, don't replace** at sites that already have a `box-shadow` (hover
> lifts, focus glows). Two `box-shadow` declarations don't stack — the ring must be
> appended to the existing list, not overwrite it. This is the main per-site risk.

## The two looks (decide at pickup — user wants both documented)

### Look A — Subtle (ring only)

Just the 1px outer ring, no highlight. Cleanest, closest to today, lowest chance of
reading "busy" on dark surfaces.

```
╭──────────────╮
│   content     │   box-shadow: 0 0 0 1px <ring>
╰──────────────╯
```

- Dark: `0 0 0 1px rgba(63,63,70,0.9)` (maps to today's `$border` #27272a-ish)
- Light: `0 0 0 1px rgba(0,0,0,0.08)`

### Look B — Dimensional (ring + top highlight)

Outer ring **plus** a faint inset white top edge = the parked top-lit "raised"
look. More polish, more opinionated.

```
╭──────────────╮   ← inset white top edge
│··············│
│   content     │   outer ring
╰──────────────╯
```

- **Dark:** `box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(63,63,70,0.9), 0 1px 0 rgba(0,0,0,0.4);`
- **Light:** `box-shadow: inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.04);`

> White inset at full opacity is too harsh on dark — keep it at ~6%. Dark themes
> have less contrast headroom, so the outer shadow needs to be more pronounced.

**Recommendation:** Look A everywhere as the baseline; Look B reserved for raised
surfaces (cards, the upload button, the dock) where the bevel earns its keep.

## Rollout map — where these get implemented

Build the mixin first, then fan out **batch by batch**, each its own small,
reviewable PR. Files grouped by area, ordered by gain-per-risk (focus-state-heavy
and card surfaces first; divider-heavy files last and partial-only).

### PR 0 — foundation
- Add `ring()` / `ring-raised()` mixin + centralise the `$border` token (today it's
  re-declared in 4 files: `part-1-base`, `changelog-page`,
  `catalogue-labeling-studio`, `catalogue-group-coverage`).

### Batch 1 — cards & core (highest gain, the "pilot" surface)
| File | Visible borders |
|---|---|
| `designer-sections/part-4-catalogue-core.scss` | 23 |
| `catalogue-family-preview.scss` | 23 |
| `catalogue-families.scss` | — |
| `catalogue-family-overlays.scss` | — |

### Batch 2 — lightbox & annotations
| File | Visible borders |
|---|---|
| `catalogue-lightbox-annotations.scss` | 28 |
| `catalogue-lightbox-crop.scss` | — *(skip dashed crop guides)* |
| `catalogue-gallery-zoom.scss` | — |

### Batch 3 — modals & panels
| File | Visible borders |
|---|---|
| `designer-sections/part-5-catalogue-modal.scss` | 18 |
| `catalogue-search-modal.scss` | — |
| `catalogue-family-details-modal.scss` | — |
| `catalogue-quick-panel.scss` | — |
| `welcome-modal.scss` | — |
| `catalogue-share.scss` | 17 |
| `catalogue-members.scss` | — |

### Batch 4 — toolbar, sidebar, chrome
| File | Visible borders |
|---|---|
| `catalogue-team.scss` | 26 |
| `catalogue-views.scss` | 30 *(audit for dividers first)* |
| `catalogue-sidebar.scss` | — |
| `catalogue-header-menu.scss` | — |
| `catalogue-toolbar-customization.scss` | — |
| `catalogue-chip-strip.scss` | — |
| `catalogue-magnified-dock.scss` | — |

### Batch 5 — videos, group detail, misc surfaces
| File | Visible borders |
|---|---|
| `catalogue-videos.scss` | 44 *(divider-heavy — partial only)* |
| `catalogue-group-detail.scss` | — |
| `catalogue-group-view.scss` | — |
| `catalogue-group-coverage.scss` | — |
| `designer-sections/part-3-flow.scss` | 18 |
| `catalogue-elements.scss` | — |
| `catalogue-links.scss` | — |
| remaining ~25 lower-count files | — |

### Inline TSX (2 files, 4 declarations) — handle with the relevant batch
- `CatalogueQuickUploadPanel.tsx` — 2 inline `border:` (drop-zone tile L469, preview L498). *Drop-zone tile is a dashed-ish spacer — verify before converting.*
- `CatalogueFamilyLightbox.tsx` — 2 dynamic `borderColor: groupColor` (L1394, L1774). These are runtime group colours; convert to an inline `boxShadow` ring only if the static SCSS around them moves too.

## Pre-flight risks to flag before any code (no-functionality-leaks rule)

1. **Hover reflow disappearing** changes vertical rhythm on cards that previously
   grew 1px on hover — re-check spacing after conversion.
2. **Focus-visible a11y** — the ring must stay ≥2px and high-contrast; don't let the
   accessibility ring get thinner than today's `border-color` focus.
3. **`overflow: hidden` clipping** — outer-ring shadows get clipped by parents that
   borders weren't affected by. Check each card/modal container.
4. **Double box-shadow merges** — see the ⚠️ above; the most common per-site bug.

## Audit appendix (2026-06-15)

- 628 in-scope visible borders, 53 SCSS files, 2 TSX files.
- 600 `border-radius` and 121 `border: none/0` resets — **out of scope**.
- Token: `$border` (#27272a) used 104× (16.5% of borders); the rest hardcoded.
- No central CSS custom property for borders (lone exception: `--ring` in
  `auth-bokeh.scss`).
- Top-concentration files: `catalogue-videos` (44), `catalogue-views` (30),
  `catalogue-lightbox-annotations` (28), `catalogue-team` (26),
  `part-4-catalogue-core` (23), `catalogue-family-preview` (23).
