// Vercel serverless function that serves /designer/share URLs with
// per-share Open Graph + Twitter meta tags injected into the HTML
// head. Lets Slack / iMessage / Twitter / Discord etc. render a
// preview card with the actual screenshot when someone pastes a
// share link.
//
// Returns the same catalogue.html the static rewrite would have
// served — just with og:image, og:title, og:description, twitter:*
// meta tags pre-baked into the <head>. Humans get the SPA exactly
// as before; crawlers read the meta tags before any JS executes.
//
// Companion code:
//   - vercel.json — routes /designer/share to this function ahead
//     of the catalogue.html catch-all
//   - designer/src/lib/share-url.ts — share URL builder/parser
//   - designer/src/components/SharePage.tsx — the SPA share view

import fs from 'node:fs';
import path from 'node:path';

// Minimal types matching the Vercel serverless function contract.
// Avoids pulling in @vercel/node just for types (it ships with a
// vulnerable `undici` transitive that trips `npm audit` in CI).
// Vercel's runtime provides `query`, `setHeader`, `status`, and
// `send` on its passed objects — these are the surface area we
// actually use.
interface VercelRequest {
  query: Record<string, string | string[] | undefined>;
  url?: string;
}
interface VercelResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  send: (body: string) => void;
}

interface ScreenshotRow {
  id: string;
  name: string | null;
  group: string | null;
  storage_path: string | null;
  platform: string | null;
  metadata: Record<string, unknown> | null;
}

interface OgFields {
  title: string;
  description: string;
  image: string;
}

const DEFAULT_OG: OgFields = {
  title: 'AgentUX Catalogue',
  description: 'Screenshot library for product teams — organize, share, and collaborate.',
  image: '',
};

const CACHE_SECONDS = 300; // 5 min — crawlers re-fetch on share, screenshots rarely change

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  const og = await resolveOgFields(req, supabaseUrl, supabaseAnonKey);
  const template = loadTemplate();
  if (!template) {
    res.status(500).send('Share page template missing');
    return;
  }

  const html = injectMeta(template, og);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`);
  res.status(200).send(html);
}

async function resolveOgFields(
  req: VercelRequest,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<OgFields> {
  const { screenshot_id, group, flow, platform, title: titleParam } = req.query as Record<string, string | undefined>;

  // Single-screenshot share — the rich case. Fetch the row, build
  // a title from name + group, use the screenshot itself as og:image.
  if (typeof screenshot_id === 'string' && screenshot_id.length > 0 && supabaseUrl && supabaseAnonKey) {
    try {
      const row = await fetchScreenshot(supabaseUrl, supabaseAnonKey, screenshot_id);
      if (row) {
        return {
          title: buildTitle(row),
          description: buildDescription(row),
          image: buildPublicImageUrl(supabaseUrl, row.storage_path),
        };
      }
    } catch (err) {
      console.error('share-meta: screenshot fetch failed', err);
    }
  }

  // Filter share — title from query, generic description. v1 doesn't
  // fetch a representative screenshot for the og:image; can add in a
  // follow-up if filter-share previews need to be richer.
  if (group && flow) {
    const platformLabel = platform === 'mobile' ? 'Mobile' : platform === 'web' ? 'Web' : '';
    return {
      title: titleParam || `${group} · ${flow}${platformLabel ? ` (${platformLabel})` : ''}`,
      description: `${platformLabel ? `${platformLabel} ` : ''}flow shared via AgentUX Catalogue.`,
      image: '',
    };
  }

  return DEFAULT_OG;
}

async function fetchScreenshot(
  supabaseUrl: string,
  anonKey: string,
  screenshotId: string,
): Promise<ScreenshotRow | null> {
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/screenshots`
    + `?id=eq.${encodeURIComponent(screenshotId)}`
    + `&deleted_at=is.null`
    + `&select=id,name,group,storage_path,platform,metadata`
    + `&limit=1`;

  const resp = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json() as ScreenshotRow[];
  return rows[0] ?? null;
}

function buildPublicImageUrl(supabaseUrl: string, storagePath: string | null): string {
  if (!storagePath) return '';
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/screenshots/${storagePath}`;
}

function buildTitle(row: ScreenshotRow): string {
  const parts: string[] = [];
  if (row.name) parts.push(row.name);
  if (row.group) parts.push(row.group);
  parts.push('AgentUX');
  return parts.join(' · ');
}

function buildDescription(row: ScreenshotRow): string {
  const flow = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as { catalogue_flow_label?: string }).catalogue_flow_label
    : null;
  if (flow && row.group) return `${flow} flow from ${row.group} — shared via AgentUX.`;
  if (row.group) return `Screenshot from ${row.group} — shared via AgentUX.`;
  return 'Screenshot shared via AgentUX Catalogue.';
}

function loadTemplate(): string | null {
  // Vercel serverless functions can read sibling deployed files via
  // process.cwd(). The catalogue.html lives in `site/designer/`.
  const templatePath = path.join(process.cwd(), 'site', 'designer', 'catalogue.html');
  try {
    return fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    console.error('share-meta: template read failed', err);
    return null;
  }
}

function injectMeta(template: string, og: OgFields): string {
  const meta = buildMetaTags(og);
  // Inject the meta block right after the opening <head>. The
  // original <title> in the template stays — most crawlers prefer
  // og:title over <title>, but a generic <title> as a fallback is
  // fine. We DO NOT remove or rewrite it.
  return template.replace(/<head>/i, `<head>\n${meta}`);
}

function buildMetaTags(og: OgFields): string {
  const cardType = og.image ? 'summary_large_image' : 'summary';
  const lines = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="AgentUX Catalogue" />`,
    `<meta property="og:title" content="${escapeAttr(og.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(og.description)}" />`,
    og.image ? `<meta property="og:image" content="${escapeAttr(og.image)}" />` : '',
    `<meta name="twitter:card" content="${cardType}" />`,
    `<meta name="twitter:title" content="${escapeAttr(og.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(og.description)}" />`,
    og.image ? `<meta name="twitter:image" content="${escapeAttr(og.image)}" />` : '',
    `<meta name="description" content="${escapeAttr(og.description)}" />`,
  ].filter(Boolean);
  return lines.map((line) => `    ${line}`).join('\n');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
