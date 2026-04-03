alter table public.screenshots
  add column if not exists uploader_user_id text,
  add column if not exists uploader_email text;

create index if not exists screenshots_team_analytics_idx
  on public.screenshots (created_at desc, platform, uploader_email, project_id);
