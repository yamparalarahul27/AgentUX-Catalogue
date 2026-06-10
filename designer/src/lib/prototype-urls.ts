// Resolve the public URL where a prototype HTML file lives.
//
// Production: route through `mockups.hirahul.xyz` (vercel.json rewrite
// → api/prototype-proxy.ts edge function) so that:
//   - Uploaded JavaScript runs on a different origin than the app —
//     its cookies + localStorage are isolated from hirahul.xyz,
//     blocking the obvious stored-XSS path where a malicious upload
//     steals the viewer's session.
//   - The edge function strips Supabase Storage's text/plain
//     Content-Type + nosniff + CSP-sandbox headers so the file
//     actually renders as HTML in the browser.
//
// Local dev: route through the Vite dev-server proxy at
// `/local-prototypes-proxy/<path>` (vite.config.ts) which mirrors
// the edge function's header rewriting. Without this the iframe
// in the Prototypes tab renders as plain text on localhost.
//
// NOTE: local dev does NOT exercise the origin-isolation property —
// the proxy serves on the same origin as the app. Verify security
// guarantees against a real production deploy, not a local one.
export function getPrototypeUrl(storagePath: string): string {
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalDev) {
    return `${window.location.origin}/local-prototypes-proxy/${storagePath}`;
  }
  return `https://mockups.hirahul.xyz/${storagePath}`;
}
