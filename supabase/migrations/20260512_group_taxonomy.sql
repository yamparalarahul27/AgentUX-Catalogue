-- Add category & region taxonomy to catalogue_group_appearance.
-- Both nullable: null means "untagged" on that axis.
-- Drives the Groups view filter bar in admin > Team > Groups.

alter table public.catalogue_group_appearance
  add column if not exists category text null,
  add column if not exists region text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'catalogue_group_appearance_category_check'
  ) then
    alter table public.catalogue_group_appearance
      add constraint catalogue_group_appearance_category_check
      check (category is null or category in ('cex', 'dex'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catalogue_group_appearance_region_check'
  ) then
    alter table public.catalogue_group_appearance
      add constraint catalogue_group_appearance_region_check
      check (region is null or region in ('india', 'global'));
  end if;
end $$;
