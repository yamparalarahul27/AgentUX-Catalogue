-- "Tools" sub-tab in the Links section.
--
-- A tool is just a saved link the user has flagged. The Tools sub-tab is a
-- filtered view over catalogue_link_references (is_tool = true); a flagged
-- link still shows under Saved Links. Flag / unflag happens in-app via the
-- wrench toggle on each link card.
--
-- Companion code:
--   - designer/sql/catalogue-links.sql               — canonical table shape
--   - designer/src/components/CatalogueLinksSection.tsx

alter table public.catalogue_link_references
  add column if not exists is_tool boolean not null default false;
