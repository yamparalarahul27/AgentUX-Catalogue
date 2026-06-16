# Catalogue — Perf & Virtualization — Plan

> **Status:** Draft. Companion to [`catalogue-infinite-scroll-plan.md`](./catalogue-infinite-scroll-plan.md)
> (M1–M4 + M6 shipped, M5 + M7 deferred) which explicitly defers virtualization
> to a separate plan doc — *this is that doc, plus the perf wins adjacent to it
> that the original plan didn't consider*.

**Scope:** Stack / Grid / Gallery / Group / Canvas Gallery views, image
delivery, bundle splits, scroll polish.
**Out of scope:** Network-layer changes (already solved by the infinite-scroll
plan), full-text search rewrites, RLS/auth.

---

## 1. Verdict on the original plan

The infinite-scroll plan ([`catalogue-infinite-scroll-plan.md`](./catalogue-infinite-scroll-plan.md))
named `react-virtuoso` grouped mode as the intended solution and gated it
behind "Stack view past 500 mounted cards." Two things have changed since
that was written:

1. **Pagination is live.** Users now accumulate ~50–200 cards in state per
   typical session, not the full 5000. The 500-card threshold rarely fires.
2. **`content-visibility: auto` is broadly available** (Safari shipped late
   2023). The original plan never considered it — it's a much bigger lever
   than the virtualization-first approach acknowledged.

The doc's pick is *defensible but not best-in-class for 2026*. This plan
re-ranks: lighter, broader wins first; React virtualization only if those
aren't enough.

---

## 2. Tier 1 — biggest leverage, smallest cost

Do these before reaching for a virtualization library. Each applies to
*every* view at once (Grid / Stack / Gallery / Group / Canvas).

### 2.1 `content-visibility: auto` on catalogue cards

One CSS rule. Browser skips rendering off-screen cards entirely. Pairs
intrinsic size hint so the browser can reserve scroll-height without
laying out the card.

```scss
.catalogue-card,
.catalogue-stack__card,
.catalogue-gallery-cell,
.catalogue-canvas-cell {
  content-visibility: auto;
  // Estimated card height — Grid ≈ 220px, Stack ≈ 320px, Gallery ≈ 180px.
  // Picks the closest to keep scroll-height accurate before paint.
  contain-intrinsic-size: 0 220px;
}
```

**Expected:** 30–80% paint-time reduction on long lists. No deps, no
component refactor, no scroll-container takeover.

**Caveats:**

- Scroll restoration: browsers re-paint cards as they enter the viewport.
  Anchor-link jumps may land before intrinsic-size hint kicks in — measure
  with real data.
- `contain: layout` (implied by `content-visibility`) creates a new
  containing block — any `position: absolute` children of the card must be
  audited.
- Disable on the card currently in the lightbox so its child cards
  (carousel filmstrip) don't get clipped.

### 2.2 Supabase image transformations

Catalogue's real bottleneck is image decode, not React reconciliation.
Every card today downloads the full-resolution screenshot — typically
1500–3000 px wide for a thumbnail that renders at ~280 px.

Supabase Storage's render endpoint supports inline transforms:

```ts
// Today
const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

// Better — width-resized + quality-degraded thumbnail
const url = supabase.storage.from(bucket).getPublicUrl(path, {
  transform: { width: 600, quality: 75, resize: 'contain' },
}).data.publicUrl;
```

Cut per-card bytes by 70–90%. For the lightbox, switch back to the
full-resolution URL.

**Pair with `<picture srcset>`** for responsive variants:

```html
<picture>
  <source srcset="…?width=300 1x, …?width=600 2x" media="(max-width: 700px)" />
  <source srcset="…?width=600 1x, …?width=1200 2x" />
  <img src="…?width=600" />
</picture>
```

### 2.3 `fetchpriority="low"` + consistent `decoding="async"`

The Canvas Gallery backlog item ([`backlog.md` line 79](./backlog.md#L79))
already calls out missing `decoding="async"`. Extend that audit:

```html
<img
  loading="lazy"
  decoding="async"
  fetchpriority="low"     <!-- only above-the-fold cards get "auto" -->
  ...
/>
```

`fetchpriority="low"` lets the browser prioritize *visible* cards over
the off-screen ones the lazy loader has begun to schedule. Combined with
content-visibility this compounds.

### 2.4 Code-split per view

`catalogue-*.js` is currently **1.07 MB / 315 KB gzipped** as a single chunk
(verified via vite build output, see PR #269 build log). Stack, Gallery, and
Canvas views are mounted lazily by tab but bundled eagerly.

```ts
const CatalogueStackView = lazy(() => import('./CatalogueStackView'));
const CatalogueGalleryView = lazy(() => import('./CatalogueGalleryView'));
const CatalogueCanvasGalleryView = lazy(() => import('./CatalogueCanvasGalleryView'));
```

Defers ~200 KB until the user picks a non-default view. Cold-start TTI
drops accordingly.

---

## 3. Tier 2 — React virtualization (only if Tier 1 isn't enough)

If, *after* Tier 1, real users on real data still feel jank past ~500
mounted cards, adopt **`@tanstack/virtual`** — not `react-virtuoso`.

### 3.1 Why not `react-virtuoso` (the original pick)

| | `react-virtuoso` (original) | `@tanstack/virtual` (better) |
|---|---|---|
| Scroll container | Takes it over — conflicts with the sticky toolbar, the chip-strip wrapper [PR #269](https://github.com/yamparalarahul27/AgentUX-Catalogue/pull/269), filter-sheet positioning | Headless — you keep your own DOM, no chrome refactor |
| Bundle | ~30 KB | ~6 KB |
| Grouped layout | Built-in `groupCounts` | ~80 LOC of sticky CSS — but the Group view needs sticky group headers anyway |
| 2026 momentum | Stable, maintained | De-facto standard; better integration with TanStack Query (used elsewhere) |

### 3.2 Implementation sketch

```ts
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: groupedFamilies.flat().length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (i) => /* group header: 32 | card: 220 */,
  overscan: 6,
});
```

Sticky group headers via CSS (`position: sticky; top: 0`) — `@tanstack/virtual`
doesn't fight you on this.

### 3.3 Trigger thresholds

Only render virtualized when the accumulated list is large enough that
mount cost exceeds virtualization overhead:

- **Grid view**: threshold ~400 cards. Below that, the existing flex layout
  beats any virtualizer.
- **Stack view**: threshold ~150 cards (cards are taller + have on-view
  comment fetches → DOM cost compounds).
- **Gallery / Canvas**: re-measure after Tier 1 lands.

Implementation: a `useShouldVirtualize(count)` hook that returns true past
the per-view threshold; below it, render the plain list.

---

## 4. Tier 3 — adjacent perf wins the original plan punted on

These are smaller individually but compound. All sit in M7 of the
infinite-scroll plan (deferred) or in the parked backlog.

### 4.1 Prefetch the next page at 80% scroll depth

Listed as M7 in the original plan; deferred. ~10 LOC change in the
existing `CatalogueScrollSentinel`:

```ts
// Today: fire loadMore when sentinel enters viewport
// Better: also fire when scroll position passes 80% of current list height
useEffect(() => {
  function onScroll() {
    const ratio = (scrollY + innerHeight) / document.body.scrollHeight;
    if (ratio > 0.8 && hasMore && !loadingMore) loadMore();
  }
  ...
}, [hasMore, loadingMore]);
```

Makes the experience feel instant — by the time the sentinel fires, the
next page is usually already there.

### 4.2 Scroll restoration on back-nav from lightbox

Also M7, parked. Currently a back-nav from `/screenshot/:id` jumps to top
of the catalogue. Users notice on long-scroll grids.

```ts
// Save scroll position before navigating to the lightbox
sessionStorage.setItem('catalogue-scroll-y', String(window.scrollY));
// On Catalogue mount, restore once if we came from a lightbox route
useLayoutEffect(() => {
  const saved = sessionStorage.getItem('catalogue-scroll-y');
  if (saved && document.referrer.includes('/screenshot/')) {
    window.scrollTo(0, Number(saved));
    sessionStorage.removeItem('catalogue-scroll-y');
  }
}, []);
```

Subtle gotcha: the saved position is only valid once the same page count
has been re-fetched. Either persist the cursor state too, or restore after
the first page lands.

### 4.3 Verify §7 indexes are deployed in production

The original plan marks all 9 indexes as an "M0 blocker" (§7) but provides
no verification step. Worth running:

```sql
\d screenshots
\d screen_families
```

against production and confirming `idx_screenshots_project_created`,
`idx_screenshots_metadata_gin`, `idx_screenshots_name_trgm`,
`idx_screenshots_filename_trgm`, `idx_screen_families_project_group`
are all present. If any are missing, slow filter queries are hiding under
"infinite scroll works."

If `pg_trgm` isn't enabled, `gin_trgm_ops` indexes won't have been created
and `ilike` searches will be table scans.

### 4.4 Real-time inserts via Supabase Realtime

The original plan says "poll or refresh instead." Postgres LISTEN/NOTIFY
via Supabase realtime is cheap, and surfacing teammate uploads in
near-real-time is a strong UX win:

```ts
supabase
  .channel('screenshots')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'screenshots' },
      (payload) => mergeNewScreenshot(payload.new))
  .subscribe();
```

Scope: only INSERTs (UPDATEs / DELETEs already covered by other flows).
Filter the channel by `project_id` to avoid cross-project noise.

### 4.5 Canvas Gallery wallpaper renders 9× — already scoped

[`backlog.md` line 79](./backlog.md#L79) flags the wallpaper phase
rendering the filtered set 9× without virtualization. PR-shaped in
[`parked_canvas_gallery_perf_fixes`](../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_canvas_gallery_perf_fixes.md).

Sequence with this plan: ship Tier 1 first (content-visibility makes the
9× problem ~9× cheaper for free). Then re-measure whether the
"cap copies vs window cells" decision still matters.

---

## 5. Recommended order

| # | What | Effort | Risk | Why this order |
|---|------|--------|------|----------------|
| 1 | `content-visibility: auto` everywhere | XS (1 PR, ~30 LOC SCSS) | Low | Highest leverage, zero deps. Measure first |
| 2 | Code-split Stack/Gallery/Canvas views | S (1 PR) | Low | Cold-start TTI drop, independent of other work |
| 3 | Image transforms + srcset on cards | M (1–2 PRs) | Medium — touches every card render path | Biggest payoff for typical session; needs care in lightbox/share-page renders |
| 4 | `fetchpriority` + `decoding` audit | S (1 PR) | Low | Bundle with Canvas Gallery perf bundle |
| 5 | Verify §7 indexes deployed | XS (1 SQL session) | Low | Pure infra check |
| 6 | Prefetch at 80% scroll depth | XS | Low | Resurrected from M7 |
| 7 | Scroll restoration on lightbox back-nav | S | Medium — depends on page-count persistence | Resurrected from M7 |
| 8 | Realtime INSERT channel | S | Medium — needs RLS check for cross-tenant leak | Defer until 1–4 land |
| 9 | `@tanstack/virtual` for Stack + Grid | L | Medium — chrome refactor | Only if 1–4 don't move metrics enough |

**Stop after step 4** and re-measure. The "Tier 1 + 2" stack handles the
vast majority of users at the scale this app realistically reaches.
Virtualization is a last resort, not a first move.

---

## 6. Definition of done

For the bundle as a whole:

- Cold-start TTI < 1.5s on a project with 2000 screenshots (currently
  unmeasured — establish baseline first)
- Catalogue scrolling stays 60fps past 500 accumulated cards in any view
- Filter change re-renders the first page in < 400ms (same gate as the
  infinite-scroll plan)
- Cumulative paint time on a 1000-card scroll-to-bottom drops > 50% vs
  baseline
- No regression in the lightbox open / close path
- Image bytes-per-card drops > 60% on the default grid view (measurable
  via Network panel)

---

## 7. Open questions

1. **`content-visibility` and the lightbox carousel** — the family-detail
   lightbox renders a horizontal filmstrip of related screenshots. If
   each strip card has `content-visibility: auto`, horizontal scroll may
   trigger paint storms. Test before applying.
2. **Supabase image transform quotas** — render endpoint usage counts
   against the project's bandwidth tier. Worth confirming we're on a tier
   that absorbs the swap before flipping every card.
3. **`<picture srcset>` and ThumbHashImage** — the existing ThumbHash
   placeholder hook expects a single `src`. Either extend it to consume
   srcset or fall back to a single transformed URL with no `<picture>`.
4. **Realtime concurrency** — multiple tabs subscribing per user adds
   connections. Confirm the Supabase realtime free/paid tier limits.
5. **Threshold heuristics for tanstack-virtual** — the 400 / 150 numbers
   in §3.3 are educated guesses. Real instrumentation (long-task
   observer, paint timings) should set them after Tier 1 lands.

---

## 8. Cross-references

- [`catalogue-infinite-scroll-plan.md`](./catalogue-infinite-scroll-plan.md)
  — the network-layer work this plan builds on
- [`backlog.md`](./backlog.md) — Canvas Gallery perf bundle (line 79)
- [`catalogue-linear-performance-optimization-plan.md`](./catalogue-linear-performance-optimization-plan.md)
  — older perf plan from the Linear-app analysis
- [Build output reference](https://github.com/yamparalarahul27/AgentUX-Catalogue/pull/269)
  — current chunk sizes for the code-split estimate
