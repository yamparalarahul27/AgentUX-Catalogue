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

### 1. Deploy the backend (repo owner — `supabase` CLI)

```bash
supabase db push                              # creates public.upload_tokens
supabase functions deploy shortcut-upload     # JWT verification stays ON;
                                              # the function authenticates by
                                              # the upload token, not a JWT
```

No new secrets — the function reuses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

> The Supabase Functions gateway requires the project **anon key** in an
> `apikey` header on every call. The Shortcut sends it alongside the upload
> token (step 3). The anon key is already public (it ships in the web app).

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
     - `X-Upload-Token` → *(paste your token)*
     - `apikey` → *(project anon key)*
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
  or `url` (text), and that the `apikey` header carries the anon key.
- Check **Dashboard → Edge Functions → shortcut-upload → Logs**.
