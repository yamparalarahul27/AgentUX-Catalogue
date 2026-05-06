# Catalogue Ideation — May 6 2026 — AI vision search

> Session log on branch `claude/add-ai-image-search-NY8Wb`. No
> implementation work was done. This doc captures the question, the
> current-state findings, the option set, the recommendation, and the
> open questions awaiting answers before any code lands.

---

## 1. The question

The user has a Gemini API key and asked:

> *"I have gemini api, so was thinking can i add AI, so that it can
> scan the image visually and in search when i type, i can get
> results based on vision?"*

So the design question is whether the catalogue's search input — which
today filters on metadata only — should also match against AI-extracted
*content* of each screenshot (what's visually on screen).

---

## 2. Current state (what already exists)

Findings from reading the code on `main` at the time of the session:

- **Search input** — `designer/src/hooks/use-catalogue-filter-state.ts:19`
  owns `searchQuery` + a 300 ms debounced `searchQueryDebounced`. The
  raw value updates immediately; the debounced one feeds the query.
- **Filtering is server-side** — `designer/src/hooks/use-catalogue-filters.ts:25`
  documents that filtering and sorting happen server-side in
  `useCatalogueData`. The filter hook only builds families from
  already-filtered rows.
- **Filter dimensions today** — `CatalogueQueryFilters` in
  `use-catalogue-filter-state.ts:44` covers `group`, `flow`,
  `platform`, `theme`, `webPreset`, `mobileOs`, `annotation`. None
  inspect the image itself.
- **Screenshot row** — `ScreenshotNode` in `designer/src/types.ts`
  carries `name`, `file_name`, `storage_path`, `metadata`, `thumb_hash`,
  etc. No AI-derived columns exist.
- **Edge functions** — only one exists today: `supabase/functions/telegram-bot`.
  There is no upload-time post-processing function.
- **Secrets policy** — `CLAUDE.md` is explicit: API keys are
  server-only, never `NEXT_PUBLIC_*`, no hardcoded tokens. So the
  Gemini key cannot live in the client bundle.

**Implication:** the search box is in place and already debounced;
what's missing is (a) any visual understanding of each image, and
(b) a column on `screenshots` to match against. Both are additive.

---

## 3. Options considered

All three options share the same backbone:

- A new Supabase Edge Function (`vision-tag-screenshot`) calls the
  Gemini Vision API once per upload, fire-and-forget.
- The Gemini key lives as a Supabase secret (`GEMINI_API_KEY`), never
  in the client.
- Existing screenshots are backfilled by a one-shot script that
  re-uses the same edge function.
- Failure is non-blocking: if Gemini errors or times out, the upload
  still succeeds; the row simply has empty AI fields and can be
  retried later.

The options differ in **how matching works**.

### Option A — Tags + description, plain text search *(recommended)*

- New columns on `screenshots`: `ai_description text`,
  `ai_tags text[]`.
- Edge function returns a 1–2 sentence description and ~10 lowercase
  tags ("login", "dark mode", "form", "cta button", "modal", …).
- Search query is folded into the existing server-side filter:
  `name ILIKE %q% OR ai_description ILIKE %q% OR ai_tags && ARRAY[q]`.
- **Pros:** smallest surface area, no new DB extensions, no per-keystroke
  API cost, fits the existing server-side filter pattern.
- **Cons:** literal-ish matching — *"login screen"* matches, *"auth
  flow"* may not unless the tag list happens to include synonyms.

### Option B — Embedding-based semantic search

- Requires the `pgvector` extension on Supabase + a migration that
  adds `ai_embedding vector(768)` and an `ivfflat` index.
- Edge function generates **both** a description AND an embedding on
  upload; the query path embeds the search string and ranks by cosine
  similarity.
- **Pros:** *"auth flow"* finds *"login screen"* naturally; ranking
  feels smart.
- **Cons:** new DB extension, vector index tuning, plus an embedding
  call **per debounced keystroke** (cost + latency). Significantly
  more moving parts for a v1.

### Option C — Hybrid: tags now, embeddings later

- Ship Option A immediately. Reserve `ai_embedding` behind a flag in
  `designer/src/lib/feature-flags.ts` so we can layer semantic search
  in later **without re-scanning images** (we re-use the same stored
  description, just embed it).
- **Pros:** ships value now, keeps the upgrade path open.
- **Cons:** technically still just Option A until the flag flips, so
  it's not really a third option — more of a "Option A with a
  pre-declared exit ramp."

---

## 4. Recommendation

**Option A.** It solves the user-visible problem ("type a word, get
matching screenshots based on what's *in* the image") with minimum
moving parts: one new edge function, two new columns, one tweak to
the existing server-side filter. It also sidesteps the per-keystroke
embedding cost that Option B would introduce.

If literal matching feels too dumb in practice, we graduate to Option
B; nothing in Option A blocks that.

---

## 5. Search UX

Silent ranking for v1: matched results just appear as normal cards.
No "matched: login, button" hint under each card — that adds visual
noise and we can add it later if users ask why something matched.

```
Toolbar
┌────────────────────────────────────────────┐
│ [ 🔍  Search "login dark"            ]     │
└────────────────────────────────────────────┘

Results (no visible difference vs today, just more relevant rows)
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│      │ │      │ │      │ │      │
│ card │ │ card │ │ card │ │ card │
│      │ │      │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘
```

---

## 6. Upload + backfill flow

```
Upload path
┌──────────┐    ┌──────────────┐    ┌──────────────────┐
│ client   │ -> │ Supabase     │ -> │ Edge fn:         │
│ uploads  │    │ insert row   │    │ vision-tag       │
│ image    │    │ (no ai yet)  │    │ (fire & forget)  │
└──────────┘    └──────────────┘    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ Gemini Vision    │
                                    │ → desc + tags    │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ UPDATE screenshots│
                                    │ SET ai_description│
                                    │ , ai_tags        │
                                    └──────────────────┘

Backfill: one-shot script paginates rows where ai_description IS NULL
and invokes the same edge function for each.
```

---

## 7. Schema sketch

```sql
ALTER TABLE screenshots
  ADD COLUMN ai_description text,
  ADD COLUMN ai_tags text[],
  ADD COLUMN ai_scanned_at timestamptz;

CREATE INDEX screenshots_ai_tags_gin ON screenshots USING gin (ai_tags);
-- ai_description matched via ILIKE for v1; trigram index can come later
-- if we see slowness.
```

`ai_scanned_at` lets the backfill script find unscanned rows and lets
us re-scan if we change the prompt.

---

## 8. Open questions (must be answered before any code)

1. **Confirm Option A**, or do you prefer B or C?
2. **Backfill** — yes, run once across all existing screenshots; or
   only enrich new uploads going forward?
3. **Gemini key location** — Supabase Edge Function secret
   (`GEMINI_API_KEY`) only, OK? (No client-side use.)
4. **Match-reason hint in UI** — silent (recommended) or show
   matched terms under each card? If the latter, ASCII sketch
   first per `CLAUDE.md`.
5. **Failure mode** — confirm: upload succeeds even if Gemini fails;
   row just has empty AI fields and is retryable.
6. **Prompt scope** — should the description focus on UX semantics
   (screen type, key components, state) only, or also include visible
   text/copy on the screen? The latter is more useful for search but
   may surface PII from screenshots that contain user data.

---

## 9. Status

No code, schema, or UI changed in this session. Branch
`claude/add-ai-image-search-NY8Wb` exists to hold this doc and any
follow-up implementation once the open questions above are answered.
