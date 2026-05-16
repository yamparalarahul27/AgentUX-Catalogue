-- Re-enable anon SELECT on catalogue_group_appearance so the public
-- share page can render the group icon next to the title.
--
-- This restores ONE of the four anon policies dropped in
-- 20260513_enable_rls_public_release.sql. The other three (anon INSERT,
-- UPDATE, DELETE) stay dropped — writes are still authenticated-only.
--
-- Risk: anyone with a share URL can query the table directly and read
-- every group's label / icon URL / category / region. Acceptable
-- tradeoff — groups are brand names (Binance, Aggr.watch, etc.) and
-- icons are already in a public storage bucket. No sensitive data
-- lives in this table.
--
-- Companion code:
--   - designer/src/components/SharePage.tsx (uses CatalogueGroupLabel
--     in the H1 next to the title)
--   - designer/src/components/CatalogueGroupLabel.tsx (queries this table)

drop policy if exists catalogue_group_appearance_select_anon
  on public.catalogue_group_appearance;

create policy catalogue_group_appearance_select_anon
  on public.catalogue_group_appearance
  for select to anon
  using (true);
