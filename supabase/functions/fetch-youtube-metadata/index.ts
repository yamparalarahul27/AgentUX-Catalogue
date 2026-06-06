// Fetches YouTube video metadata (title, channel name, thumbnail) for a
// list of YouTube video IDs by hitting YouTube's public oEmbed endpoint
// (https://www.youtube.com/oembed). No API key required. Returns the
// same shape the catalogue's video-references table writes for X posts,
// so the SPA's existing lazy-backfill plumbing handles YouTube rows
// without a separate code path.
//
// Used by the Videos section's YouTube tab: when the SPA renders a
// YouTube card whose metadata_fetched_at is null, it batches a call
// here, returns the metadata, and writes it back to the
// catalogue_video_references row.
//
// oEmbed returns title + author_name + author_url + thumbnail_url. It
// does NOT return like/view count or publish date — we deliberately
// skip those for v1 (kept null on the row). If those become required
// we'd add a YouTube Data API key + second hit, but it adds complexity
// without changing the felt UX much.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IDS = 20;
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = "AgentUX-Catalogue-YouTubeMeta/1.0 (+https://agentux.dev)";
const OEMBED_BASE = "https://www.youtube.com/oembed";

interface YouTubeMetadata {
  videoId: string;
  title: string | null;
  authorName: string | null;
  authorHandle: string | null;
  thumbnailUrl: string | null;
}

async function fetchYouTube(videoId: string): Promise<YouTubeMetadata> {
  const empty: YouTubeMetadata = {
    videoId,
    title: null,
    authorName: null,
    authorHandle: null,
    thumbnailUrl: null,
  };

  // Defensive: oEmbed will reject malformed IDs but we filter first to
  // avoid spending the round-trip.
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return empty;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const url = `${OEMBED_BASE}?url=${encodeURIComponent(watchUrl)}&format=json`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return empty;
    const data = await response.json();

    const title = typeof data?.title === "string" ? data.title : null;
    const authorName = typeof data?.author_name === "string" ? data.author_name : null;
    const thumbnailUrl = typeof data?.thumbnail_url === "string" ? data.thumbnail_url : null;

    // Parse the channel handle from author_url when YouTube uses the
    // modern `youtube.com/@handle` URL shape. Older channel URLs use
    // `/channel/UC...` which doesn't carry a human handle — leave null
    // for those rather than write the opaque ID.
    let authorHandle: string | null = null;
    if (typeof data?.author_url === "string") {
      const match = data.author_url.match(/\/@([A-Za-z0-9._-]+)/);
      if (match) authorHandle = match[1];
    }

    return {
      videoId,
      title,
      authorName,
      authorHandle,
      thumbnailUrl,
    };
  } catch (_err) {
    return empty;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const ids = Array.isArray((body as { videoIds?: unknown }).videoIds)
    ? ((body as { videoIds: unknown[] }).videoIds.filter((id) => typeof id === "string") as string[])
    : [];
  const trimmed = ids.slice(0, MAX_IDS);

  const results = await Promise.all(trimmed.map((id) => fetchYouTube(id)));

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
