// shortcut-upload
//
// iPhone share-to-app ingress for the catalogue, driven by an Apple
// Shortcut on the iOS Share Sheet. The Web Share Target API (PR #289) is
// Android / desktop-Chromium only, so iOS gets this token-authed endpoint
// instead. Mirrors the Telegram bot's routing — images, X posts, YouTube
// videos, and generic links each land in the same place the app uses.
//
//   image file        → screenshots          (group "iOS Inbox")
//   x.com/…/status/id  → catalogue_video_references  (source_type x_post)
//   youtube / youtu.be → catalogue_video_references  (source_type youtube)
//   any other URL      → catalogue_link_references
//
// Auth: a dedicated upload-only token (header X-Upload-Token, fallback form
// field `token`). We store only sha256(token); a match resolves the owner's
// email, which becomes the provenance on every inserted row. Never the
// account passcode — see docs/ios-shortcut-share-design.md.
//
// Companion code:
//   - supabase/migrations/20260623_upload_tokens.sql
//   - designer/src/lib/upload-token.ts
//   - docs/ios-shortcut-setup.md

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const INBOX_GROUP = 'iOS Inbox';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // generous; iOS screenshots are ~1-3 MB

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-upload-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- URL parsing (mirrors telegram-bot/index.ts + CatalogueVideosSection.tsx) ---

function isXHost(host: string): boolean {
  return (
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com')
  );
}

function parseXPost(raw: string): { tweetId: string; normalizedUrl: string } | null {
  try {
    const url = new URL(raw.trim());
    if (!isXHost(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const statusIndex = parts.findIndex((p) => p === 'status' || p === 'statuses');
    if (statusIndex === -1 || !parts[statusIndex + 1]) return null;
    const tweetId = parts[statusIndex + 1];
    if (!/^\d+$/.test(tweetId)) return null;
    return { tweetId, normalizedUrl: `https://x.com/i/status/${tweetId}` };
  } catch {
    return null;
  }
}

function parseYouTube(raw: string): { videoId: string; normalizedUrl: string } | null {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const isYouTubeHost =
      host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be';
    if (!isYouTubeHost) return null;

    let videoId: string | null = null;
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      const first = parts[0];
      if (first === 'watch') videoId = url.searchParams.get('v');
      else if (first === 'embed' || first === 'shorts' || first === 'live' || first === 'v') {
        videoId = parts[1] ?? null;
      }
    }
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { videoId, normalizedUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch {
    return null;
  }
}

function parseGenericLink(raw: string): { url: string; normalizedUrl: string; host: string } | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const normalized =
      `${url.protocol}//${host}${url.pathname}${url.search}`.replace(/\/$/, '') || url.toString();
    return { url: url.toString(), normalizedUrl: normalized, host };
  } catch {
    return null;
  }
}

// --- Ingest handlers ---

async function generateName(): Promise<string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { count } = await supabase
    .from('screenshots')
    .select('id', { count: 'exact', head: true })
    .eq('group', INBOX_GROUP)
    .gte('created_at', `${dateStr}T00:00:00.000Z`);
  return `ios-${dateStr}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

async function ingestImage(file: File, email: string): Promise<{ id: string }> {
  const buffer = await file.arrayBuffer();
  const safeName = (file.name || `ios-${Date.now()}.jpg`).replace(/\s+/g, '-');
  const storagePath = `ios-shortcut/all-projects/ios-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('screenshots')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadError) throw new Error('upload_failed');

  const name = await generateName();
  // Column set copied verbatim from the proven Telegram-bot insert
  // (handlePhoto) so it matches the live screenshots schema exactly.
  const { data, error } = await supabase
    .from('screenshots')
    .insert({
      name,
      file_name: file.name || safeName,
      storage_path: storagePath,
      group: INBOX_GROUP,
      flow_id: null,
      sequence: null,
      platform: null,
      theme: null,
      web_preset_key: null,
      mobile_os: null,
      metadata: { source: 'ios-shortcut' },
      reference_url: null,
      reference_storage_path: null,
      reference_label: null,
      uploader_user_id: null,
      uploader_email: email,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('insert_failed');
  return { id: data.id as string };
}

// Returns a one-word outcome tag so the caller can build a summary without
// leaking row internals.
type LinkOutcome = 'x_post' | 'youtube' | 'link' | 'duplicate' | 'failed';

async function ingestUrl(raw: string, email: string): Promise<LinkOutcome> {
  const x = parseXPost(raw);
  if (x) {
    const { error } = await supabase.from('catalogue_video_references').insert({
      source_type: 'x_post',
      external_id: x.tweetId,
      url: x.normalizedUrl,
      added_by_email: email,
    });
    if (!error) return 'x_post';
    return error.code === '23505' ? 'duplicate' : 'failed';
  }

  const yt = parseYouTube(raw);
  if (yt) {
    const { error } = await supabase.from('catalogue_video_references').insert({
      source_type: 'youtube',
      external_id: yt.videoId,
      url: yt.normalizedUrl,
      added_by_email: email,
    });
    if (!error) return 'youtube';
    return error.code === '23505' ? 'duplicate' : 'failed';
  }

  const link = parseGenericLink(raw);
  if (link) {
    const { error } = await supabase.from('catalogue_link_references').insert({
      url: link.url,
      normalized_url: link.normalizedUrl,
      host: link.host,
      title: null,
      added_by_email: email,
    });
    if (!error) return 'link';
    return error.code === '23505' ? 'duplicate' : 'failed';
  }

  return 'failed';
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Collect the token + payload from either multipart form (Shortcut "Get
  // Contents of URL" with Request Body: Form) or a JSON body.
  let token = req.headers.get('x-upload-token')?.trim() || '';
  let imageFile: File | null = null;
  const urls: string[] = [];

  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      if (!token) token = (form.get('token') as string)?.trim() || '';
      const image = form.get('image');
      if (image instanceof File && image.size > 0) imageFile = image;
      for (const key of ['url', 'text']) {
        const value = form.get(key);
        if (typeof value === 'string' && value.trim()) urls.push(value.trim());
      }
    } else if (contentType.includes('application/json')) {
      const body = (await req.json()) as { token?: string; url?: string; text?: string };
      if (!token) token = body.token?.trim() || '';
      for (const value of [body.url, body.text]) {
        if (value && value.trim()) urls.push(value.trim());
      }
    } else {
      // Plain text body — treat as a URL/text payload.
      const text = (await req.text()).trim();
      if (text) urls.push(text);
    }
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (!token) return json({ error: 'unauthorized' }, 401);

  // Resolve the token → owner email. Generic 401 on any miss; never echo
  // the token or the reason.
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('upload_tokens')
    .select('email')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (tokenErr || !tokenRow) return json({ error: 'unauthorized' }, 401);
  const email = tokenRow.email as string;

  if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
    return json({ error: 'image_too_large' }, 413);
  }
  if (!imageFile && urls.length === 0) {
    return json({ error: 'nothing_to_ingest' }, 400);
  }

  const added = { images: 0, x_posts: 0, youtube: 0, links: 0 };
  let duplicates = 0;
  let failed = 0;

  try {
    if (imageFile) {
      await ingestImage(imageFile, email);
      added.images += 1;
    }
    for (const raw of urls) {
      const outcome = await ingestUrl(raw, email);
      if (outcome === 'x_post') added.x_posts += 1;
      else if (outcome === 'youtube') added.youtube += 1;
      else if (outcome === 'link') added.links += 1;
      else if (outcome === 'duplicate') duplicates += 1;
      else failed += 1;
    }
  } catch {
    return json({ error: 'ingest_failed' }, 500);
  }

  await supabase
    .from('upload_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('email', email);

  return json({ ok: true, added, duplicates, failed });
});
