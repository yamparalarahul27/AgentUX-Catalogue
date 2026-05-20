// Fetches tweet metadata (author handle/name, text excerpt, primary
// poster image, like count, posted_at) for a list of tweet IDs by
// hitting cdn.syndication.twitter.com/tweet-result. That endpoint
// is what twitter.com itself uses to render embedded tweets and has
// been stable for years even though it's not officially documented.
// No auth, no rate-limit headers in practice for our volume.
//
// Used by the Videos section's lazy-backfill pass: when the SPA
// renders a card whose metadata_fetched_at is null, it batches a
// call here, returns the metadata, and writes it back to the
// catalogue_video_references row.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IDS = 20;
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = "AgentUX-Catalogue-TweetMeta/1.0 (+https://agentux.dev)";
const SYNDICATION_BASE = "https://cdn.syndication.twitter.com/tweet-result";

interface TweetMetadata {
  tweetId: string;
  authorHandle: string | null;
  authorName: string | null;
  textExcerpt: string | null;
  posterUrl: string | null;
  likedCount: number | null;
  postedAt: string | null;
}

async function fetchTweet(tweetId: string): Promise<TweetMetadata> {
  const empty: TweetMetadata = {
    tweetId,
    authorHandle: null,
    authorName: null,
    textExcerpt: null,
    posterUrl: null,
    likedCount: null,
    postedAt: null,
  };

  if (!/^\d+$/.test(tweetId)) return empty;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // The syndication endpoint requires a `token` query param. Twitter
    // computes it from the tweet ID via a small JS hash — implemented
    // here verbatim from the reverse-engineered formula every
    // tweet-fetcher uses. The current canonical implementation is:
    //   token = ((Number(tweetId) / 1e15) * Math.PI).toString(6 ** 2)
    const token = (
      (Number(tweetId) / 1e15) * Math.PI
    ).toString(6 ** 2).replace(/(0+|\.)/g, "");
    const url = `${SYNDICATION_BASE}?id=${encodeURIComponent(tweetId)}&token=${token}&lang=en`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return empty;
    const data = await response.json();

    const handle = typeof data?.user?.screen_name === "string" ? data.user.screen_name : null;
    const name = typeof data?.user?.name === "string" ? data.user.name : null;
    const rawText = typeof data?.text === "string" ? data.text : null;
    const excerpt = rawText ? trimExcerpt(rawText, 220) : null;

    let posterUrl: string | null = null;
    // Prefer video poster → photo → user banner. Most reliable across tweet types.
    const videoPoster =
      data?.mediaDetails?.find?.((m: { type?: string; media_url_https?: string }) => m?.type === "video" && typeof m?.media_url_https === "string")?.media_url_https;
    const photo =
      data?.mediaDetails?.find?.((m: { type?: string; media_url_https?: string }) => m?.type === "photo" && typeof m?.media_url_https === "string")?.media_url_https;
    if (typeof videoPoster === "string") posterUrl = videoPoster;
    else if (typeof photo === "string") posterUrl = photo;

    const liked = typeof data?.favorite_count === "number" ? data.favorite_count : null;
    const postedAt = typeof data?.created_at === "string" ? data.created_at : null;

    return {
      tweetId,
      authorHandle: handle,
      authorName: name,
      textExcerpt: excerpt,
      posterUrl,
      likedCount: liked,
      postedAt,
    };
  } catch (_err) {
    return empty;
  } finally {
    clearTimeout(timeoutId);
  }
}

function trimExcerpt(raw: string, maxChars: number): string {
  // Strip trailing pic.twitter.com / t.co URLs that the API includes
  // at the end of every media tweet's `text`.
  const cleaned = raw.replace(/\s+https?:\/\/(t\.co|pic\.twitter\.com)\/\S+$/g, "").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars - 1).trimEnd() + "…";
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

  const ids = Array.isArray((body as { tweetIds?: unknown }).tweetIds)
    ? ((body as { tweetIds: unknown[] }).tweetIds.filter((id) => typeof id === "string") as string[])
    : [];
  const trimmed = ids.slice(0, MAX_IDS);

  const results = await Promise.all(trimmed.map((id) => fetchTweet(id)));

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
