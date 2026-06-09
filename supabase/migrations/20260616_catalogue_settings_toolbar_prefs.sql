-- Per-user toolbar customization stored on the existing catalogue_settings
-- row (one per user). Two parallel arrays of stable string keys.
--
-- toolbar_hidden_keys — controls the user has chosen to hide from the
--                       catalogue toolbar. Empty = default (everything
--                       visible). Known keys at v1:
--                         'sort'            — Latest / A-Z dropdown
--                         'density_stack'   — Stack option in density toggle
--                         'density_gallery' — Gallery option in density toggle
--                         'share'           — Share-this-view button
--                         'save'            — My Saved bookmark filter
--                       Upload, Grid density, and Search are intentionally
--                       not in this list — they're always shown.
--
-- toolbar_pinned_keys — filters the user has chosen to surface inline as
--                       tab switches in the toolbar (instead of being
--                       buried inside the Filters dropdown). Empty =
--                       default (everything inside the dropdown). Known
--                       keys at v1:
--                         'platform' — Mobile / Web tab switch
--                         'theme'    — Light / Dark tab switch
--
-- Defaults are empty arrays so existing users see no change. RLS already
-- gates catalogue_settings to (user_id = auth.uid()), so these inherit
-- the right access control without new policies.

alter table public.catalogue_settings
  add column if not exists toolbar_hidden_keys text[] not null default '{}',
  add column if not exists toolbar_pinned_keys text[] not null default '{}';
