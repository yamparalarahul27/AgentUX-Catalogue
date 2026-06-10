import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Config ---

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_IDS = (Deno.env.get("ALLOWED_TELEGRAM_USER_IDS") || "")
  .split(",")
  .filter(Boolean)
  .map(Number);
// Random string we set in Supabase secrets AND register with Telegram
// via setWebhook?secret_token=…. Telegram echoes it on every webhook
// delivery in the x-telegram-bot-api-secret-token header. Missing or
// mismatched → reject. Without this, anyone who learns the function
// URL can forge updates against the service-role key.
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const UPLOAD_GROUP = "Social";

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// --- Telegram helpers ---

interface TelegramUpdate {
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
}

async function sendReply(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// --- X / Twitter URL parsing ---
// Mirror of extractXUrlCandidate / parseXPostInput in
// designer/src/components/CatalogueVideosSection.tsx (~lines 78-115).
// Keep both copies in sync until we extract a shared package.

interface XPostMatch {
  tweetId: string;
  normalizedUrl: string;
}

function parseXPostInput(raw: string): XPostMatch | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const isXHost =
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com");
    if (!isXHost) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex(
      (part) => part === "status" || part === "statuses",
    );
    if (statusIndex === -1 || !parts[statusIndex + 1]) return null;
    const tweetId = parts[statusIndex + 1];
    if (!/^\d+$/.test(tweetId)) return null;
    return {
      tweetId,
      normalizedUrl: `https://x.com/i/status/${tweetId}`,
    };
  } catch {
    return null;
  }
}

function parseAllXPostsInText(raw: string): XPostMatch[] {
  const matches = raw.match(
    /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s"'<>]+/gi,
  );
  if (!matches) return [];
  const seen = new Set<string>();
  const results: XPostMatch[] = [];
  for (const candidate of matches) {
    const parsed = parseXPostInput(candidate.replace(/&amp;/g, "&"));
    if (!parsed) continue;
    if (seen.has(parsed.tweetId)) continue;
    seen.add(parsed.tweetId);
    results.push(parsed);
  }
  return results;
}

// --- Generic link parsing ---
// Captures any http(s) URL that is NOT an X/Twitter post (those go to videos).

interface LinkMatch {
  url: string;
  normalizedUrl: string;
  host: string;
}

function parseLinkInput(raw: string): LinkMatch | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const isXHost =
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com");
    if (isXHost) return null;
    const normalized =
      `${url.protocol}//${host}${url.pathname}${url.search}`.replace(/\/$/, "") ||
      url.toString();
    return { url: url.toString(), normalizedUrl: normalized, host };
  } catch {
    return null;
  }
}

function parseAllLinksInText(raw: string): LinkMatch[] {
  const matches = raw.match(/https?:\/\/[^\s"'<>]+/gi);
  if (!matches) return [];
  const seen = new Set<string>();
  const results: LinkMatch[] = [];
  for (const candidate of matches) {
    const parsed = parseLinkInput(candidate.replace(/&amp;/g, "&"));
    if (!parsed) continue;
    if (seen.has(parsed.normalizedUrl)) continue;
    seen.add(parsed.normalizedUrl);
    results.push(parsed);
  }
  return results;
}

async function downloadTelegramFile(
  fileId: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = (await fileRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error("Failed to get file path from Telegram");
  }
  const filePath = fileData.result.file_path;
  const fileName = filePath.split("/").pop() || `image-${Date.now()}.jpg`;

  const downloadRes = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
  );
  if (!downloadRes.ok) {
    throw new Error(`Failed to download file: ${downloadRes.status}`);
  }
  const buffer = await downloadRes.arrayBuffer();
  return { buffer, fileName };
}

// --- Upload logic ---

async function generateName(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const startOfDay = `${dateStr}T00:00:00.000Z`;
  const { count } = await supabase
    .from("screenshots")
    .select("id", { count: "exact", head: true })
    .eq("group", UPLOAD_GROUP)
    .gte("created_at", startOfDay);

  const sequence = (count ?? 0) + 1;
  return `social-${dateStr}-${String(sequence).padStart(3, "0")}`;
}

async function handlePhoto(
  chatId: number,
  fileId: string,
  originalFileName: string | undefined,
) {
  const supabase = getSupabase();

  // 1. Download image from Telegram
  const { buffer, fileName } = await downloadTelegramFile(fileId);
  const finalFileName = originalFileName || fileName;

  // 2. Generate name
  const name = await generateName(supabase);

  // 3. Upload to storage. project_id was dropped from the schema in
  // migration 20260517_remove_project_scoping; path now uses a fixed
  // `all-projects` prefix matching the main app's storage convention.
  const storagePath = `telegram-bot/all-projects/${Date.now()}-${finalFileName}`;
  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    await sendReply(chatId, `Upload failed: ${uploadError.message}`);
    return;
  }

  // 4. Insert screenshot row
  const { error: insertError } = await supabase
    .from("screenshots")
    .insert({
      name,
      file_name: finalFileName,
      storage_path: storagePath,
      group: UPLOAD_GROUP,
      flow_id: null,
      sequence: null,
      platform: null,
      theme: null,
      web_preset_key: null,
      mobile_os: null,
      metadata: {},
      reference_url: null,
      reference_storage_path: null,
      reference_label: null,
      uploader_user_id: null,
      uploader_email: "telegram-bot",
    })
    .select("id")
    .single();

  if (insertError) {
    await sendReply(chatId, `DB insert failed: ${insertError.message}`);
    return;
  }

  await sendReply(chatId, `Uploaded: ${name}`);
}

async function handleXPostLinks(chatId: number, matches: XPostMatch[]) {
  const supabase = getSupabase();
  const added: string[] = [];
  const duplicates: string[] = [];
  const failed: string[] = [];

  for (const match of matches) {
    const { error } = await supabase
      .from("catalogue_video_references")
      .insert({
        source_type: "x_post",
        external_id: match.tweetId,
        url: match.normalizedUrl,
        added_by_email: "telegram-bot",
      });

    if (!error) {
      added.push(match.normalizedUrl);
    } else if (error.code === "23505") {
      duplicates.push(match.normalizedUrl);
    } else {
      console.error("X post insert failed:", error);
      failed.push(match.normalizedUrl);
    }
  }

  const lines: string[] = [];
  if (added.length > 0) {
    lines.push(`Added ${added.length} video${added.length === 1 ? "" : "s"}:`);
    lines.push(...added);
  }
  if (duplicates.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Already in catalogue (${duplicates.length}):`,
      ...duplicates,
    );
  }
  if (failed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Failed (${failed.length}):`, ...failed);
  }
  if (lines.length === 0) {
    lines.push("No X post URLs recognized.");
  }
  await sendReply(chatId, lines.join("\n"));
}

async function handleLinkCaptures(chatId: number, matches: LinkMatch[]) {
  const supabase = getSupabase();
  const added: string[] = [];
  const duplicates: string[] = [];
  const failed: string[] = [];

  for (const match of matches) {
    const { error } = await supabase
      .from("catalogue_link_references")
      .insert({
        url: match.url,
        normalized_url: match.normalizedUrl,
        host: match.host,
        title: null,
        added_by_email: "telegram-bot",
      });

    if (!error) {
      added.push(match.url);
    } else if (error.code === "23505") {
      duplicates.push(match.url);
    } else {
      console.error("Link insert failed:", error);
      failed.push(match.url);
    }
  }

  const lines: string[] = [];
  if (added.length > 0) {
    lines.push(`Added ${added.length} link${added.length === 1 ? "" : "s"}:`);
    lines.push(...added);
  }
  if (duplicates.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Already in catalogue (${duplicates.length}):`,
      ...duplicates,
    );
  }
  if (failed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Failed (${failed.length}):`, ...failed);
  }
  if (lines.length === 0) {
    lines.push("No links recognized.");
  }
  await sendReply(chatId, lines.join("\n"));
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  // Fail closed if the webhook secret env isn't set — refusing to run
  // is safer than accepting forged updates with no verification.
  if (!WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    const message = update.message;
    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;

    // Access control — fail closed. If ALLOWED_TELEGRAM_USER_IDS is
    // unset / empty, reject everyone. Otherwise the unauthenticated
    // webhook would write to the catalogue under any Telegram user.
    if (ALLOWED_IDS.length === 0 || !userId || !ALLOWED_IDS.includes(userId)) {
      return new Response("OK", { status: 200 });
    }

    // /start command
    if (message.text?.startsWith("/start")) {
      await sendReply(
        chatId,
        'Welcome to Catalogue Bot!\n' +
          '• Send a screenshot image → uploads to the "Social" group.\n' +
          '• Paste an X (Twitter) post URL → adds it to the Videos tab.\n' +
          '• Paste any other URL → saves it to the Links tab.',
      );
      return new Response("OK", { status: 200 });
    }

    // Photo message (pick highest resolution)
    if (message.photo && message.photo.length > 0) {
      const bestPhoto = message.photo[message.photo.length - 1];
      await handlePhoto(chatId, bestPhoto.file_id, undefined);
      return new Response("OK", { status: 200 });
    }

    // Document with image MIME type
    if (
      message.document &&
      message.document.mime_type?.startsWith("image/")
    ) {
      await handlePhoto(
        chatId,
        message.document.file_id,
        message.document.file_name,
      );
      return new Response("OK", { status: 200 });
    }

    // Text message: route X posts to videos, all other URLs to links
    if (message.text && !message.text.startsWith("/")) {
      const xMatches = parseAllXPostsInText(message.text);
      const linkMatches = parseAllLinksInText(message.text);
      if (xMatches.length > 0) {
        await handleXPostLinks(chatId, xMatches);
      }
      if (linkMatches.length > 0) {
        await handleLinkCaptures(chatId, linkMatches);
      }
      if (xMatches.length > 0 || linkMatches.length > 0) {
        return new Response("OK", { status: 200 });
      }
    }

    // Anything else
    await sendReply(
      chatId,
      "Send a screenshot image to add it to the catalogue, an X post URL for the Videos tab, or any other URL for the Links tab.",
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Telegram bot error:", err);
    return new Response("OK", { status: 200 });
  }
});
