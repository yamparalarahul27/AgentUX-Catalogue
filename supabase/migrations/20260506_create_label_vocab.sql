-- Label vocabulary for the Labeling Studio.
-- Backs metadata.label.* fields with controlled values; see
-- docs/catalogue-ideation-2026-05-06-labeling-studio.md §18.2.
--
-- After this migration, the table is the source of truth: vocab edits
-- happen via SQL until a vocab admin UI lands (Phase 5+).

create table if not exists public.label_vocab (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  value       text not null,
  category    text,
  description text,
  synonyms    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);

create index if not exists label_vocab_kind_active_idx
  on public.label_vocab (kind)
  where is_active;

comment on table public.label_vocab is
  'Controlled vocabulary for metadata.label.* fields. Seeded 2026-05-06; '
  'edited via SQL until the admin UI lands.';

-- ---------------------------------------------------------------------------
-- Seed: controlled (single-pick) kinds
-- ---------------------------------------------------------------------------

insert into public.label_vocab (kind, value) values
  ('platform', 'web'),
  ('platform', 'ios'),
  ('platform', 'android'),
  ('platform', 'desktop_app'),
  ('platform', 'tablet'),
  ('platform', 'unknown');

insert into public.label_vocab (kind, value) values
  ('device_type', 'mobile'),
  ('device_type', 'desktop'),
  ('device_type', 'tablet'),
  ('device_type', 'responsive_web'),
  ('device_type', 'unknown');

insert into public.label_vocab (kind, value) values
  ('screen_state', 'default'),
  ('screen_state', 'loading'),
  ('screen_state', 'empty'),
  ('screen_state', 'error'),
  ('screen_state', 'success'),
  ('screen_state', 'disabled'),
  ('screen_state', 'selected'),
  ('screen_state', 'expanded'),
  ('screen_state', 'collapsed'),
  ('screen_state', 'modal_open'),
  ('screen_state', 'unknown');

insert into public.label_vocab (kind, value) values
  ('theme', 'light'),
  ('theme', 'dark'),
  ('theme', 'mixed'),
  ('theme', 'unknown');

insert into public.label_vocab (kind, value) values
  ('density', 'sparse'),
  ('density', 'comfortable'),
  ('density', 'compact'),
  ('density', 'dense'),
  ('density', 'unknown');

-- ---------------------------------------------------------------------------
-- Seed: page_type (multi-pick)
-- ---------------------------------------------------------------------------

insert into public.label_vocab (kind, value) values
  ('page_type', 'Welcome Screen'),
  ('page_type', 'Login'),
  ('page_type', 'Sign Up'),
  ('page_type', 'Onboarding'),
  ('page_type', 'Dashboard'),
  ('page_type', 'Settings'),
  ('page_type', 'Checkout'),
  ('page_type', 'Pricing'),
  ('page_type', 'Search'),
  ('page_type', 'List'),
  ('page_type', 'Detail'),
  ('page_type', 'Editor'),
  ('page_type', 'Upload'),
  ('page_type', 'Empty State'),
  ('page_type', 'Error State'),
  ('page_type', 'Success State'),
  ('page_type', 'Modal'),
  ('page_type', 'Permission Prompt'),
  ('page_type', 'Account Setup'),
  ('page_type', 'Profile'),
  ('page_type', 'Feed'),
  ('page_type', 'Notification'),
  ('page_type', 'Form');

-- ---------------------------------------------------------------------------
-- Seed: ui_element (multi-pick, with categories and synonyms)
-- ---------------------------------------------------------------------------

insert into public.label_vocab (kind, value, category, synonyms) values
  ('ui_element', 'Modal',                    'Container',  array['Dialog']),
  ('ui_element', 'Bottom Sheet',             'Container',  array['Drawer (mobile)']),
  ('ui_element', 'Sidebar',                  'Container',  array['Drawer (web)', 'Side Nav']),
  ('ui_element', 'Card',                     'Container',  array[]::text[]),
  ('ui_element', 'Toast',                    'Feedback',   array['Snackbar', 'Notification']),
  ('ui_element', 'Banner',                   'Feedback',   array['Alert']),
  ('ui_element', 'Tooltip',                  'Feedback',   array[]::text[]),
  ('ui_element', 'Badge',                    'Feedback',   array[]::text[]),
  ('ui_element', 'Button',                   'Input',      array['CTA']),
  ('ui_element', 'Text Field',               'Input',      array['Input']),
  ('ui_element', 'Search Field',             'Input',      array[]::text[]),
  ('ui_element', 'Dropdown',                 'Input',      array['Select']),
  ('ui_element', 'Checkbox',                 'Input',      array[]::text[]),
  ('ui_element', 'Radio Selector',           'Input',      array['Radio Button']),
  ('ui_element', 'Stepper',                  'Input',      array[]::text[]),
  ('ui_element', 'Form',                     'Input',      array[]::text[]),
  ('ui_element', 'Navigation Bar',           'Navigation', array['App Bar', 'Top Bar']),
  ('ui_element', 'Tab Bar',                  'Navigation', array['Bottom Nav']),
  ('ui_element', 'Menu',                     'Navigation', array['Action Menu']),
  ('ui_element', 'List',                     'Display',    array[]::text[]),
  ('ui_element', 'List Row',                 'Display',    array[]::text[]),
  ('ui_element', 'Table',                    'Display',    array['Data Table']),
  ('ui_element', 'Avatar',                   'Display',    array[]::text[]),
  ('ui_element', 'Icon',                     'Display',    array[]::text[]),
  ('ui_element', 'Progress Indicator',       'Display',    array['Progress Bar', 'Spinner']),
  ('ui_element', 'Carousel',                 'Display',    array['Slider']),
  ('ui_element', 'Hero Image',               'Display',    array[]::text[]),
  ('ui_element', 'Product Image',            'Display',    array[]::text[]),
  ('ui_element', 'Calendar',                 'Display',    array['Date Picker']),
  ('ui_element', 'Chart',                    'Display',    array['Graph']),
  ('ui_element', 'Map',                      'Display',    array[]::text[]),
  ('ui_element', 'Empty State Illustration', 'Display',    array[]::text[]);

-- ---------------------------------------------------------------------------
-- Seed: ux_pattern (multi-pick)
-- ---------------------------------------------------------------------------

insert into public.label_vocab (kind, value) values
  ('ux_pattern', 'Single CTA'),
  ('ux_pattern', 'Progressive Disclosure'),
  ('ux_pattern', 'Inline Validation'),
  ('ux_pattern', 'Social Proof'),
  ('ux_pattern', 'Trust Signal'),
  ('ux_pattern', 'Feature Announcement'),
  ('ux_pattern', 'Mode Selection'),
  ('ux_pattern', 'Deferrable Decision'),
  ('ux_pattern', 'Step-based Onboarding'),
  ('ux_pattern', 'Personalization'),
  ('ux_pattern', 'Selection List'),
  ('ux_pattern', 'Comparison'),
  ('ux_pattern', 'Confirmation'),
  ('ux_pattern', 'Recovery'),
  ('ux_pattern', 'Upgrade Prompt'),
  ('ux_pattern', 'Paywall'),
  ('ux_pattern', 'Guided Tour'),
  ('ux_pattern', 'Search and Filter'),
  ('ux_pattern', 'Bulk Actions'),
  ('ux_pattern', 'Drag and Drop'),
  ('ux_pattern', 'Infinite Scroll');
