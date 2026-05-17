-- Remove project_id as a scoping concept from the catalogue.
--
-- Background: the `projects` table + `project_id` FKs on screenshots /
-- flows / screen_families / catalogue_group_appearance never enforced
-- access control (RLS gates on uploader_email + role capabilities) and
-- have no user-facing UI (no project picker exists). They have, however,
-- caused user-visible bugs in any account that accumulated more than
-- one project — most recently PR #106 (Settings → Groups silently
-- filtering out groups in projects beyond projects[0]). PR #109 stops
-- the frontend reads; this migration drops the columns + table.
--
-- Pre-flight: run the backup-tables SQL block (docs/backlog.md /
-- session runbook) in the SQL editor right before this migration so a
-- rollback path exists if something surprises us.
--
-- Also drops catalogue_figma_requests and connections per the original
-- cleanup plan in docs/cleanup-unused-tables.md — they FK to projects
-- and have zero runtime references in the codebase, so we fold their
-- removal into the same migration rather than running it separately.

BEGIN;

-- ── 1. Coalesce catalogue_group_appearance duplicates ────────────────
-- 33 group_keys have rows in more than one project. Of those, exactly
-- one (`general`) has genuinely different data; the other 32 are
-- byte-identical replicas across projects. The DELETE keeps the row
-- with the latest updated_at per group_key — for `general` that's the
-- dcf00841 project's row, which has the uploaded icon we want to keep.
WITH ranked AS (
  SELECT
    project_id,
    group_key,
    ROW_NUMBER() OVER (
      PARTITION BY group_key
      ORDER BY updated_at DESC, project_id
    ) AS rn
  FROM public.catalogue_group_appearance
)
DELETE FROM public.catalogue_group_appearance a
USING ranked r
WHERE a.project_id = r.project_id
  AND a.group_key  = r.group_key
  AND r.rn > 1;

-- ── 2. Re-key the appearance table ───────────────────────────────────
-- Drop the (project_id, group_key) composite PK and add a new PK on
-- group_key alone. Step 1 has guaranteed group_key is unique.
ALTER TABLE public.catalogue_group_appearance
  DROP CONSTRAINT catalogue_group_appearance_pk;

ALTER TABLE public.catalogue_group_appearance
  ADD CONSTRAINT catalogue_group_appearance_pk PRIMARY KEY (group_key);

-- ── 3. Drop FKs pointing to projects(id) ─────────────────────────────
ALTER TABLE public.screenshots
  DROP CONSTRAINT screenshots_project_id_fkey;
ALTER TABLE public.flows
  DROP CONSTRAINT flows_project_id_fkey;
ALTER TABLE public.screen_families
  DROP CONSTRAINT screen_families_project_id_fkey;
ALTER TABLE public.catalogue_group_appearance
  DROP CONSTRAINT catalogue_group_appearance_project_id_fkey;

-- ── 4. Drop project_id columns ───────────────────────────────────────
ALTER TABLE public.screenshots                DROP COLUMN project_id;
ALTER TABLE public.flows                      DROP COLUMN project_id;
ALTER TABLE public.screen_families            DROP COLUMN project_id;
ALTER TABLE public.catalogue_group_appearance DROP COLUMN project_id;

-- ── 5. Drop slated-for-cleanup tables (per docs/cleanup-unused-tables.md) ─
-- Their FKs to projects would otherwise force ordering games here.
-- CASCADE so anything we missed gets cleaned up too.
DROP TABLE IF EXISTS public.connections CASCADE;
DROP TABLE IF EXISTS public.catalogue_figma_requests CASCADE;

-- ── 6. Drop the projects table itself ────────────────────────────────
DROP TABLE public.projects;

-- ── 7. Replace screenshots_with_annotation_labels RPC ────────────────
-- The previous body filtered by `s.project_id = any(project_ids)`.
-- That column no longer exists. Keep the signature (project_ids stays
-- as an ignored param) so already-deployed clients that pass it don't
-- error during the deploy window.
CREATE OR REPLACE FUNCTION public.screenshots_with_annotation_labels(
  project_ids uuid[],
  labels text[]
) RETURNS TABLE(screenshot_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT sa.screenshot_id
  FROM public.screenshot_annotations sa
  JOIN public.screenshots s ON s.id = sa.screenshot_id
  WHERE lower(sa.text) = ANY(labels);
$$;

COMMENT ON FUNCTION public.screenshots_with_annotation_labels(uuid[], text[]) IS
  'Returns screenshot ids whose annotations include any of the supplied labels (case-insensitive). The project_ids parameter is retained for backwards-compatibility with deployed clients but is ignored — project scoping was removed in migration 20260517_remove_project_scoping.';

COMMIT;
