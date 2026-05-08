# Unused Supabase tables — cleanup plan

> **Status update (2026-05-08): COMPLETED.** Tables dropped + code
> cleanup landed in PRs #49 and #50. Doc preserved as a record.

**Status:** Completed (PRs #49, #50)
**Date of analysis:** 2026-05-07.
**Scope:** the `public` schema of the catalogue Supabase project.
**Why now:** after the catalogue codebase was split with another fork, the local repo no longer reads or writes several tables. They still exist in Supabase, eat schema-review attention, and add noise to the RLS hardening checklist in [security-rls-public-release.md](security-rls-public-release.md).

This doc documents what to drop, in what order, what to verify first, and what code/doc cleanup follows. The migration itself is **not** included here — it lands in a follow-up PR after sign-off.

## Summary

Four tables and one view can be dropped:

1. `public.feature_log_links`
2. `public.feature_log`
3. `public.feature_log_with_counts` (view, depends on `feature_log`)
4. `public.catalogue_figma_requests`
5. `public.connections`

All other tables in the schema have live `from()` / `rpc()` calls in the codebase and stay.

## How the list was derived

For every table in the public schema, we counted:

- **Total references** — any mention across `*.ts`, `*.tsx`, `*.sql`, `*.md` (excluding `node_modules` and `.next`).
- **Runtime references** — only `supabase.from('<table>')` and `supabase.rpc('<table>')` calls inside `*.ts` / `*.tsx` / `*.js` / `*.jsx`.

A table is a drop candidate when its runtime reference count is zero (or, for `connections`, when the only runtime reference is a `.delete()` cascade with no corresponding read or insert anywhere in the codebase).

## Tables to drop

### 1. `feature_log_links`

- **Runtime calls:** 0
- **Remaining references:** [docs/security-rls-public-release.md](security-rls-public-release.md), [supabase/migrations/20260416_rename_designed_to_reference.sql](../supabase/migrations/20260416_rename_designed_to_reference.sql) (constraint rename only).
- **FKs in:** none.
- **FKs out:** `feature_log_links.feature_id` → `feature_log.id`. The `screenshot_id` column has **no FK constraint** despite the name.
- **Why safe:** leaf table, no inbound FKs, feature is gone from the UI.

### 2. `feature_log`

- **Runtime calls:** 0
- **Remaining references:** same as above — RLS doc and the 20260416 migration.
- **FKs in:** `feature_log_links.feature_id`. Drop `feature_log_links` first (or use `cascade`).
- **FKs out:** none.
- **Dependent view:** `public.feature_log_with_counts`. Drop the view first (or use `cascade`).

### 3. `feature_log_with_counts` (view)

- Mentioned in [docs/security-rls-public-release.md](security-rls-public-release.md) as a `SECURITY DEFINER` view that needed to be recreated with `SECURITY INVOKER` before public release. Dropping the underlying `feature_log` table makes the view irrelevant — the entire feature can come out together.

### 4. `catalogue_figma_requests`

- **Runtime calls:** 0
- **Remaining references:** [designer/sql/catalogue-figma-requests.sql](../designer/sql/catalogue-figma-requests.sql) (the original create script), [docs/security-rls-public-release.md](security-rls-public-release.md).
- **FKs in:** none.
- **FKs out:** `catalogue_figma_requests.project_id` → `projects.id`.
- **Why safe:** leaf table, the HTML→Figma intake feature is not wired into the app.

### 5. `connections`

- **Runtime calls:** 1 — a `.delete()` cascade in [designer/src/hooks/use-catalogue-family-actions.ts:373](../designer/src/hooks/use-catalogue-family-actions.ts#L373) when a screen family is deleted.
- **Reads / inserts:** none. The visual flow-graph builder (source_id → target_id arrow connections between screenshots) is no longer in the codebase.
- **FKs in:** none.
- **FKs out:** `project_id` → `projects.id`, `source_id` / `target_id` → `screenshots.id`, `flow_id` → `flows.id`.
- **Why safe:** the table accumulates nothing; the only code touching it is dead-cleanup code that should be removed alongside the drop.

## Drop order

Respecting FK dependencies, drop in this order (or use a single `cascade` per table):

```
1. drop view  if exists public.feature_log_with_counts;
2. drop table if exists public.feature_log_links;
3. drop table if exists public.feature_log;
4. drop table if exists public.catalogue_figma_requests;
5. drop table if exists public.connections;
```

## Verification (run before dropping)

Run the following queries in the Supabase SQL editor and confirm the results match expectations before applying the migration.

### A. Inbound FKs from any schema

```sql
select
  tc.table_schema   as referencing_schema,
  tc.table_name     as referencing_table,
  kcu.column_name   as referencing_column,
  ccu.table_schema  as referenced_schema,
  ccu.table_name    as referenced_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema    = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema    = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name in (
    'feature_log',
    'feature_log_links',
    'catalogue_figma_requests',
    'connections'
  );
```

**Expected:** only `feature_log_links.feature_id` → `feature_log.id`. Anything else means an external table depends on these and the drop is unsafe.

### B. Dependent views or other objects

```sql
select dependent_ns.nspname as schema,
       dependent_view.relname as view_name,
       source_table.relname  as depends_on_table
from pg_depend
join pg_rewrite on pg_depend.objid = pg_rewrite.oid
join pg_class as dependent_view on pg_rewrite.ev_class = dependent_view.oid
join pg_class as source_table on pg_depend.refobjid = source_table.oid
join pg_namespace as dependent_ns on dependent_view.relnamespace = dependent_ns.oid
where source_table.relname in (
  'feature_log',
  'feature_log_links',
  'catalogue_figma_requests',
  'connections'
)
  and source_table.oid <> dependent_view.oid;
```

**Expected:** `feature_log_with_counts` depending on `feature_log`. Nothing else.

### C. Row counts

```sql
select 'feature_log'              as t, count(*) from public.feature_log              union all
select 'feature_log_links'        as t, count(*) from public.feature_log_links        union all
select 'catalogue_figma_requests' as t, count(*) from public.catalogue_figma_requests union all
select 'connections'              as t, count(*) from public.connections;
```

If any of these holds rows that are surprising or potentially valuable (e.g. the other fork was writing here), pause and export before dropping.

## Follow-up code and doc cleanup

These ride alongside the migration in the same PR:

- Remove the dead `connections.delete()` block in [designer/src/hooks/use-catalogue-family-actions.ts:373](../designer/src/hooks/use-catalogue-family-actions.ts#L373).
- Delete the orphan SQL file [designer/sql/catalogue-figma-requests.sql](../designer/sql/catalogue-figma-requests.sql).
- Prune the four bullets in [docs/security-rls-public-release.md](security-rls-public-release.md) that reference the dropped objects (`feature_log`, `feature_log_links`, `feature_log_with_counts`, `catalogue_figma_requests`).

## Tables intentionally kept

Some tables look orphaned on the ER diagram (no FKs in or out) but are actively used in code. They stay. A future reader doing a similar audit should not drop them on diagram shape alone:

| Table | Reason it stays |
|---|---|
| `catalogue_settings` | Per-user web preset storage; `from()` calls in the toolbar/settings code. |
| `catalogue_link_references` | Live link bookmarks feature. |
| `catalogue_video_references` | Video references feature. |
| `catalogue_video_comments` | Comments on video references. |
| `catalogue_group_appearance` | Per-project group icon/label customization. |
| `comparisons` | Side-by-side image comparisons feature. |
| `screenshot_versions` | Version history for re-uploaded screenshots. |
| `screenshot_bookmarks` | User bookmarks. |
| `screenshot_annotations` | Pin / area annotations on screenshots. |
| `screenshot_comments` | Comments on screenshots. |
| `screen_families` | Variant grouping. |
| `flows` | Flow names; rendered in the team sidebar / flow sidebar. |
| `label_vocab` | Controlled vocabulary, seeded 2026-05-06 for Labeling Studio. |
| `projects` | Core. |
| `screenshots` | Core. |

## Migration

Not included in this PR. After this doc is approved and the verification queries above return the expected results, a follow-up PR will add `supabase/migrations/<date>_drop_unused_tables.sql` containing the five drop statements in the order listed, plus the code and doc cleanup items.
