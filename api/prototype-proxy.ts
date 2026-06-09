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
// This function fetches the object as-is and re-emits the body with
// clean headers, so mockups render in the browser like any other page.
//
// Routed via vercel.json: any request to mockups.hirahul.xyz/<path>
// rewrites to /api/prototype-proxy?path=<path>.

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
  headers.set('cache-control', 'public, max-age=300');
  // Intentionally NOT passing through:
  //   - content-security-policy (Supabase's `sandbox` keyword kills JS)
  //   - x-content-type-options (we want text/html honored, not nosniff'd)
  // Origin isolation comes from the subdomain itself — see vercel.json
  // host-conditional rewrite and docs/security-claude-permissions-public-release.md.

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
