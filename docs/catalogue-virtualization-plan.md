# Catalogue — Virtualization & Mobile Scroll Performance — Plan

**Status:** Proposed · *documentation only*
**Scope:** `/designer/catalogue` Grid view, Stack view, Group View; mobile (`pointer:coarse`) scroll FPS + memory
**PR intent:** Documentation only. No runtime code, dependencies, migrations, or UI changes in this PR.
**Predecessors:** [`catalogue-infinite-scroll-plan.md`](./catalogue-infinite-scroll-plan.md) (§14.8, §15 — virtualization explicitly deferred to "a separate plan doc") · [`catalogue-linear-performance-optimization-plan.md`](./catalogue-linear-performance-optimization-plan.md) (§8.4 image-loading controls)

---

## 1. Executive summary

Infinite scroll fixed the **network** side of large catalogues (cursor pagination, 50 rows/page, server-side filters). It did **not** fix the **DOM** side: every page that streams in is *accumulated and kept mounted*. After scrolling through a few hundred families, the page holds hundreds-to-thousands of card subtrees — each with an `<img>`, a ThumbHash canvas, overlay buttons, and hover/transition styles — and never lets any of them go.

On desktop this degrades gracefully. **On mobile it does not**: momentum scrolling has to composite an ever-growing layer tree, image-decode memory climbs until mobile Safari/Chrome evict or reload decoded bitmaps mid-scroll, and frame budget (~16ms, realistically ~8ms on mid-tier Android) is blown well before the user reaches the bottom of a busy group.

The fix is to stop rendering what isn't on screen. There are two tiers, and **they are not mutually exclusive** — the first is a near-zero-cost CSS win that should land regardless of whether we adopt a virtualization library:

1. **Tier 1 — render-skipping (no dependency):** `content-visibility: auto` + `contain-intrinsic-size` on off-screen cards / group sections. The browser skips layout, paint, and (crucially) image decode for cards outside the viewport, while the DOM nodes still exist for find-in-page, scroll anchoring, and a11y.
2. **Tier 2 — true windowing (one dependency):** mount only the visible window of cards + a small overscan, recycling nodes as the user scrolls. This is what the infinite-scroll plan named as the eventual solution.

**Recommendation:** ship Tier 1 first (cheap, reversible, measurable), measure on real mid-tier mobile hardware, and only commit to Tier 2 if Tier 1 doesn't get Stack/Grid to a stable 60fps past ~500 cards.

| Phase | Theme | User-visible outcome | Risk |
| --- | --- | --- | --- |
| V0 | Measure + baselines | We know scroll FPS / memory / decoded-image count before changing anything | Low |
| V1 | `content-visibility` render-skipping | Off-screen cards stop costing paint/decode; mobile scroll smooths out | Low |
| V2 | Image-loading discipline | Below-fold images stay `lazy`/`async`; decode pressure drops | Low |
| V3 | True windowing (Stack first) | Stack stays 60fps past 500+ cards; memory flat regardless of depth | Medium |
| V4 | Windowing for Grid + Group View | Same guarantees for the grouped responsive grid and full-scope views | Medium/High |

---

## 2. Current rendering findings

### 2.1 Grid view keeps every loaded card mounted

`CatalogueContent.tsx` (grid branch, lines ~260-321) renders one `<section>` per group and maps **all** families in that group into `CatalogueFamilyCard`:

```tsx
{Object.entries(groupedFamilies).map(([groupName, families]) => (
  <section key={groupName} className="catalogue-section">
    …
    <div className="catalogue-grid catalogue-grid--families" data-density={…}>
      {families.map((family) => (
        <CatalogueFamilyCard key={family.id} family={family} … />
      ))}
    </div>
  </section>
))}
<CatalogueScrollSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
```

`groupedFamilies` is derived from the **accumulated** paginated screenshots — `use-catalogue-data.ts` appends each `loadMore()` page (`PAGE_SIZE = 50`) onto the existing list and never drops earlier ones. So mounted-card count grows monotonically with scroll depth. There is no upper bound short of `hasMore` flipping false.

The grid itself is a responsive CSS grid (`catalogue-families.scss:53`):

```scss
.catalogue-grid--families { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
```

with `data-density` 2x / 4x overrides. **Column count is therefore viewport- and density-dependent**, which matters for Tier 2 (a windowing solution has to know columns-per-row to map a flat index to a row; see §5.3).

### 2.2 Stack view has the same unbounded mount — and was already flagged

`CatalogueStackView.tsx` mirrors the grid: per-group `<section>`, then `families.map(... <CatalogueStackCard/>)`. The infinite-scroll plan already called this out as the canonical virtualization target:

> §13 release gate: *"Stack view stays 60fps scrolling past 500 cards (requires M5 + later virtualization)."*
> §14.8: *"Past 500 mounted cards, scroll slows regardless of network. `react-virtuoso` grouped mode is the intended solution; separate plan doc."*

This is that doc. Stack is the **best first target** for true windowing: single-column, uniform-ish row height, simplest index→row mapping.

### 2.3 Group View and Canvas Gallery render the full unpaginated scope

`CatalogueContent.tsx` routes `sortBy === 'name-asc'` to `CatalogueGroupView`, fed by `fullScopeScreenshots`. The full-scope hook (`use-catalogue-full-scope.ts`) pages in `SCREENSHOT_PAGE_SIZE = 1000` chunks and accumulates the whole catalogue. `CatalogueGroupView` then summarizes into one card per group (so card count is bounded by *group* count, not screenshot count — lower risk), but the Canvas Gallery and any full-scope card surface inherit the full set. These are secondary targets, addressed in V4.

### 2.4 Scroll happens at the window level

`CatalogueScrollSentinel` constructs its `IntersectionObserver` with **no `root`** (default = viewport) and `rootMargin: '400px'`. So the catalogue scrolls the document/window, not an inner `overflow:auto` container. This is a real constraint on Tier 2: the windowing library must support **window-scroll mode** (Virtuoso `useWindowScroll`, TanStack Virtual with `getScrollElement: () => document.scrollingElement`). A library that assumes a fixed-height inner scroller would force a layout change.

### 2.5 Each card is decode- and composite-heavy

`CatalogueFamilyCard` / `CatalogueStackCard` each render a `ThumbHashImage` (decodes a blurhash placeholder *and* the full image), absolutely-positioned overlay controls, a hover `transform: translateY(-2px)` transition, and `overflow:hidden` rounded corners. None of this is wrong — but multiplied by hundreds of off-screen instances it is pure waste: the browser still decodes those images and keeps their layers around. `content-visibility` (V1) skips exactly this work for off-screen cards.

### 2.6 No virtualization primitive exists yet

`designer/package.json` has React 19, `react-router-dom`, `thumbhash`, `idb-keyval` — **no** `react-window`, `react-virtuoso`, or `@tanstack/react-virtual`. Tier 2 means a new dependency, which under [`CLAUDE.md`](../CLAUDE.md) is a "stop and propose" decision (see §7 decision points). Tier 1 needs no dependency at all.

---

## 3. Performance goals & success metrics

Capture baselines (V0) on the **same mid-tier device** before/after each phase. Suggested target device: a real Android phone in the "moto g / Pixel a-series" class, or Chrome DevTools 4× CPU throttle as a proxy.

| Metric | Current expectation | Target | How to measure |
| --- | --- | --- | --- |
| Stack scroll FPS, 500+ cards loaded | Drops well below 60; jank on fling | ≥55fps sustained fling | DevTools Performance, "Frames" lane / `requestAnimationFrame` delta logger |
| Grid scroll FPS, 500+ cards (mobile 1–2 col) | Drops on fling | ≥55fps sustained | same |
| Mounted card DOM nodes at scroll depth N | Grows linearly with N | Bounded (≈ visible + overscan) after V3/V4 | `document.querySelectorAll('.catalogue-family-card').length` |
| Decoded image memory at depth | Climbs until eviction/reload | Flat after V1 (decode skipped off-screen) | DevTools Memory / `Performance.memory` (Chrome) |
| Long tasks during fling | Frequent >50ms | 0 tasks >50ms on the scroll path | Performance profile / `PerformanceObserver('longtask')` |
| Scroll-position stability on back-nav | Often resets to top | Restored or graceful | manual + `history.scrollRestoration` |

Budget (mirrors the Linear-perf doc §3):

```text
- Frame budget on the scroll path: <=8ms work per frame on mid-tier mobile
- Off-screen cards: 0 image decodes, 0 paint
- No layout thrash on density/orientation change (recompute columns once, not per card)
```

---

## 4. V0–V2 — the low-risk, no-dependency tier

### 4.1 V0 — measurement harness

Reuse the `perf-marks.ts` helper proposed in the Linear-perf doc §4.1. Add a tiny dev-only FPS sampler and a node counter:

```ts
// dev-only: log rolling FPS during scroll
let last = performance.now(), frames = 0;
function tick(now: number) {
  frames++;
  if (now - last >= 1000) {
    console.info(`[scroll] ${frames} fps · cards=${document.querySelectorAll('.catalogue-family-card').length}`);
    frames = 0; last = now;
  }
  requestAnimationFrame(tick);
}
```

Capture the table in §3 for Grid + Stack at 0 / 250 / 500 / 1000 cards, cold and warm.

### 4.2 V1 — `content-visibility` render-skipping

The single highest-leverage, lowest-risk change. Add to the off-screen-eligible card / row:

```scss
.catalogue-family-card,
.catalogue-stack__list > * {
  content-visibility: auto;
  // Reserve space so the scrollbar + scroll anchoring stay stable while
  // the card is skipped. Tune to the real rendered card heights per density.
  contain-intrinsic-size: auto 320px; // grid card
}
```

What it buys: the browser skips layout/paint/**image decode** for any card outside the viewport (plus a viewport-ish margin), while keeping the node in the DOM. Effectively "free virtualization for paint" with zero JS and no node recycling.

Caveats to verify during implementation (these are why it's V1, not a one-liner merge):

- **`contain-intrinsic-size` accuracy.** If the reserved size is wrong, the scrollbar thumb jumps as cards resolve. Stack cards are near-uniform → easy. Grid cards vary by aspect ratio → may need a per-density value or `auto <last-rendered-size>` (the `auto` keyword lets the browser remember the last real size).
- **Find-in-page / anchor scrolling.** `content-visibility: auto` content is searchable (unlike `hidden`), but deep-linking to an off-screen card (`?shot=…`) must still `scrollIntoView` correctly — test the search-result jump path.
- **Sticky group headers / coverage bars** must stay outside the skipped subtree.

### 4.3 V2 — image-loading discipline

Pair with the Linear-perf doc §8.4. Ensure `ThumbHashImage` passes `loading="lazy"` + `decoding="async"` for everything below the first visible row, and only the first row gets `fetchPriority="high"`. With V1 in place, off-screen `<img>`s won't decode anyway — but correct `loading`/`decoding` also prevents the *network* fetch storm when a big page streams in.

If V1 + V2 hit the §3 targets on the test device, **stop here** — we avoid a new dependency entirely. The infinite-scroll plan's "60fps past 500 cards" gate may well be satisfiable without true windowing once paint/decode are skipped.

---

## 5. V3–V4 — true windowing (only if V1/V2 fall short)

### 5.1 Why a library, and which

Hand-rolling correct windowing (variable heights, window-scroll, grouped sections, scroll restoration, dynamic measurement) is a deceptively large surface. The two credible libraries:

<table>
<tr><th>Option</th><th>Fit for this app</th><th>Cost</th></tr>
<tr>
<td><strong>react-virtuoso</strong> (recommended)</td>
<td>First-class <code>GroupedVirtuoso</code> (matches our per-group sections) and <code>VirtuosoGrid</code> (matches the responsive grid). Supports <code>useWindowScroll</code> (§2.4). Measures variable heights automatically — no manual row-height math. Built-in <code>endReached</code> can replace the sentinel.</td>
<td>~1 dep, ~15kb gz. Less manual code.</td>
</tr>
<tr>
<td><strong>@tanstack/react-virtual</strong></td>
<td>Headless, tiny, very flexible. But grouped + responsive-grid + window-scroll all become <em>our</em> code: we compute columns-per-row, map flat index → row, handle remeasure on density/orientation change. More control, more rope.</td>
<td>~1 dep, smaller runtime, much more app code.</td>
</tr>
<tr>
<td><strong>Hand-rolled</strong></td>
<td>No dep, but re-implements measurement/overscan/restoration. Not recommended given the grouped + variable-height + window-scroll combination.</td>
<td>0 deps, high code + maintenance.</td>
</tr>
</table>

**Recommendation: react-virtuoso**, specifically because the catalogue is *already* a grouped, variable-height, window-scrolled list — exactly Virtuoso's sweet spot, and exactly what the infinite-scroll plan anticipated ("react-virtuoso grouped mode is the intended solution").

### 5.2 V3 — Stack view first (single column)

Stack is the cleanest target: one column, near-uniform rows, already grouped.

```text
GroupedVirtuoso (useWindowScroll)
  groupCounts   = Object.values(groupedFamilies).map(f => f.length)
  groupContent  = (i) => <StackGroupHeader …/>     // existing section title + select-all
  itemContent   = (flatIndex) => <CatalogueStackCard …/>
  endReached    = onLoadMore                        // replaces CatalogueScrollSentinel
```

Notes:
- The flat item index must map back to `(group, familyWithinGroup)` — derive a flattened array once per `groupedFamilies` change (`useMemo`).
- Keep `onLoadMore` semantics identical; `endReached` fires near the bottom just like the 400px sentinel.
- Preserve `selected` / select-all-group behavior in `groupContent`.

### 5.3 V4 — Grid + responsive columns

The grid is harder because columns vary with viewport width and `data-density`. Two sub-options:

- **`VirtuosoGrid`** — handles responsive item flow itself; we keep the CSS grid styling via its `listClassName`/`itemClassName`. Grouping across a grid is the rough edge: `VirtuosoGrid` is flat, so per-group section headers need either (a) one `VirtuosoGrid` per group (simple, but many small virtualizers) or (b) collapsing to a single flat grid with inline header "items" that span the row.
- **Row-windowing** — compute `columnsPerRow` from a `ResizeObserver` on the grid + the active density, chunk families into rows, and virtualize **rows** in a `GroupedVirtuoso`. Each virtual item is a full grid row. This keeps one virtualizer per group and exact control, at the cost of recomputing chunks on resize/density change.

Recommendation for V4: **row-windowing inside `GroupedVirtuoso`** — it reuses the V3 grouped scaffold, keeps headers trivial, and the only added complexity is the `columnsPerRow` calc (one `ResizeObserver`, recompute on width/density change, not per card).

### 5.4 Cross-cutting concerns for Tier 2

- **Window scroll** is mandatory (§2.4) — do not introduce an inner scroll container, it would break the existing toolbar/header layout and the pull-to-refresh + scroll-to-top affordances (`catalogue-pull-to-refresh.scss`, `catalogue-scroll-top.scss`).
- **Dual-scope screenshot state** ([`CLAUDE.md`](../CLAUDE.md) "Dual-scope screenshot state"): virtualization changes *what's mounted*, not the data arrays. Mutations must still update both `screenshots` and `fullScopeScreenshots` via the existing helpers — windowing must not become an excuse to skip a scope sync, or recycled cards will show stale data when scrolled back into view.
- **Lightbox open / deep-link jump** must scroll the target card into view even when it starts unmounted — Virtuoso exposes `scrollToIndex`; wire the `?shot=` / search-result path to it.
- **Scroll restoration on back-nav** (infinite-scroll plan §14.5, M7) becomes tractable with Virtuoso's `restoreStateFrom` / `initialTopMostItemIndex`. Out of scope for V3 but worth noting.
- **Selection / bulk bar**: "select all visible" semantics (infinite-scroll plan §14.7) are unaffected by windowing — selection is by id in a `Set`, independent of mount state.

---

## 6. Risk register

| Risk | Where | Mitigation |
| --- | --- | --- |
| `contain-intrinsic-size` wrong → scrollbar jump | V1 | Use `auto <size>` so browser remembers real size; tune per density; QA on Stack (uniform) first |
| Deep-link / search jump fails to off-screen card | V1/V3 | Test `?shot=` and search-result open after each phase; use `scrollToIndex` in Tier 2 |
| New dependency (react-virtuoso) | V3/V4 | Gate behind explicit approval (§7); Tier 1 ships value with zero deps first |
| Grouped + responsive grid edge cases | V4 | Prefer row-windowing in `GroupedVirtuoso`; one `ResizeObserver`, recompute columns on width/density only |
| Recycled card shows stale data | V3/V4 | Honour dual-scope sync rule; never read from a closure-captured stale family |
| Window-scroll mode regressions (pull-to-refresh, scroll-to-top) | V3/V4 | Keep document-level scroll; integration-test both affordances |
| Over-engineering before measuring | All | V0 baselines gate every later phase; stop at V2 if targets met |

---

## 7. Decision points (require explicit approval before coding)

1. **Tier scope.** (a) Ship Tier 1 (`content-visibility` + image discipline) only and re-measure; (b) commit to Tier 2 windowing now. *Recommendation: (a) first — it's reversible and may suffice.*
2. **Library, if Tier 2.** (a) react-virtuoso; (b) @tanstack/react-virtual; (c) hand-rolled. *Recommendation: (a).*
3. **Grid windowing strategy, if Tier 2.** (a) row-windowing in `GroupedVirtuoso`; (b) `VirtuosoGrid` per group. *Recommendation: (a).*
4. **endReached vs sentinel.** Replace `CatalogueScrollSentinel` with Virtuoso `endReached`, or keep the sentinel and let Virtuoso handle only mounting. *Recommendation: replace, to avoid two load-more triggers.*

---

## 8. Definition of done

```text
- Baselines captured (V0) for Grid + Stack at 0/250/500/1000 cards on a mid-tier device.
- Off-screen cards perform no paint or image decode (V1 verified in a profile).
- Below-fold images are lazy/async; only first row is high priority (V2).
- If Tier 2 ships: mounted-card count is bounded by visible+overscan regardless of scroll depth;
  Stack and Grid sustain >=55fps on fling past 500 cards on the test device.
- Deep-link (?shot=) and search-result jumps still scroll to and open the target card.
- Dual-scope mutations still update both screenshot arrays; recycled cards never render stale data.
- Pull-to-refresh and scroll-to-top still work (window-scroll preserved).
- Every phase has before/after numbers in its PR description.
```

The product test: a reviewer can fling through a 1000-screenshot group on a phone and it stays smooth, while the data, deep-links, and selection behave exactly as before.
