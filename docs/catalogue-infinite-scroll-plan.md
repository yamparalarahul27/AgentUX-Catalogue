# Catalogue — Infinite Scroll & Server-Side Filtering — Plan

> **Status update (2026-05-08): SHIPPED.** Milestones M1–M4 and M6 are
> live in `useCatalogueData.ts`. M5 (stack on-view comments) and M7
> (retry/prefetch polish) are deferred.

**Status:** Shipped (M1–M4, M6) · Deferred (M5, M7)
**Scope:** `/designer/catalogue` data loading, filters, sort, search, view rendering
**Replaces:** Load-all + client-side filter architecture

---

## 1. The shift

**Before:** On mount, load every screenshot for every project the user can access.
Filters, sort, and search run over the full in-memory list.

**After:** Load **one project, one page, with filters applied server-side.**
The default view (Latest across All groups) fetches the first 50 rows ordered by
`created_at DESC`. Filters and sort rebuild the query and reset the list. More
rows fetch only as the user scrolls.

**Why:** At 1K–2K screenshots, the current architecture will break — initial
load time balloons, browser memory grows, and Supabase's default 1000-row limit
silently truncates. Stack view already introduces an N+1 comment-query problem
that infinite scroll + on-view loading fixes.

---

## 2. Defaults (per product requirement)

- **Default sort:** `date-desc-global` (Latest across All groups)
- **Default grouping:** single "All groups" pseudo-section (already supported by
  `useCatalogueFilters` when `isGlobalLatestSort` is true)
- **Default page size:** 50 screenshots
- **Default project scope:** most-recently-updated project (first in projects query)

The user's mental model on open: "show me the latest stuff across everything."

---

## 3. Pagination mechanism

**Cursor-based** on `(created_at DESC, id DESC)`:

```
SELECT * FROM screenshots
WHERE project_id = $1
  AND <filter predicates>
  AND (created_at, id) < ($cursorCreatedAt, $cursorId)
ORDER BY created_at DESC, id DESC
LIMIT 50
```

Compound cursor breaks timestamp ties. Stable under concurrent inserts.

**Why not offset?** `.range(start, end)` is simpler but skips/duplicates if any
row is inserted mid-scroll. Screenshots can be added by other tabs/teammates, so
stability matters.

---

## 4. What loads when

| Trigger                     | Queries                                              | Rows                |
| --------------------------- | ---------------------------------------------------- | ------------------- |
| Cold start                  | projects · flows · families · first 50 screenshots · counts for those 50 | ≤100 each           |
| Scroll near list end        | next 50 screenshots · counts for those 50            | 2 queries, 50 rows  |
| Filter change               | reset list · fetch first 50 with new predicates      | 2 queries           |
| Sort change                 | same as filter change                                | 2 queries           |
| Search (debounced 300ms)    | reset list · fetch first 50 with `ilike` predicate   | 2 queries           |
| Project change              | full reset                                           | same as cold start  |
| Stack card enters viewport  | fetch comment thread for that screenshot             | 1 query             |
| Open Lightbox               | annotations + comments for that screenshot           | 2 queries           |
| **Compare mode ON**         | **bypass pagination**, fetch full set scoped to flow | 1 full query        |

Peak concurrency at any moment: **~3–5 queries.** Never the N+1 storm of today.

---

## 5. Filter → server predicate mapping

| UI filter        | Supabase predicate                                       |
| ---------------- | -------------------------------------------------------- |
| `filterGroup`    | Join via `screen_families.group = $group`                |
| `filterFlow`     | `.contains('metadata', { catalogue_flow_label: $flow })` |
| `filterPlatform` | `.eq('platform', $platform)`                             |
| `filterTheme`    | `.eq('theme', $theme)`                                   |
| `filterWebPreset`| `.eq('web_preset_key', $webPreset)`                      |
| `filterMobileOs` | `.eq('mobile_os', $mobileOs)`                            |
| `searchQuery`    | `.or('name.ilike.%Q%,file_name.ilike.%Q%')`              |
| `sortBy`         | `.order('created_at', { ascending: <direction> })` etc.  |

### Edge case: filter by group
`screenshots` has no `group` column directly — group lives on `screen_families`.
Options:
1. Denormalize `group` onto `screenshots` (migration + triggers). Fast queries.
2. Use a view `screenshots_with_group` that joins on `screen_family_id`.
3. Query `screen_families` for matching family IDs first, then `screenshots IN`.

**Recommendation:** option 2 (view). Zero data migration, good performance with
the indexes proposed in §7.

### Edge case: filter by flow
Flow label is stored in `screenshots.metadata->>catalogue_flow_label`, not as a
column. Supabase supports `.contains()` on JSONB. Performance depends on a GIN
index on `metadata`.

---

## 6. Group sections with latest-first sort

When `sortBy === 'date-desc-global'` (the default), UI shows a **single flat
list under the "All groups" header** — no per-group sections. Each card carries
a group chip so the reviewer knows which group a screen belongs to.

When user explicitly picks `date-desc` (per-group), grouping kicks in. Server
orders by `group ASC, created_at DESC`. Pages stream in group order; UI renders
new section headers as they appear.

This matches what `useCatalogueFilters` already does for `isGlobalLatestSort`.

---

## 7. Required database indexes

Without these, filter queries will scan 2K+ rows. With them, most queries touch
<50 rows.

```sql
-- Primary pagination index (default sort)
CREATE INDEX IF NOT EXISTS idx_screenshots_project_created
  ON screenshots (project_id, created_at DESC, id DESC);

-- Filter combinations
CREATE INDEX IF NOT EXISTS idx_screenshots_project_platform_theme
  ON screenshots (project_id, platform, theme);

CREATE INDEX IF NOT EXISTS idx_screenshots_project_family
  ON screenshots (project_id, screen_family_id);

-- JSONB metadata for flow-label filter
CREATE INDEX IF NOT EXISTS idx_screenshots_metadata_gin
  ON screenshots USING GIN (metadata);

-- Search (name + file_name ilike)
CREATE INDEX IF NOT EXISTS idx_screenshots_name_trgm
  ON screenshots USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_screenshots_filename_trgm
  ON screenshots USING GIN (file_name gin_trgm_ops);

-- Comment/version count hydration
CREATE INDEX IF NOT EXISTS idx_screenshot_comments_screenshot
  ON screenshot_comments (screenshot_id);

CREATE INDEX IF NOT EXISTS idx_screenshot_versions_screenshot
  ON screenshot_versions (screenshot_id);

-- Group filter (via screen_families)
CREATE INDEX IF NOT EXISTS idx_screen_families_project_group
  ON screen_families (project_id, "group");
```

`gin_trgm_ops` requires the `pg_trgm` extension. Check with
`SELECT * FROM pg_extension WHERE extname = 'pg_trgm';` and if absent:
`CREATE EXTENSION pg_trgm;`

**M0 blocker:** ship these indexes before enabling paginated queries in
production — otherwise Supabase queries will be slow on the first deploy.

---

## 8. Component changes

### `use-catalogue-data.ts` (rewrite)
New shape:
```ts
useCatalogueData({
  projectId, filters, sortBy, searchQuery, compareEnabled, compareFlow,
}): {
  screenshots,     // accumulated across pages
  screenFamilies,  // accumulated across pages
  hasMore,
  loadingInitial, loadingMore,
  loadMore(),      // called by scroll sentinel
  reset(),         // on filter/sort change
  projects, flows, // small, one-shot fetches
}
```

### `use-catalogue-filters.ts` (refactor)
- Owns filter/sort/search state as today
- No longer filters in memory — passes state into `useCatalogueData`
- Effects: on any filter change, call `reset()` on data hook
- Derives `groupedFamilies` from the paginated screenshots (same logic as
  today, just over less data)

### `CatalogueScrollSentinel` (new)
- IntersectionObserver watching an invisible div at list end
- When visible and `hasMore && !loadingMore`, calls `loadMore()`
- Debounced to avoid double-fire

### `CatalogueSkeletonCard` (new)
- Grey rectangle + shimmer, matches `.catalogue-card` dimensions
- Rendered while `loadingInitial` or appended to list while `loadingMore`

### `Catalogue.tsx` (update)
- Wire new data hook + sentinel
- Remove full-load assumption
- Compare mode: short-circuit pagination (call a separate full-fetch hook when
  `compareEnabled` is true; see §9)

---

## 9. Compare mode bypass

Compare mode needs all families matching one flow across groups. Scoped to a
single flow, the set is small (rarely >50). **Decision:** compare mode skips
pagination.

Implementation:
- When `compareEnabled && compareFlow`, call a separate fetch:
  `fetchCompareFamilies({ projectId, compareFlow })` that loads everything
  matching that flow regardless of limit
- Feed that into the existing `CatalogueCompareView`
- Turn compare OFF → resume paginated mode

---

## 10. Stack view — on-view comment loading

Stack view's N+1 (introduced in [stack-view-plan.md](./stack-view-plan.md))
must be fixed as part of this work.

- Each `CatalogueStackCard` wraps comment fetch in an `IntersectionObserver`
  that fires only when the card is ≥50% visible
- Cache results in a `Map<screenshotId, ScreenshotComment[]>` scoped to the
  Stack view so scroll-back-up doesn't refetch
- Spinner in the thread region until the fetch resolves
- Fallback to count-only display if fetch fails (retry button)

---

## 11. Loading/error UX (per-card and list)

- **Initial load:** 6 skeleton cards render immediately, page fetch resolves,
  skeletons swap to real cards
- **Scrolled load:** skeleton row appears at list end while fetching next page
- **Per-image:** each `<img>` gets `loading="lazy"` + local `onLoad` state
  that flips a shimmer off when the image arrives
- **Per-Stack-card comments:** thread region shows a small spinner until
  fetched
- **Errors:** inline retry chip at the list end (for page failures) or within
  the card (for per-card failures). No global toast for pagination errors.

---

## 12. Milestones

| Milestone | Scope |
| --------- | ----- |
| **M0 — Schema & indexes** | Ship SQL indexes (§7). Verify `pg_trgm` extension. Dry-run EXPLAIN on worst-case filter combos. **Blocker for M1.** |
| **M1 — Paginated data hook** | Rewrite `use-catalogue-data.ts` for cursor pagination. Default sort = `date-desc-global`. First 50 rows on cold start. `loadMore()`. |
| **M2 — Server-side filters/sort/search** | Move filter predicates to Supabase query args. Debounced search. Reset on change. |
| **M3 — Scroll sentinel + skeletons** | `CatalogueScrollSentinel`, `CatalogueSkeletonCard`. Wire into Grid + Stack + (flat) List. |
| **M4 — Compare-mode bypass** | `fetchCompareFamilies` path. Transition in/out of compare cleanly. |
| **M5 — Stack on-view comments** | IntersectionObserver fetch per Stack card. Map-scoped cache. |
| **M6 — Lazy images + per-image skeleton** | `loading="lazy"` on all `<img>`. Shimmer placeholder. |
| **M7 — Polish** | Retry UX. Prefetch next page at 80% scroll depth. Scroll restoration on back-nav. |

---

## 13. Release gates (definition of done)

Infinite scroll can replace the current load-all only when all are true:

- Cold-start page load < 1s with 5000 screenshots in the active project
- Peak concurrent Supabase requests ≤ 5 at any moment after initial load
- Filter change re-renders the first page in < 400ms
- Stack view stays 60fps scrolling past 500 cards (requires M5 + later
  virtualization)
- Compare mode returns full matching set (never paginated)
- Cursor pagination exhausts cleanly (`hasMore` flips false at end of list)
- No silent row truncation — query failures surface errors, not empty lists
- Existing views (Grid, Gallery) unaffected by pagination refactor

---

## 14. Risks & open questions

1. **Missing indexes** — worst-case filter combos scan full table if indexes
   aren't deployed before app is updated. **Mitigation:** M0 ships first and
   is verified via EXPLAIN.
2. **JSONB flow-label filter** — `.contains()` on metadata is slower than a
   dedicated column. Acceptable if GIN index is in place; revisit if queries
   exceed 200ms.
3. **Group filter via view** — if join perf is poor, fall back to
   denormalizing `group` onto `screenshots`. Measure first.
4. **`pg_trgm` availability** — Supabase managed Postgres supports it but must
   be enabled per-project. M0 verifies.
5. **Scroll restoration on back-nav** — browsers usually restore scroll
   position but our data won't be there. Either refetch to restore state or
   accept returning to top. Punt to M7.
6. **Compare scope at large flows** — if a popular flow has 500+ matching
   families, compare-mode full load becomes heavy. M7 adds per-flow
   pagination if needed.
7. **Bulk action semantics** — "select all visible" vs "select all matching
   the current filter." Today it's "visible." With pagination, these diverge.
   Needs explicit UX decision. Defer to M7.
8. **Stack view virtualization still needed** — M5 fixes N+1 but not DOM
   growth. Past 500 mounted cards, scroll slows regardless of network.
   `react-virtuoso` grouped mode is the intended solution; separate plan doc.

---

## 15. Out of scope (for this initiative)

- Virtualization (separate follow-up after M5 — needs a new dependency)
- Full-text search rewrite to Postgres `tsvector`
- Multi-project federated loading ("all projects" view without pagination)
- Real-time subscription to new screenshot inserts (poll or refresh instead)
- Offline support / service-worker caching
