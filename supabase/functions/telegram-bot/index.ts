import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Config ---

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_IDS = (Deno.env.get("ALLOWED_TELEGRAM_USER_IDS") || "")
  .split(",")
  .filter(Boolean)
  .map(Number);
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

async function getDefaultProject(
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function generateName(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
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
    .eq("project_id", projectId)
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

  // 2. Get default project
  const project = await getDefaultProject(supabase);
  if (!project) {
    await sendReply(chatId, "No project found. Create a project in the catalogue first.");
    return;
  }

  // 3. Generate name
  const name = await generateName(supabase, project.id);

  // 4. Upload to storage
  const storagePath = `telegram-bot/${project.id}/${Date.now()}-${finalFileName}`;
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

  // 5. Insert screenshot row
  const { error: insertError } = await supabase
    .from("screenshots")
    .insert({
      project_id: project.id,
      name,
      file_name: finalFileName,
      storage_path: storagePath,
      group: UPLOAD_GROUP,
      flow_id: null,
      screen_family_id: null,
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

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    const message = update.message;
    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;

    // Access control
    if (ALLOWED_IDS.length > 0 && (!userId || !ALLOWED_IDS.includes(userId))) {
      return new Response("OK", { status: 200 });
    }

    // /start command
    if (message.text?.startsWith("/start")) {
      await sendReply(
        chatId,
        'Welcome to Catalogue Bot! Send me a screenshot image and I\'ll upload it to the "Social" group in your catalogue.',
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

    // Anything else
    await sendReply(
      chatId,
      "Send me a screenshot image to upload it to the catalogue.",
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Telegram bot error:", err);
    return new Response("OK", { status: 200 });
  }
});
