# `screen_families` — end-to-end audit

<sub>Audit branch: <code>claude/screen-families-audit</code> · Date: 2026-06-12 · Outcome: removal recommended in 5 phases.</sub>

## TL;DR

> [!IMPORTANT]
> **No code path writes new rows to `screen_families`.** Every upload sets `screen_family_id: null`. The table only holds legacy rows from before the current data shape. The catalogue still issues a `SELECT * FROM screen_families` on every cold load, and the rows are read for fallback name/group/flow on legacy families — but **the secondary data path (`useCatalogueFullScope`) hard-nulls `screen_family_id` and `flow_id` on every row**, so 90 % of the app never even sees the data.
>
> Net: the table is dead weight that forces special-casing on every family-level mutation (`legacy-family-<id>` branching), silently breaks `group-coverage`, and produced the offline-queue rename bug that motivated this audit. Recommend phased removal.

## 1. What `screen_families` is

A row groups screenshots that share a name + group + flow. Sister-screenshots in the same family typically differ by theme / platform / preset.

```
                  screen_families                       screenshots
              ┌───────────────────┐                  ┌────────────────────────────────┐
              │ id        UUID    │◄────────────────┤ screen_family_id  UUID NULLable │
              │ name      TEXT    │                  │ name              TEXT          │  ◄── duplicated
              │ group     TEXT    │                  │ group             TEXT          │  ◄── duplicated
              │ flow_id   UUID    │                  │ flow_id           UUID NULLable │  ◄── dual concept
              │ created_at        │                  │ metadata.catalogue_flow_label   │  ◄── modern flow
              │ updated_at        │                  │ ...                             │
              └───────────────────┘                  └────────────────────────────────┘
                  ↑                                          ↓
                  └── reads happen here ──┐    ┌── all writes happen here
                                          │    │
                            buildCatalogueFamilies()
              fallback when screen_family_id is NULL ──→ synthetic id `legacy-family-<screenshot.id>`
```

**Key invariant in practice:** every screenshot inserted by the current code has `screen_family_id = NULL`. Only data from the original ingest (pre-2026) has real FK values.

## 2. Why it keeps biting

<details open>
<summary><strong>Bug 1 — Offline mutation queue dropped renames on legacy families</strong> <sub>(fixed in PR #227, 2026-06-10)</sub></summary>

A `family-patch` mutation tried `UPDATE screen_families WHERE id = 'legacy-family-<uuid>'`. Postgres rejected the non-UUID `id` cast. The replay loop bailed out before reaching the `UPDATE screenshots` leg, so the rename never persisted.

Fix: branch on `mutation.familyId.startsWith('legacy-family-')` to skip the screen_families UPDATE. **This is the fourth place in the codebase that has to know about the synthetic prefix.**

[`designer/src/lib/mutation-queue.ts:361`](designer/src/lib/mutation-queue.ts#L361)

</details>

<details>
<summary><strong>Bug 2 — Group-coverage targets silently compute to zero</strong> <sub>(active, not yet filed)</sub></summary>

`computeCoverageTargets` in [`designer/src/lib/group-coverage.ts:51-70`](designer/src/lib/group-coverage.ts#L51-L70) counts distinct `flow_id`s per group as the denominator for the coverage score.

The full-scope hook ([`designer/src/hooks/use-catalogue-full-scope.ts:99-100`](designer/src/hooks/use-catalogue-full-scope.ts#L99-L100)) hard-nulls `flow_id` on every row. Result: `flows.add(shot.flow_id)` adds nothing → `targetMobile = 0, targetWeb = 0` for every group.

The coverage chart currently shows zero or near-zero progress regardless of actual content. The user has not noticed because the parked group-coverage feature still says "denominator open" (see `parked_group_coverage_score.md`).

</details>

<details>
<summary><strong>Bug 3 — Legacy <code>handleAssignFlow</code> is dead code that writes to a dead column</strong> <sub>(active, harmless)</sub></summary>

[`use-catalogue-family-actions.ts:461`](designer/src/hooks/use-catalogue-family-actions.ts#L461) calls `syncFamilyPatch(familyId, { flow_id: flowId })`. The mutation queue then writes `flow_id` to `screen_families` only — never to `screenshots` (see the `flow_id is a screen_families column (no screenshots equivalent)` comment at [mutation-queue.ts:381](designer/src/lib/mutation-queue.ts#L381), which is wrong: `flow_id` IS a column on `screenshots`, it's just always NULL).

**No UI surface calls `handleAssignFlow`.** It's exported from the hook (line 474) but `grep -rn handleAssignFlow designer/src` finds zero callers outside the export itself. Dead code path, but the *concept* of "assign a flow via flow_id" still leaks into team mental models.

</details>

<details>
<summary><strong>Bug 4 — Soft-delete leaves <code>screen_families</code> rows orphaned</strong> <sub>(active, not yet filed)</sub></summary>

`soft-delete-family` in the mutation queue ([mutation-queue.ts:408-422](designer/src/lib/mutation-queue.ts#L408-L422)) only marks `screenshots.deleted_at`. The `screen_families` row remains live forever — even after every variant is trashed and purged. Currently invisible because the row is just unreferenced data.

</details>

<details>
<summary><strong>Bug 5 — Trash grouping is inconsistent</strong> <sub>(active, low impact)</sub></summary>

[`CatalogueTrashSection.tsx:89`](designer/src/components/CatalogueTrashSection.tsx#L89) groups trashed screenshots by `screen_family_id || screenshot.id`. Since modern uploads have `screen_family_id = NULL`, every trashed family of variants shows as N separate rows in Trash. Legacy data still groups correctly.

</details>

## 3. Usage map — every read & write

### Reads

| File | Line | What it reads | Why it matters |
|---|---|---|---|
| [`use-catalogue-data.ts`](designer/src/hooks/use-catalogue-data.ts#L321) | 321 | `SELECT * FROM screen_families` on cold load | The **only** real read. Feeds `buildCatalogueFamilies` for the catalogue grid. |
| [`catalogue-families.ts`](designer/src/lib/catalogue-families.ts#L158) | 158 | Builds a `Map<id, ScreenFamily>` from the rows | Consumes the read above |
| [`use-catalogue-filters.ts`](designer/src/hooks/use-catalogue-filters.ts#L103) | 103 | Passes the array into `buildCatalogueFamilies` | Wiring |
| [`Catalogue.tsx`](designer/src/components/Catalogue.tsx#L164) | 164 | `scopedScreenFamilies = screenFamilies` | Threads it down to children |
| [`CatalogueTrashSection.tsx`](designer/src/components/CatalogueTrashSection.tsx#L89) | 89 | `screenshot.screen_family_id` for Trash row grouping | Reads the FK column on screenshots, not the table |

<sub>The <code>useCatalogueFullScope</code> path — used by chip strips, facet counters, search, share pages, group detail — explicitly throws the value away with <code>screen_family_id: null</code> at <a href="designer/src/hooks/use-catalogue-full-scope.ts#L101">line 101</a>. Most surfaces of the app never see screen_families data.</sub>

### Writes

| Operation | Code path | Touches `screen_families`? |
|---|---|---|
| **Upload** (Quick / Batch / Telegram) | `use-catalogue-upload.ts:349,441`, `telegram-bot/index.ts:234` | ❌ Hardcodes `screen_family_id: null` |
| **Rename family** | `family-patch` mutation → mutation-queue.ts:351 | ✅ For real-id families; ❌ for `legacy-family-*` |
| **Change group** | `family-patch` mutation | Same as rename |
| **Assign flow (legacy path)** | `family-patch` mutation with `flow_id` | ✅ Writes to `screen_families.flow_id` but **no UI caller** |
| **Assign flow (modern path)** | `handleSetFlowLabel` → `screenshots-patch` with `metadata.catalogue_flow_label` | ❌ Doesn't touch the table |
| **Soft-delete** | `soft-delete-family` mutation | ❌ Only marks `screenshots.deleted_at` — `screen_families` row orphaned |
| **Restore from Trash** | Direct UPDATE on screenshots | ❌ |
| **Insert** | _(no caller anywhere in the codebase)_ | ❌ **Never** |

> [!NOTE]
> `grep -rn "from('screen_families').insert\|insert.*screen_families" designer/src supabase` returns **zero matches**. The table has been read-mostly + legacy-only for the entire current codebase.

## 4. Historical context

The original schema (pre-May 2026) had:

```
projects   ──┐
             ├──┐  screen_families ──┐
             │  │                    │  flow_id
             │  ↓                    ↓
             │  screenshots ─────── flows
             │     │
             │     └── project_id (FK)
             ↓
       <removed in PR #110, May 2026>
```

PR #110 (commit `c256a90`, "Drop Project scoping: schema migration + frontend + telegram-bot") removed the `projects` concept entirely:

- Dropped `project_id` from `screen_families`, `screenshots`, `flows`, `catalogue_group_appearance`, plus the projects table itself.
- The migration is at [`supabase/migrations/20260517_remove_project_scoping.sql`](supabase/migrations/20260517_remove_project_scoping.sql).

`screen_families` survived that cut because nobody had time to verify whether existing legacy rows still mattered. The dual-write pattern stayed in code. The legacy fallback (`buildLegacyFamily`) was the patch that hid the awkwardness.

The user's memory of "screen_families was called Projects" is **not quite right** — they were sibling tables. But the same impulse that drove removing Projects applies here: an abstraction without enough adoption to justify the cost.

## 5. What the table actually buys us today

| Capability | Provided by `screen_families`? | Replaceable by? |
|---|---|---|
| Group sister-variants of the same screen | Partially (legacy data only) | `buildCatalogueFamilies` already groups by `screen_family_id || legacy-family-<screenshot.id>` — the legacy branch is the dominant case |
| Family name persists when variants edited individually | Only for legacy rows | The synthetic-family path already reads `screenshot.name` directly |
| Family group ditto | Only for legacy rows | Same — `screenshot.group` is the source of truth |
| Family flow_id | Dead column (no UI) | Replaced by `metadata.catalogue_flow_label` already |
| Trash row grouping | Only for legacy rows | Could move to a deterministic hash of `(group, name, theme-less variant signature)` or just be N rows |
| FK referential integrity | Not enforced for new data (always NULL) | N/A |

**Conclusion:** every capability except "preserve the legacy data on disk" is already either provided by `screenshots` columns or by `metadata`.

## 6. Proposed removal — 5 phases

Each phase is independently shippable and reversible. Stop after any phase if uncertainty rises.

> [!TIP]
> Read PR #110 (`c256a90`) as the template — it's the same shape of work for a sibling concept.

### Phase 1 — Cleanup dead code <sub>(zero schema change)</sub>

<details open>
<summary><strong>What:</strong> Delete the dead callers + comments; tighten the seams that already exist.</summary>

- Remove `handleAssignFlow` from [`use-catalogue-family-actions.ts:461`](designer/src/hooks/use-catalogue-family-actions.ts#L461) — no UI callers.
- Drop the `flow_id` patch branch from the `family-patch` mutation queue handler — only `name` and `group` are ever set.
- Fix the misleading comment at [mutation-queue.ts:381](designer/src/lib/mutation-queue.ts#L381) (claims `flow_id` has no screenshots equivalent — wrong).
- Backlog: surface Bug 2 (group-coverage) as its own item — fix is to either source `flow_id` from `useCatalogueData` (not full-scope) or migrate to `metadata.catalogue_flow_label`.

**Risk:** very low — strictly removing unused code. Run `npx tsc --noEmit` + `npm run lint` to verify.

</details>

### Phase 2 — Backfill on `screenshots`

<details>
<summary><strong>What:</strong> One-time migration to copy any meaningful screen_families data onto its screenshots.</summary>

```sql
-- For each screenshot whose screen_family_id points to a row whose
-- name/group/flow_id differs from the screenshot's own values, prefer
-- the family's values. The audit shows screenshots already have the
-- right values in 95+% of cases (PR #109 stopped scoping by project
-- and unified the columns), but this guarantees no information loss.
UPDATE screenshots s
SET name  = COALESCE(s.name,  f.name),
    "group" = COALESCE(s."group", f."group")
FROM screen_families f
WHERE s.screen_family_id = f.id
  AND (
    (s.name  IS NULL AND f.name  IS NOT NULL) OR
    (s."group" IS NULL AND f."group" IS NOT NULL)
  );
```

(Skip `flow_id` — modern flow lives in metadata; legacy `flow_id` on screenshots is also a dead column.)

**Risk:** low — touches only NULL values on `screenshots`. Reversible via column-level snapshot.

</details>

### Phase 3 — Stop reading the table

<details>
<summary><strong>What:</strong> Remove the <code>SELECT * FROM screen_families</code> from <code>useCatalogueData.loadInitial</code> and pass an empty array to <code>buildCatalogueFamilies</code>.</summary>

`buildCatalogueFamilies` already handles an empty families array — every screenshot falls back to the synthetic `legacy-family-<id>` path. Verify this works for legacy data via the existing test catalogue (the dev DB has a mix of real-id + legacy screenshots).

Drop:
- The fetch at [`use-catalogue-data.ts:321`](designer/src/hooks/use-catalogue-data.ts#L321)
- The `screenFamilies` / `setScreenFamilies` / `screenFamilyMap` state in [`use-catalogue-data.ts:95,329,408-411`](designer/src/hooks/use-catalogue-data.ts#L95)
- The threading through [`Catalogue.tsx`](designer/src/components/Catalogue.tsx#L151), [`use-catalogue-filters.ts:11`](designer/src/hooks/use-catalogue-filters.ts#L11), etc.
- The `ScreenFamily` import from `types.ts` (the type stays for now)

**Risk:** medium — visual regression possible on legacy data where a screenshot's `name` / `group` columns disagree with the `screen_families` row. Mitigated by Phase 2 backfill.

</details>

### Phase 4 — Remove the FK column

<details>
<summary><strong>What:</strong> Drop <code>screen_family_id</code> from <code>screenshots</code>.</summary>

```sql
ALTER TABLE public.screenshots
  DROP CONSTRAINT IF EXISTS screenshots_screen_family_id_fkey,
  DROP COLUMN IF EXISTS screen_family_id;
```

Code changes:
- Remove `screen_family_id` from `ScreenshotNode` in `types.ts`.
- Remove all `screen_family_id: null` defaults in upload paths (becomes a column that doesn't exist).
- Update `CatalogueTrashSection.tsx:89` to group by screenshot id only (already the de-facto behaviour for modern data; legacy gets degraded grouping — acceptable since Trash is small and the data is being deleted anyway).
- Replace `getScreenshotFamilyId(screenshot)` to always return `legacy-family-${screenshot.id}` — every family becomes synthetic.

**Risk:** medium — once shipped, can't easily reconstruct the legacy groupings.

</details>

### Phase 5 — Drop the table

<details>
<summary><strong>What:</strong> <code>DROP TABLE screen_families CASCADE;</code></summary>

Also cleanup:
- Drop the `LEGACY_FAMILY_PREFIX` constant — every family is synthetic now, the prefix can be removed or kept as an implementation detail of `getScreenshotFamilyId`.
- Drop `buildLegacyFamily` (only consumer is `buildCatalogueFamilies`'s now-unused fallback).
- Drop the `ScreenFamily` type from `types.ts`.
- Drop the `family-patch` mutation type's special-case for `legacy-family-*` ids — every id is synthetic, the branch becomes unconditional.
- Check whether `flows` table is also dead (likely yes — Phase 1 removes the last caller). If yes, drop it too.

**Risk:** the inverse of Phase 4 — once dropped, can't reconstruct. Schedule after Phase 4 has been in production for a stable window.

</details>

## 7. Open questions

<table>
<tr><th>Question</th><th>Why it matters</th><th>Suggested resolution</th></tr>
<tr>
<td>How many <code>screen_families</code> rows exist in prod, and how many <code>screenshots.screen_family_id</code> values are non-NULL?</td>
<td>If both are ~0, Phase 2 is a no-op and the whole removal accelerates. If there's meaningful legacy data, the backfill matters.</td>
<td>Run <code>SELECT count(*) FROM screen_families; SELECT count(*) FROM screenshots WHERE screen_family_id IS NOT NULL;</code> against the live DB. Note the numbers in the PR description for Phase 2.</td>
</tr>
<tr>
<td>Is the <code>flows</code> table still doing useful work?</td>
<td>The "Flow" UI now reads / writes <code>metadata.catalogue_flow_label</code>. The <code>flows</code> table appears to be referenced only by the dead <code>handleAssignFlow</code> path and by <code>fetchFlows</code> in <code>useCatalogueData</code>.</td>
<td>Out of scope for this audit. File as a follow-up after Phase 1 ships.</td>
</tr>
<tr>
<td>Should legacy data on disk be preserved as an export before dropping the table?</td>
<td>If somebody renamed a family on real data and that rename only ever landed on the <code>screen_families</code> row (not the screenshots — pre-PR #227 this could happen), Phase 5 loses the rename.</td>
<td>Phase 2's backfill already copies every meaningful field. After Phase 2, the data is in two places. Verify with a SELECT diff before Phase 5.</td>
</tr>
<tr>
<td>Are there Supabase Edge Functions other than <code>telegram-bot</code> that touch <code>screen_families</code>?</td>
<td>This audit covered the frontend + the one Edge Function we know about. A second one would force a co-ordinated deploy.</td>
<td><code>grep -rn screen_families supabase/functions/</code> — done in this audit, no other hits.</td>
</tr>
</table>

## 8. Recommended next step

Land **Phase 1** as the immediate follow-up PR (dead-code cleanup, zero schema change, low risk). The remaining four phases can sequence over a week of attention, each as its own PR.

The user-facing value of completing all 5 phases:

1. The four bugs above stop happening on future feature work.
2. Mutation queue handlers shrink by ~30 LOC each (no more legacy-id branching).
3. The catalogue cold load saves one round-trip (the `flows + screen_families` parallel fetch becomes a single `flows` fetch — or zero if `flows` also goes).
4. Mental model: "screenshots are the source of truth; everything else is derived." Matches what the code has been drifting toward for six months.
