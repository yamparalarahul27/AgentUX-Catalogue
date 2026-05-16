# Settings → Groups missing some groups (Allinx, Bvox) — investigation

**Date:** 2026-05-15 (investigation), 2026-05-16 (real root cause found + fixed)
**Status:** Fixed 2026-05-16. The original investigation pointed at URL filter hydration as the cause — that turned out to be a secondary issue. The actual root cause was **project scoping**: `CatalogueTeamSection` filtered `scopedScreenshots` to `projects[0]?.id`, which is no longer a no-op once the user has more than one project (Allinx + Bvox live in the user's *second* project). The fix drops that project filter so the panel spans every project the user has access to, matching the chip strip. URL-filter hydration was also removed in the same PR as a small cleanup.
**Reported symptom:** Groups like Allinx and Bvox appear in (a) the catalogue chip strip and (b) the filter dropdown but are missing from (c) Settings → Groups panel.

## TL;DR

All three surfaces are fed from the *same* `fullScopeScreenshots` array. The Settings → Groups panel adds a search + Type + Region filter on top, and **rehydrates that filter from the URL on every mount** (`?q=`, `?type=`, `?region=`). When those URL params are stale or carried over from a previous Settings visit, groups get silently hidden from the list — but the tab badge count stays correct (it's unfiltered).

The chip strip and Settings → Groups panel are not actually displaying different data; the Settings list is filtered while the chip strip is not.

## Data flow (confirmed)

All three surfaces start from `fullScopeScreenshots` produced by [use-catalogue-full-scope.ts:79-202](../designer/src/hooks/use-catalogue-full-scope.ts#L79-L202), which loads every non-deleted screenshot for the project(s), paged in 1000s:

```ts
.from('screenshots')
.select('id,project_id,group,platform,theme,...')
.is('deleted_at', null)
.in('project_id', projectIds)
```

| Surface | Where it derives from `fullScopeScreenshots` | Filter applied? |
|---|---|---|
| Catalogue chip strip | `deriveGroupStats(fullScopeScreenshots)` — [Catalogue.tsx:216-219](../designer/src/components/Catalogue.tsx#L216-L219) | No |
| Filter dropdown | `facetScreenshots` (= `fullScopeScreenshots` when `viewBy === 'all'`) — [Catalogue.tsx:164-174](../designer/src/components/Catalogue.tsx#L164-L174), [use-catalogue-filters.ts:51-63](../designer/src/hooks/use-catalogue-filters.ts#L51-L63) | No |
| Settings → Groups **badge count** | `groupChecklist.length` — [CatalogueTeamSection.tsx:469](../designer/src/components/CatalogueTeamSection.tsx#L469) | No |
| Settings → Groups **rows rendered** | `filteredGroupChecklist` — [CatalogueTeamSection.tsx:203-222](../designer/src/components/CatalogueTeamSection.tsx#L203-L222) | **Yes** — search + Type + Region |

The `project_id` filter at [CatalogueTeamSection.tsx:177](../designer/src/components/CatalogueTeamSection.tsx#L177) is **NOT** a no-op in real accounts that have accumulated more than one project. The user who reported this has 5 projects — `projects[0]` contains 115 groups but Allinx and Bvox live in `projects[1]` (28 groups) along with 27 others. This is the actual cause of the symptom. The URL filter behaviour below is a secondary issue and was tidied up in the same fix.

## Root cause

[CatalogueTeamSection.tsx:248-261](../designer/src/components/CatalogueTeamSection.tsx#L248-L261) reads URL params on mount and uses them to populate the search/Type/Region filter:

```ts
useEffect(() => {
  function readFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') ?? '';
    const type = params.get('type');
    const region = params.get('region');
    setGroupSearch(query);
    setGroupTypeFilter(isGroupTypeFilter(type) ? type : 'all');
    setGroupRegionFilter(isGroupRegionFilter(region) ? region : 'all');
  }
  readFromUrl();
  window.addEventListener('popstate', readFromUrl);
  return () => window.removeEventListener('popstate', readFromUrl);
}, []);
```

And [lines 265-277](../designer/src/components/CatalogueTeamSection.tsx#L265-L277) write those params back to the URL while on the Groups subtab. The main catalogue's URL handler ([Catalogue.tsx:183-197](../designer/src/components/Catalogue.tsx#L183-L197)) only manages `?group=` — it does not strip `?q=` / `?type=` / `?region=`, so once they're stamped onto the URL, they persist across navigation and back into the next Settings open.

Groups like Allinx and Bvox disappear from the visible list if any of these are true on the URL at the moment Settings opens:
- `?type=cex` (or `dex` / `untagged`) and the group's appearance category doesn't match
- `?region=india` (or `global` / `untagged`) and the group's appearance region doesn't match
- `?q=…` and the group name doesn't contain the search string

## Verification plan (5-second visual check before any code change)

1. Open the app and note the chip strip count.
2. Open Settings → Groups. Note the **count badge** next to the "Groups" tab.
3. Note the **number of rows actually rendered** below.

Expected:
- (1) == (2) → confirms the analysis (both unfiltered, same source).
- (3) < (2) → confirms the URL-filter leak.

If (1) ≠ (2), there is a deeper issue (likely a load race or appearance-map issue) and this doc needs an update.

## Fix options

| Option | Change | Tradeoff |
|---|---|---|
| **A. Don't rehydrate filters from URL** | Drop the `?q=`/`?type=`/`?region=` URL hydration block at [CatalogueTeamSection.tsx:248-277](../designer/src/components/CatalogueTeamSection.tsx#L248-L277). Settings always opens with all-clear filters. | Loses deep-linkable filtered Settings views (likely unused). ~15 LOC, lowest risk. |
| **B. Clear params on modal close** | Keep deep-linking, but strip `?q=`/`?type=`/`?region=` from the URL when the user leaves the Groups subtab or closes Settings. | More plumbing, more edge cases (back button, refresh while filtered). |
| **C. Two-pane Settings (parity + customised)** | Top pane: full ungrouped list (chip-strip parity, no filter). Bottom pane: only groups with appearance metadata customised. Filter only the customised pane. | Bigger UI change. Needs ASCII sketch + approval per CLAUDE.md. Solves the related "where do I see/manage customised groups" question too. |

**Recommended:** Option A. It directly removes the silent-hiding behavior and matches the user's mental model ("show all like the strip"). If deep-linking ever becomes a real requirement, B can be added on top.

## Related notes

- The user reported this against the parked UX backlog — same item as the "groups dropdown missing Allinx/Bvox" bug.
- "Auto-update when a new screenshot adds a new group name" is already wired: both surfaces re-derive from `fullScopeScreenshots`, and the upload hook updates that array. No additional work needed unless a stale-after-upload bug appears.
- This investigation made no code changes — purely read-only.
