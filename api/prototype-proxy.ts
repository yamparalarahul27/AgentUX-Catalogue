// Vercel edge function that fronts Supabase Storage's public prototype
// bucket. Necessary because Supabase serves all public-bucket objects
// with three headers that break our use case:
//
//   content-type: text/plain                          → won't render as HTML
//   x-content-type-options: nosniff                   → prevents browser fallback
//   content-security-policy: default-src 'none'; sandbox  → blocks scripts/styles
//
// The CSP is Supabase's deliberate hardening for arbitrary user
// uploads on shared infra. For our use case we provide isolation via
// the separate mockups.hirahul.xyz subdomain, so additional CSP here
// just blocks the prototypes from working as intended.
//
// This function fetches the object as-is, injects a branded loading
// overlay at the top of <body>, and re-emits with clean headers so
// shared prototype links have a polished first-paint experience.
//
// Routed via vercel.json: any request to mockups.hirahul.xyz/<path>
// rewrites to /api/prototype-proxy?path=<path>.

import { injectOverlay } from './_prototype-overlay';

export const config = { runtime: 'edge' };

const SUPABASE_BASE = 'https://lpigdsgeqkhycvxsfpxe.supabase.co/storage/v1/object/public/prototypes';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const storagePath = url.searchParams.get('path');
  if (!storagePath) {
    return new Response('Missing path', { status: 400 });
  }

  // Defense in depth: refuse traversal characters. The Vercel rewrite
  // already captures a single positional group, so this should never
  // fire in practice — but cheap to keep as a guard.
  if (storagePath.includes('..')) {
    return new Response('Bad path', { status: 400 });
  }

  const upstreamUrl = `${SUPABASE_BASE}/${storagePath}`;
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl);
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('Not found', { status: upstream.status });
  }

  const headers = new Headers();
  headers.set('content-type', 'text/html; charset=utf-8');
  // `no-cache` = caches may store but must revalidate with the origin
  // before serving. Prototype share links are stable across re-uploads
  // (the file is overwritten in place — see reuploadPrototype in
  // use-catalogue-prototypes.ts), so an edited prototype MUST surface
  // immediately rather than serving stale HTML for up to a cache window.
  //
  // CAVEAT (revisit later): this trades the previous `max-age=300` CDN
  // cache for an origin fetch on every view. Negligible while prototypes
  // are internal / low-traffic. REVISIT when the feature graduates to
  // high-traffic public sharing — concretely, when a single prototype
  // link regularly draws sustained concurrent traffic, or total prototype
  // views exceed ~1k/day. The fix at that point is the ID-indirection
  // proxy (share URL keyed by row id, proxy resolves the current
  // storage_path), which restores CDN caching AND keeps links stable.
  // Tracked in docs/backlog.md.
  headers.set('cache-control', 'no-cache');
  // Intentionally NOT passing through:
  //   - content-security-policy (Supabase's `sandbox` keyword kills JS)
  //   - x-content-type-options (we want text/html honored, not nosniff'd)
  // Origin isolation comes from the subdomain itself — see vercel.json
  // host-conditional rewrite and docs/security-claude-permissions-public-release.md.

  // Buffer the response so we can inject the branded loading overlay
  // at the top of <body>. Mockups are typically small (10-100 KB), so
  // buffering vs streaming is a wash; the brand polish is worth it.
  const html = await upstream.text();
  const modified = injectOverlay(html);
  return new Response(modified, {
    status: 200,
    headers,
  });
}
