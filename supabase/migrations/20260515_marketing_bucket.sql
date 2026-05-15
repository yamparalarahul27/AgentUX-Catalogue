-- Marketing Bucket — group-based approach.
--
-- Marketing role uploads land in a single hardcoded group called
-- "Marketing Bucket" (the client enforces this; this migration adds
-- only the supporting `suggested_group` column that lets Marketing
-- hint where content should eventually go).
--
-- Admin promotes content out of the Marketing Bucket by editing the
-- group via the existing lightbox group dropdown — no new actions, no
-- new tables, no new RLS policies.
--
-- Companion code:
--   - designer/src/lib/marketing-bucket.ts  — MARKETING_BUCKET_GROUP constant
--   - designer/src/hooks/use-catalogue-upload.ts — Marketing role lock + suggested-group field
--   - docs/marketing-bucket.md (parked memory: project_marketing_buckets_decision.md)
--
-- See parked_full_bucket_architecture.md for the original scope-based
-- design that was deferred in favour of this lighter approach.

-- ════════════════════════════════════════════════════════════════════
-- 1. Add the `suggested_group` hint column on screenshots
--
-- Free-text. Marketing fills this in at upload time when they think a
-- screenshot belongs in a specific catalogue group (e.g., "Apex Promos").
-- Admin sees the hint when reviewing and uses the existing group
-- dropdown to move the screenshot out of the Marketing Bucket.
-- Nullable — most Marketing uploads stay in the Bucket permanently
-- and don't need a hint.
-- ════════════════════════════════════════════════════════════════════

alter table public.screenshots
  add column if not exists suggested_group text;

comment on column public.screenshots.suggested_group is
  'Free-text hint from the uploader about which catalogue group this '
  'screenshot belongs to. Used by the Marketing Bucket workflow: '
  'Marketing role uploads to the hardcoded "Marketing Bucket" group '
  'and types a suggested catalogue group; Admin reads the hint and '
  'promotes via the existing group dropdown. Nullable.';

-- ════════════════════════════════════════════════════════════════════
-- 2. Drop the unused `requires_approval` column from roles
--
-- Added in PR A0's 20260515_roles_and_capabilities.sql to support an
-- approval workflow that was subsequently parked (see
-- parked_approval_workflow.md) in favour of the Marketing Bucket.
-- The column is unused — nothing in code reads it, no RLS references
-- it. Drop it to keep the roles table clean. If approval comes back
-- later, a new column with a more specific name should be added.
-- ════════════════════════════════════════════════════════════════════

alter table public.roles
  drop column if exists requires_approval;
