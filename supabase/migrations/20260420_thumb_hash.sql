-- Add thumb_hash column to screenshots for ThumbHash placeholders
-- ThumbHash encodes a ~28-byte blurry placeholder per image,
-- enabling instant visual feedback before full images load.

alter table public.screenshots
  add column if not exists thumb_hash text;

comment on column public.screenshots.thumb_hash is
  'Base64-encoded ThumbHash (~28 bytes) for blurry image placeholder';
