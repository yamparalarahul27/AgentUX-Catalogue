alter table public.screenshot_comments
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_email text;

create index if not exists screenshot_comments_screenshot_resolved_idx
  on public.screenshot_comments (screenshot_id, resolved_at, created_at);
