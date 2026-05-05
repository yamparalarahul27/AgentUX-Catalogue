// Fetches lightweight OpenGraph / oEmbed-style metadata (title, description,
// image) for a batch of URLs and returns them to the caller. Designed for the
// Saved Links tab to render rich rows without persisting metadata in the DB.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_URLS = 20;
const FETCH_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 1_000_000;
const USER_AGENT = "AgentUX-Catalogue-LinkPreview/1.0 (+https://agentux.dev)";

interface Metadata {
  title: string | null;
  description: string | null;
  image: string | null;
}

// Block obvious private / link-local addresses to make this less useful as an
// SSRF probe. We don't resolve DNS — that would still leave a TOCTOU window —
// but we reject literal private IPs and localhost names, which covers casual
// abuse from arbitrary anon callers.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMetaContent(
  html: string,
  candidates: Array<{ attr: "property" | "name"; value: string }>,
): string | null {
  for (const { attr, value } of candidates) {
    const re = new RegExp(
      `<meta[^>]+${attr}=["']${escapeRegex(value)}["'][^>]*>`,
      "i",
    );
    const tag = html.match(re);
    if (!tag) continue;
    const content = tag[0].match(/content=["']([^"']*)["']/i);
    if (content && content[1]) {
      const decoded = decodeEntities(content[1]).trim();
      if (decoded) return decoded;
    }
  }
  return null;
}

function parseTitle(html: string): string | null {
  const og = findMetaContent(html, [
    { attr: "property", value: "og:title" },
    { attr: "name", value: "twitter:title" },
  ]);
  if (og) return og;
  const tag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (tag && tag[1]) {
    const decoded = decodeEntities(tag[1]).trim();
    if (decoded) return decoded;
  }
  return null;
}

function parseDescription(html: string): string | null {
  return findMetaContent(html, [
    { attr: "property", value: "og:description" },
    { attr: "name", value: "twitter:description" },
    { attr: "name", value: "description" },
  ]);
}

function parseImage(html: string, baseUrl: string): string | null {
  const raw = findMetaContent(html, [
    { attr: "property", value: "og:image" },
    { attr: "property", value: "og:image:url" },
    { attr: "property", value: "og:image:secure_url" },
    { attr: "name", value: "twitter:image" },
    { attr: "name", value: "twitter:image:src" },
  ]);
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchOne(rawUrl: string): Promise<Metadata | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isPrivateHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let html = "";
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_BODY_BYTES || html.includes("</head>")) {
        try {
          await reader.cancel();
        } catch {
          // reader already closed
        }
        break;
      }
    }

    return {
      title: parseTitle(html),
      description: parseDescription(html),
      image: parseImage(html, res.url || parsed.toString()),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const urlsInput = Array.isArray(body.urls) ? body.urls : [];
  const urls = urlsInput
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, MAX_URLS);

  const results: Record<string, Metadata | null> = {};
  await Promise.all(
    urls.map(async (url) => {
      results[url] = await fetchOne(url);
    }),
  );

  return new Response(JSON.stringify({ results }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
