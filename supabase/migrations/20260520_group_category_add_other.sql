-- Widen the catalogue_group_appearance.category CHECK constraint to
-- accept 'other' alongside the existing 'cex' and 'dex'. Lets groups
-- be explicitly tagged as neither CEX nor DEX (analytics tools,
-- regulators, news sites, etc.) — distinct from 'Untagged' which
-- means "we haven't classified this yet".
--
-- Companion change: designer/src/lib/catalogue-group-appearance.ts
-- widens `CatalogueGroupCategory` to include 'other'.

alter table public.catalogue_group_appearance
  drop constraint if exists catalogue_group_appearance_category_check;

alter table public.catalogue_group_appearance
  add constraint catalogue_group_appearance_category_check
  check (category is null or category in ('cex', 'dex', 'other'));
