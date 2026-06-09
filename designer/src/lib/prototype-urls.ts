// Resolve the public URL where a prototype HTML file lives.
//
// In production we proxy through `mockups.hirahul.xyz` (configured in
// vercel.json) so that uploaded JavaScript runs on a different origin
// than the app — its cookies + localStorage are isolated from
// hirahul.xyz, blocking the obvious stored-XSS path where a malicious
// upload steals the viewer's session.
//
// In local dev there's no subdomain proxy, so we hit the Supabase
// Storage public URL directly. NOTE: this means local testing does
// NOT exercise the origin-isolation property — verify security
// guarantees against a real production deploy, not a local one.
export function getPrototypeUrl(storagePath: string): string {
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalDev) {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    if (!supabaseUrl) return '#';
    return `${supabaseUrl}/storage/v1/object/public/prototypes/${storagePath}`;
  }
  return `https://mockups.hirahul.xyz/${storagePath}`;
}
