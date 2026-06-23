# iOS Shortcut — share-to-catalogue setup

## What it does

Lets you share **screenshots and links straight from your iPhone** into the
catalogue without opening the app — using an Apple Shortcut on the iOS Share
Sheet. Routing mirrors the Telegram bot:

| You share | Lands in |
|---|---|
| an **image** | `screenshots`, in the **"iOS Inbox"** group, auto-named `ios-YYYY-MM-DD-NNN` (triage into a real group in-app later) |
| an **X / Twitter post URL** | Videos tab (`catalogue_video_references`, `source_type='x_post'`) |
| a **YouTube URL** | Videos tab (`source_type='youtube'`) |
| any **other URL** | Links tab (`catalogue_link_references`) |

Metadata (author, title, thumbnail) is backfilled automatically when the item
first renders in the app — the Shortcut only sends the raw image or URL.

Auth is a **dedicated, upload-only token** (not your account passcode),
generated in-app and revocable any time.

## Architecture

```
iPhone (Share Sheet ▸ AgentUX)
   │  POST multipart/form-data
   │    • image: <file>           (when sharing a photo/screenshot)
   │    • url:   <text>           (when sharing a link)
   │    • header X-Upload-Token: utk_…
   ▼
shortcut-upload  (Supabase Edge Function, service role)
   • sha256(token) → SELECT email FROM upload_tokens   → 401 if no match
   • image → screenshots ("iOS Inbox")
   • url   → x_post / youtube / link, like the Telegram bot
   • UPDATE upload_tokens.last_used_at
   ▼
Appears in the catalogue, tagged with your email as the uploader.
```

## One-time setup

### 1. Deploy the backend (`supabase` CLI, from your local env)

The migration ships in the repo at
[`supabase/migrations/20260623_upload_tokens.sql`](../supabase/migrations/20260623_upload_tokens.sql).
Apply it and deploy the function against your linked project:

```bash
# 0. One-time, if this machine isn't linked yet:
supabase link --project-ref <project-ref>

# 1. Apply pending migrations (creates public.upload_tokens).
#    db push only runs migrations not yet recorded remotely, so it's safe
#    to re-run; it picks up 20260623_upload_tokens.sql and nothing else.
supabase db push

#    Verify it landed:
supabase migration list            # 20260623_upload_tokens shows under "Remote"

# 2. Deploy the function. --no-verify-jwt because auth is the upload token
#    (the X-Upload-Token header), not a Supabase JWT — same model as the
#    telegram-bot function.
supabase functions deploy shortcut-upload --no-verify-jwt
```

No new secrets — the function reuses the `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
that Supabase injects into every Edge Function automatically.

**Smoke-test the endpoint** (after generating a token in step 2):

```bash
curl -i -X POST \
  -H "X-Upload-Token: <your-token>" \
  -F "url=https://x.com/i/status/1234567890" \
  https://<project-ref>.supabase.co/functions/v1/shortcut-upload
# → {"ok":true,"added":{"images":0,"x_posts":1,...},...}
# A bad/missing token returns {"error":"unauthorized"} with HTTP 401.
```

> Running a **local stack** instead (`supabase start`)? Apply the migration to
> the local DB with `supabase db reset` (replays all migrations) and serve the
> function with `supabase functions serve shortcut-upload --no-verify-jwt`. The
> endpoint becomes `http://127.0.0.1:54321/functions/v1/shortcut-upload`.

### 2. Generate your token (in the app)

Account menu (top-right) → **iOS Upload…** → **Generate token** → **Copy**.
It's shown **once** — only its hash is stored, so save it now. The modal also
shows the exact endpoint URL.

### 3. Build the Shortcut (iPhone)

A binary `.shortcut` can't be checked in (it's an encrypted plist), so build it
once by hand:

1. **Shortcuts app → +** (new Shortcut).
2. **Shortcut Details** (ⓘ) → enable **Show in Share Sheet**. Set *Accepted
   Types* to **Images** and **URLs**.
3. Add **Get Contents of URL**:
   - **URL**: the endpoint from the modal —
     `https://<project-ref>.supabase.co/functions/v1/shortcut-upload`
   - **Method**: `POST`
   - **Headers**:
     - `X-Upload-Token` → *(paste your token)* — the only header needed.
   - **Request Body**: `Form`
     - For images: add field **`image`**, type **File**, value = **Shortcut
       Input**.
     - For links: add field **`url`**, type **Text**, value = **Shortcut
       Input**.

   > To handle both image and link shares in one Shortcut, branch on the input
   > type with an **If** action (Shortcut Input *has any value* / *is of type
   > Images*) and build the matching form field in each branch. Or keep two
   > small Shortcuts — one for images, one for links.

4. *(Optional)* Add **Show Notification** with the response so you get an
   "added" confirmation.
5. Name it **AgentUX** so it reads well in the Share Sheet.

### 4. Use it

In the X app / Photos / Safari → **Share** → **AgentUX**. The item appears in
the catalogue within a second or two (images under the **iOS Inbox** group).

## Rotating / revoking

Account menu → **iOS Upload…**:
- **Regenerate** — issues a new token and invalidates the old one. Update the
  Shortcut with the new value.
- **Revoke** — deletes the token; the Shortcut stops working until you generate
  a new one.

## Security notes

- The token is **upload-only** and **independently revocable** — never the
  account passcode.
- Only the **SHA-256 hash** is stored server-side; the plaintext lives only in
  the Shortcut and your clipboard.
- The Edge Function returns a generic `{ error }` on any failure — never the
  token, your email, or internal reasons.
- A member can only read/write their **own** `upload_tokens` row (RLS).

## Troubleshooting

- **401 unauthorized** — token missing/wrong, or it was regenerated/revoked.
  Re-copy from the modal and update the Shortcut.
- **Nothing appears** — confirm the form field is named exactly `image` (file)
  or `url` (text), and that the function was deployed with `--no-verify-jwt`.
- Check **Dashboard → Edge Functions → shortcut-upload → Logs**.
