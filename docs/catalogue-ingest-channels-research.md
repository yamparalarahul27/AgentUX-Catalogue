# Catalogue ingest channels — research

> **Goal:** add **images, X/Twitter links, and videos (YouTube)** to AgentUX
> *without opening the catalogue app*. This doc researches three channels the
> user asked for — **iOS Share Sheet (option 2)**, **browser extension
> (option 3)**, and **PWA share target (option 5)** — and how they'd plug into
> the existing backend.
>
> <sub>Status: research / proposal. No code written yet. Per the working
> agreement, this is options-with-a-recommendation, not a pre-decided path.</sub>

---

## TL;DR

<table>
<tr><td>

**The single most important finding:** AgentUX already has a working,
production ingest pipeline — the **Telegram bot**
([`supabase/functions/telegram-bot/index.ts`](../supabase/functions/telegram-bot/index.ts)).
It downloads images → `screenshots`, routes X posts → `catalogue_video_references`,
and everything else → `catalogue_link_references`, all under the service-role
key with a webhook-secret + allow-list guard.

**All three new channels (iOS Shortcut, browser extension, PWA) are just
*clients*.** The smart move is to extract the bot's routing/insert logic into
**one shared, token-authenticated `ingest` Edge Function**, then point every
channel at it. Build the endpoint once; the clients become thin.

</td></tr>
</table>

---

## What already exists (the foundation)

| Capability | Where | Notes |
|---|---|---|
| Image upload → storage + `screenshots` row | `telegram-bot` `handlePhoto()` | path `…/all-projects/{ts}-{name}`, group `Social`, auto-name `social-YYYY-MM-DD-NNN` |
| X post → `catalogue_video_references` (`source_type='x_post'`) | `telegram-bot` `handleXPostLinks()` | dedupe via unique constraint (`23505`) |
| Generic URL → `catalogue_link_references` | `telegram-bot` `handleLinkCaptures()` | normalized + host stored |
| YouTube → `catalogue_video_references` (`source_type='youtube'`) | **parser exists in the SPA** (`parseYouTubeInput`, `CatalogueVideosSection.tsx`), **but the bot does *not* call it** | today a YouTube link sent to the bot lands in *Links*, not *Videos* |
| Lazy metadata backfill | `fetch-tweet-metadata`, `fetch-youtube-metadata`, `fetch-link-metadata` Edge Functions | triggered on first render when `metadata_fetched_at` is null — **no client work needed at ingest time** |

**Implication:** the metadata enrichment is already automatic. A new channel
only has to insert a minimal row (`source_type` + `external_id`/`url`, or a
storage path for images); the UI fills in author/title/thumbnail later.

> ⚠️ **Gap to fix regardless of channel:** the bot's `parseAllLinksInText`
> swallows YouTube URLs into Links. The X parser is mirrored from the SPA but
> the YouTube parser is not. The shared `ingest` function should port
> `parseYouTubeInput` so YouTube lands in *Videos* across **all** channels.

---

## The shared piece: one `ingest` Edge Function

Every option below assumes this exists. It's the telegram-bot logic minus
Telegram, plus a generic auth check.

```
POST https://<project-ref>.supabase.co/functions/v1/ingest
Authorization: Bearer <INGEST_TOKEN>        ← static per-user token (see Auth)

  multipart/form-data            → image file(s)        → screenshots
  { "url": "https://x.com/…/status/123" }  → x_post     → catalogue_video_references
  { "url": "https://youtu.be/abc" }        → youtube    → catalogue_video_references
  { "url": "https://anything.else/…" }     → link       → catalogue_link_references
  { "text": "free text w/ links" }         → split & route like the bot does
```

Routing logic = lift `parseAllXPostsInText`, `parseLinkInput`, `handlePhoto`,
the insert blocks, **plus** `parseYouTubeInput` from the SPA. Returns JSON
(`{ added: [...], duplicates: [...], failed: [...] }`) instead of Telegram
replies.

### Auth — three viable approaches

| Approach | How it works | Pros | Cons |
|---|---|---|---|
| **A. Static ingest token (Recommended)** | A long random token per member, stored in a new `ingest_tokens` table (hashed), checked by the function. | Dead simple for Shortcuts / extension / bookmarklet to carry. No login UX. Revocable per device. | A new credential type to manage; token leakage = write access (mitig_ate_ with revocation + rate limit). |
| **B. Reuse passcode → JWT** | Channel logs in via `auth-login`, stores the Supabase JWT, refreshes it. | Reuses existing RLS + roles; no new credential concept. | JWTs expire (~1h) → refresh-token plumbing in every client; painful inside an iOS Shortcut. |
| **C. Supabase anon key + RLS** | Client uses the public anon key and writes directly to tables. | No new function at all. | **Rejected** — RLS makes anon read-only for the public release (per `CLAUDE.md`). Opening writes re-opens the back door. |

Recommendation: **A**, mirroring how the Telegram bot already trades a shared
secret for service-role writes — just per-user and revocable instead of one
global allow-list.

---

## Option 2 — iOS / Android Share Sheet (Shortcut)

**Feel:** In the X app tap *Share → AgentUX*. From Photos, select shots →
*Share → AgentUX*. From Safari, share the current page.

**How:** An **Apple Shortcut** (no App Store app, no build pipeline) with a
*Share Sheet* input that accepts URLs, images, and text, then does a single
`Get Contents of URL` POST to the `ingest` endpoint carrying the token. On
Android the equivalent is a *Tasker*/HTTP-Shortcuts task, or fold it into the
PWA share target (option 5).

```
┌─────────────────────────────┐
│  X app  ▸  Share  ▸  AgentUX │
│  Photos ▸  Share  ▸  AgentUX │
│  Safari ▸  Share  ▸  AgentUX │
└──────────────┬──────────────┘
               │ POST /functions/v1/ingest  (Bearer token)
               ▼
        ingest Edge Function ──▶ screenshots / video_refs / link_refs
               │
               ▼
        Shortcut shows "Added ✓" banner
```

| | |
|---|---|
| **Effort** | **Low–Medium.** Endpoint is the bulk; the Shortcut is config, distributable as an iCloud link. |
| **Mobile** | ✅ Best-in-class native feel on iOS. |
| **Desktop** | ➖ Shortcuts run on macOS too, but the share-sheet UX is weaker than the extension. |
| **All content** | ✅ images + X + YouTube + links. |
| **Risks** | Token lives in the Shortcut (treat as a device secret). iOS Shortcut import is a manual one-time step per device. |

---

## Option 3 — Browser extension

**Feel:** Toolbar button "Save this page to AgentUX"; right-click an image →
*Send image to AgentUX*; right-click a link → *Save link*. Optional: detect X
/ YouTube pages and pre-fill.

**How:** A **Manifest V3** extension (Chrome/Edge/Firefox). `background`
service worker holds the token (set once via an options page); context-menu +
toolbar handlers POST to `ingest`. Image capture sends the image URL (function
fetches it) or the bytes.

```
┌──────────────────────────────────────────────┐
│  [AgentUX ▾]  ← toolbar: save current tab     │
│  right-click image  ▸ Send image to AgentUX   │
│  right-click link   ▸ Save link to AgentUX    │
│  options page       ▸ paste ingest token      │
└───────────────────────┬──────────────────────┘
                        │ POST /functions/v1/ingest
                        ▼  ingest Edge Function
```

| | |
|---|---|
| **Effort** | **Medium–High.** Manifest, build/bundle, options UI, packaging, and store review *or* sideload instructions. Ongoing MV3 / store-policy maintenance. |
| **Mobile** | ❌ Desktop browsers only. |
| **Desktop** | ✅ The best desktop capture UX by far. |
| **All content** | ✅ images + X + YouTube + links, with page context. |
| **Risks** | Most moving parts. Store distribution is slow; sideloading is fine for a small private team. Token stored in extension storage. |

> A **bookmarklet** is the 10%-effort cousin: one `javascript:` snippet that
> POSTs `location.href` (and selected image) to `ingest`. No store, no build,
> works in any desktop browser. Good cheap stopgap before/instead of a full
> extension — but no right-click image menu and clumsier on mobile.

---

## Option 5 — PWA share target

**Feel:** "Add to Home Screen" once; AgentUX then appears *inside the OS share
sheet* like any installed app. Share a link/image to it.

**How:** Add a `manifest.webmanifest` with a `share_target` declaration to the
designer SPA, plus a service worker handler that receives the shared payload
and POSTs to `ingest` (or writes directly once authed). Because it's the same
origin as the catalogue, it can reuse the **logged-in Supabase session** — so
this is the one option that fits naturally with **Auth approach B** and needs
no separate token.

```
manifest.webmanifest:
  "share_target": { "action": "/designer/share-ingest",
                    "method": "POST", "enctype": "multipart/form-data",
                    "params": { "title": "...", "url": "...", "files": [...] } }

  OS share sheet ▸ AgentUX ▸ service worker ▸ ingest (reuses session)
```

| | |
|---|---|
| **Effort** | **Medium.** Manifest + SW share handler + a tiny `/share-ingest` route. Wiring it into the Vite build + Vercel rewrites (`vercel.json`) needs care. |
| **Mobile** | ✅ **Android/Chrome** (full `share_target` support). ⚠️ **iOS/Safari** support for Web Share Target is **limited/absent** — on iOS, option 2 (Shortcut) is the real answer. |
| **Desktop** | ➖ Limited; desktop Chrome PWAs can register as share targets but it's niche. |
| **All content** | ✅ images + links + videos (text/URL + files params). |
| **Risks** | Cross-browser inconsistency (esp. iOS). Service-worker share handling is fiddly to debug. Reusing the session means the user must have logged into the PWA at least once. |

---

## Side-by-side

| | **2. iOS Shortcut** | **3. Extension** | **5. PWA share** |
|---|:--:|:--:|:--:|
| Build/maintenance effort | Low–Med | **High** | Med |
| iOS | ✅ best | ❌ | ⚠️ weak |
| Android | ➖ (Tasker) | ❌ | ✅ best |
| Desktop | ➖ | ✅ best | ➖ |
| Needs the `ingest` endpoint | ✅ | ✅ | ➖ (can reuse session) |
| New credential to manage | token | token | none (session) |
| Distribution friction | iCloud link | store/sideload | install prompt |
| Right-click image capture | ❌ | ✅ | ❌ |

**Coverage map:** iOS → **Shortcut**; Android → **PWA**; Desktop → **Extension
(or bookmarklet)**. The three options are complementary, not competing — which
is exactly why a shared `ingest` endpoint pays off.

---

## Recommended phasing

1. **Phase 0 — build the shared `ingest` Edge Function + token auth (A).**
   Port the bot's routing **and** the SPA's `parseYouTubeInput` (fixes the
   YouTube-in-Links gap everywhere). This unblocks all three channels and is
   the only backend work.
2. **Phase 1 — iOS Shortcut (option 2).** Highest mobile ROI, lowest client
   effort once the endpoint exists. Covers the user's most common "saw it on
   X on my phone" moment.
3. **Phase 2 — PWA share target (option 5).** Adds Android-native sharing and
   a same-origin path; can lean on the session instead of a token.
4. **Phase 3 — browser extension (option 3).** Best desktop capture, but most
   maintenance — do it last (and consider shipping the **bookmarklet** first
   as a near-free desktop stopgap).

---

## Open questions (need answers before designing Phase 0)

1. **Auth model:** static ingest token (A) vs reuse session/JWT (B)? Affects
   whether we add an `ingest_tokens` table.
2. **Who can ingest:** all members, or specific roles? Should ingested items
   carry the real member's email (vs the bot's `telegram-bot` sentinel) so
   provenance/notifications work?
3. **Default group/tags:** keep the bot's `Social` group, or let the channel
   pass a target group / tags (e.g. Shortcut asks "which group?")?
4. **Image handling:** send raw bytes (multipart) or a URL the function fetches?
   Bytes are simpler from Photos; URLs are simpler from a web page.
5. **Dedupe & feedback:** reuse the bot's `added/duplicates/failed` summary
   shape for the JSON response so clients can show a consistent banner.

---

## Key file references

- Existing ingest pipeline: [`supabase/functions/telegram-bot/index.ts`](../supabase/functions/telegram-bot/index.ts)
- Setup pattern to mirror: [`docs/telegram-bot-setup.md`](./telegram-bot-setup.md)
- YouTube/X parsers to port: `parseYouTubeInput` / `parseXPostInput` in
  `designer/src/components/CatalogueVideosSection.tsx`
- Lazy metadata backfill: `supabase/functions/fetch-{tweet,youtube,link}-metadata/`
- Auth + RLS constraints: [`docs/security-rls-public-release.md`](./security-rls-public-release.md),
  [`docs/security-auth-passcode-and-members.md`](./security-auth-passcode-and-members.md)
- Routing/rewrites (for the PWA route): [`vercel.json`](../vercel.json)
</content>
</invoke>
