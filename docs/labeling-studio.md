# Labelling Studio

> Single source of truth for the Labelling Studio. Supersedes
> `catalogue-ideation-2026-05-04-ui-element-annotations.md`,
> `catalogue-ideation-2026-05-06-ai-vision-search.md`, and
> `catalogue-ideation-2026-05-06-labeling-studio.md`.

**Status:** Phase 1 + 2 + 3 + 4 implemented behind feature flag
`LABELING_STUDIO_ENABLED` (off by default). PR
[#47](https://github.com/yamparalarahul27/AgentUX-Catalogue/pull/47).

---

## 1. Goal

Turn each screenshot in the catalogue from "an image" into "a structured
design reference" with metadata that powers retrieval, comparison, and
future AI-agent context. The studio is an admin-facing surface where
canonical metadata is added, edited, reviewed, and saved against each
screenshot. AI generation may pre-fill the same structure later but the
Catalogue UI does not depend on model calls and does not expose API keys.

## 2. Research foundation

Refero (`refero_search_screens` etc.) treats a screenshot as **design
evidence**: not just an image but one step in a user problem-solving
journey. That framing is the unlock. Labels capture what is visible,
what the screen is for, what the user is trying to do, what action the
screen invites, what the system likely does next, and why the screen is
worth referencing later. Mobbin contributed weaker schema signal; useful
later for validating retrieval queries.

## 3. Architecture

### 3.1 Where label data lives

`screenshots.metadata.label` — a single JSON blob in the existing JSONB
column. No new tables. Filtering uses the same `metadata->>field`
PostgREST pattern already proven by `metadata.catalogue_flow_label`
(`use-catalogue-data.ts:214`). When JSONB filter performance becomes
user-visible, mirror hot fields into a dedicated `screenshot_labels`
table (deferred — see §6).

### 3.2 Label JSON shape

Six section blocks plus a `review` block. All defaulted; nothing is
required for `Save Draft`. The 10 fields required for `verified` are
listed in §3.5.

```jsonc
{
  "identity": {
    "title": "", "one_line_summary": "",
    "source_app": null, "product_category": null,
    "platform": null, "device_type": null,
    "page_types": [], "screen_state": null
  },
  "journey": {
    "flow_name": null, "step_name": null,
    "step_index": null, "screens_count": null,
    "user_problem": "", "step_goal": "",
    "user_action": "", "system_response": "",
    "previous_step": null, "next_step": null,
    "inference_notes": ""
  },
  "screen_analysis": {
    "description": "", "layout": "", "functions": "",
    "ui_elements": [], "ux_patterns": [],
    "colors": [], "visible_text": []
  },
  "visual_design": {
    "theme": null, "density": null,
    "hierarchy": "", "typography_notes": "",
    "color_notes": "", "spacing_notes": "",
    "style_keywords": []
  },
  "design_reference": {
    "good_for": [], "use_when_designing": [],
    "patterns_to_steal": [], "risks_or_anti_patterns": [],
    "avoid_using_when": [], "similar_reference_queries": []
  },
  "review": {
    "label_status": "draft",        // 'unlabeled' | 'draft' | 'needs_review' | 'verified'
    "confidence": null,             // 0..1, AI-only
    "missing_fields": [],
    "admin_notes": "",
    "source": "user",               // 'user' | 'ai' | 'import' | 'script'
    "source_email": null,           // who created/last-edited
    "model": null,                  // AI model id (when source='ai')
    "prompt_version": null,
    "vocab_version": "2026-05-06"
  }
}
```

### 3.3 Vocabulary

`label_vocab` table. Single source of truth for controlled values across
8 kinds (`platform`, `device_type`, `screen_state`, `theme`, `density`,
`page_type`, `ui_element`, `ux_pattern`). Each row carries an optional
`category` and a `synonyms text[]` so typing `snackbar` resolves to
canonical `Toast`. Seeded once via SQL migration; admin-edited via SQL
until a vocab admin UI lands (deferred).

### 3.4 Provenance

Every label carries `source`, `source_email`, `model`, `prompt_version`,
`vocab_version` from day one — even though only the human-only flow is
live. Costs zero today; the day AI is re-introduced, no migration. The
only field where AI vs human matters today is `confidence` (null for
human-created rows).

### 3.5 Required fields for `verified`

Strict — `Verify` button enables only when all 10 pass. `Save Draft`
always works. Use `needs_review` as the escape hatch when a screenshot
can't meet the floor; **no admin override**.

| Field | Constraint |
|---|---|
| `identity.title` | non-empty |
| `identity.one_line_summary` | non-empty |
| `identity.platform` | not null |
| `identity.device_type` | not null |
| `identity.page_types` | length ≥ 1 |
| `identity.screen_state` | not null |
| `screen_analysis.ui_elements` | length ≥ 1 |
| `screen_analysis.ux_patterns` | length ≥ 1 |
| `design_reference.good_for` | length ≥ 1 |
| `design_reference.similar_reference_queries` | length ≥ 3 |

`journey.*`, `visual_design.*`, free chip fields (colors, visible_text,
style_keywords), and the rest of `design_reference.*` stay optional.

### 3.6 Mount point + access gate

- New section `'studio'` in `CatalogueSection` (`Catalogue.tsx`).
- Gated by `canAdmin` (renamed from `canViewTeamSection`; today this is
  a hardcoded check `email === 'rahul@equicomtech.com'`).
- Desktop-only: `LABELING_STUDIO_MIN_VIEWPORT_PX = 1024`.
- Below 1024 px: nav entry hidden in `CatalogueHeader`.
- Inside the studio when resizing < 1024: content swaps for a
  placeholder.
- Editor opens as a 480 px **side pane** to keep the queue grid visible
  for J/K nav.

### 3.7 Annotations relationship — separate

The existing `screenshot_annotations` table (region pin/area + free
text) is **untouched** by the studio. Two systems, two questions:

| | Annotations | Studio labels |
|---|---|---|
| Question | Where on this screen is X? | What kind of screen is this? |
| Granularity | Region (pin / area) | Whole screen |
| Authoring | Drag a box, type a note | Pick from controlled vocab |
| Speed | Slow | Fast |

`screen_analysis.ui_elements[]` is a flat list of element types present,
not coordinates. If region-tagging emerges as a real need, add a
`ui_element` column on `screenshot_annotations` (the May-4 ideation
direction); don't merge with the studio's screen-level model.

## 4. Locked decisions (for future contributors)

These were locked during Phase 0 and are the implementation contract
for everything that follows.

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Storage | `metadata.label` JSON | Reuses live `catalogue_flow_label` precedent; zero migration. Mirror table later only when JSONB filter perf hurts. |
| 2 | Vocab storage | `label_vocab` DB table | Vocab evolves with use; admin-editable beats deploy-per-change. Synonyms killable at the schema level. |
| 3 | Provenance | All 5 fields on day one | Adding later loses history. Cost today is zero. |
| 4 | Required-for-verified | Strict 10 fields, no admin override | `verified` has to mean something; `needs_review` is the escape hatch. |
| 5 | Annotations | Untouched, separate | Different granularity, different speed. Forcing a merge is extra work for no user benefit. |
| 6 | Mount | New `CatalogueSection`, admin menu, side pane | Matches `Team` pattern; smallest change to existing routing. |
| 7 | Viewport | 1024 px minimum | Editor is 2-pane; below that either pane is unusable. |
| 8 | Security | Inherited from public-release auth work | Studio writes via anon key today. Acceptable while URL is unlisted; the planned magic-link gate covers studio writes once it lands. |

Phase-3 specific decisions (editor):

| # | Decision | Choice |
|---|---|---|
| 1 | Editor mount | Side pane in Studio (grid stays visible) |
| 2 | Combobox | New `LabelVocabCombobox` (single + multi) |
| 3 | Section nav | Collapsible accordion, Identity open by default |
| 4 | Save | Autosave on activity, 800 ms debounce. Verify is explicit. |
| 5 | Vocab fetch | Per-kind on demand with module cache |
| 6 | Write path | `saveLabel` helper does read-merge-write of `metadata.label` |
| 7 | Keyboard | All six shortcuts (J/K/S/V/R/Esc), suppressed in inputs |

---

## 5. Implementation log

Each phase is one PR. Files in **bold** are net-new; others are edits.

### Phase 0 — locked decisions doc

The locked-decisions section (this document, §4) became the
implementation contract before any code landed. Captured as §18 of the
former `catalogue-ideation-2026-05-06-labeling-studio.md`, now folded
into this doc.

### Phase 1 — schema / types / flags

Types-only landing. Flag off by default. Safe to merge with no
behavioural change.

| File | Why | Linked with |
|---|---|---|
| **`supabase/migrations/20260506_create_label_vocab.sql`** | Creates `public.label_vocab` and seeds ~140 rows across 8 kinds. `ui_element` rows carry `category` and `synonyms` to head off Toast/Snackbar/Alert drift before it accumulates. | Read by `useLabelVocabKind` (Phase 3) via `select * from label_vocab where is_active`. Seed values match the in-code `LabelVocabKind` union in `lib/labeling/types.ts`. |
| **`designer/src/lib/labeling/types.ts`** | `ScreenshotLabel` + section interfaces backing `metadata.label`, plus `LabelVocabEntry` matching the table shape. Provenance fields included on `review` from day one. | Imported by every other `lib/labeling/*` file, every editor section, every studio hook. The provenance/`vocab_version` value `'2026-05-06'` is referenced from `lib/labeling/constants.ts` (Phase 3). |
| `designer/src/lib/feature-flags.ts` | Adds `LABELING_STUDIO_ENABLED = false` and `LABELING_STUDIO_MIN_VIEWPORT_PX = 1024`. | Read by `Catalogue.tsx` (gates the section render), `CatalogueHeader.tsx` (gates menu entry, Phase 2), `CatalogueLabelingStudio.tsx` and `LabelingStudioPlaceholder.tsx` (Phase 2). |

### Phase 2 — studio shell

Admin-only Studio surface with status filter. Reuses `ThumbHashImage`,
`getGroupColor`, the `.catalogue-filter-chip` styles, and the screenshot
list already loaded by `useCatalogueData`. **No edits to `CatalogueCard`
or `CatalogueFilterSheet`.**

| File | Why | Linked with |
|---|---|---|
| **`designer/src/hooks/use-viewport-width.ts`** | One viewport listener used by header (gate menu entry) and studio (gate placeholder). | Used by `CatalogueHeader.tsx` and `CatalogueLabelingStudio.tsx`. |
| **`designer/src/hooks/use-labeling-studio-status.ts`** | Derives status counts and filtered list from `screenshots[]` for the chip strip. | Reads via `lib/labeling/label-status.ts`. Consumed by `CatalogueLabelingStudio.tsx`. |
| **`designer/src/lib/labeling/label-status.ts`** | Pure helpers reading `metadata.label.review.label_status` (with `'unlabeled'` fallback), `identity.title`, `identity.page_types[0]`. | Used by `useLabelingStudioStatus`, `LabelingStudioCard`, and the editor's title fallback (Phase 3). |
| **`designer/src/components/labeling/CatalogueLabelingStudio.tsx`** | Studio shell: header, status chip strip, grid, editor pane (Phase 3 hook-up). Holds optimistic-overlay map so status updates locally on save without a refetch. | Reads `screenshots` from parent (`Catalogue.tsx`). Renders `LabelingStudioStatusChips`, `LabelingStudioCard`, `LabelingStudioPlaceholder`, and (Phase 3) `LabelEditor`. |
| **`designer/src/components/labeling/LabelingStudioCard.tsx`** | Display-only card with status badge, title, page-type/platform subtitle. Phase 2 added click handler + `is-selected` highlight. | Reuses `ThumbHashImage`, `getGroupColor`. Reads `lib/labeling/label-status.ts` for title/page-type. |
| **`designer/src/components/labeling/LabelingStudioStatusChips.tsx`** | Inline chip strip rendering counted status buckets. Reuses `.catalogue-filter-chip` CSS. | Buckets come from `useLabelingStudioStatus`. |
| **`designer/src/components/labeling/LabelingStudioPlaceholder.tsx`** | "Open on a screen ≥ 1024 px" placeholder. | Imports `LABELING_STUDIO_MIN_VIEWPORT_PX` from `feature-flags.ts`. |
| **`designer/src/styles/catalogue-labeling-studio.scss`** | Studio + card + status chip styles. Editor + combobox styles appended in Phase 3. | Imported from `catalogue-main.tsx`. |
| `designer/src/components/Catalogue.tsx` | Adds `'studio'` to `CatalogueSection`; renames `canViewTeamSection → canAdmin` (8 sites); adds render branch gated by `canAdmin && LABELING_STUDIO_ENABLED`; passes `screenshots` (and `userEmail`, Phase 3) to studio. | Renders `CatalogueLabelingStudio`. |
| `designer/src/components/CatalogueHeader.tsx` | Adds `'studio'` to local `CatalogueSection`; renames `canViewTeam → canAdmin`; adds Studio menu entry gated by `canAdmin && viewport >= 1024 && LABELING_STUDIO_ENABLED`. | Calls `useViewportWidth`. |
| `designer/src/catalogue-main.tsx` | Imports the new stylesheet. | — |

### Phase 3 — editor

Side-pane editor with six collapsible sections, vocab-backed combobox,
free-text chip input, autosave on activity (800 ms debounce), explicit
Verify gated by the 10-rule validator, and full keyboard nav. ~2,000
LOC in 19 new files; 4 edits.

**Pure helpers** (no React):

| File | Why | Linked with |
|---|---|---|
| **`lib/labeling/constants.ts`** | `LABEL_VOCAB_VERSION = '2026-05-06'` — written into every label's `review.vocab_version`. Bumps in lockstep with vocab seed migrations. | Imported by `default-label.ts`. Referenced by the seed migration filename. |
| **`lib/labeling/default-label.ts`** | Factory for an empty `ScreenshotLabel` with provenance defaults (`source: 'user'`, `source_email`, `vocab_version`). | Used by `useLabelEditor` when a screenshot has no stored label. |
| **`lib/labeling/validate-label.ts`** | The 10 strict required-field rules and a `validateForVerify` function returning `{ ok, missing, doneCount, totalCount }`. | Used by `useLabelEditor` (Verify gate) and `ReviewSection` (missing-fields list). |
| **`lib/labeling/resolve-synonym.ts`** | Case-insensitive synonym lookup so `snackbar` → canonical `Toast` on blur; plus a `matchesQuery` helper for combobox typeahead. | Used by both `LabelVocabCombobox` modes. |
| **`lib/labeling/save-label.ts`** | Read-merge-write of `metadata.label` via two supabase calls. Avoids clobbering other `metadata` keys (e.g. `catalogue_flow_label`). | Called from `useLabelEditor.flush`. |

**Hooks**:

| File | Why | Linked with |
|---|---|---|
| **`hooks/use-label-vocab.ts`** | `useLabelVocabKind(kind)` fetches one vocab kind on demand from `label_vocab`, with a module-scoped per-kind cache so reopening the editor doesn't refetch. | Called from `LabelVocabCombobox` (single + multi). |
| **`hooks/use-label-editor.ts`** | Owns the working draft for one screenshot. Loads stored label or `createDefaultLabel`. `update()` schedules an 800 ms debounced flush via `saveLabel`. `verify()` runs the validator and only writes `verified` if all rules pass. `markNeedsReview()` and `saveDraftNow()` are immediate. | Reads `default-label`, `save-label`, `validate-label`. Used by `LabelEditor`. |
| **`hooks/use-editor-keyboard.ts`** | J/K/S/V/R/Esc shortcuts. Suppressed when an input/textarea/contenteditable is focused. | Used by `LabelEditor`. |

**Components**:

| File | Why | Linked with |
|---|---|---|
| **`components/labeling/LabelEditor.tsx`** | Side-pane shell. Header (title, status pill, save status, prev/next buttons), six sections, footer (Save Draft / Needs Review / Verify), keyboard shortcuts hint. | Calls `useLabelEditor`, `useEditorKeyboard`. Renders `LabelEditorSection` and 6 section components. |
| **`components/labeling/LabelEditorSection.tsx`** | Collapsible section wrapper (`▸` / `▾` chevron). Open by default if caller passes `defaultOpen`. | Used by `LabelEditor` once per section. |
| **`components/labeling/LabelEditorField.tsx`** | Field shell: label + required `*` indicator + child input + optional hint. | Used by every section component (50+ usages). |
| **`components/labeling/LabelVocabCombobox.tsx`** | Two exports: `LabelVocabSinglePick` and `LabelVocabMultiPick`. Typeahead, click-to-pick, synonym resolution on blur, keyboard backspace removes last chip in multi mode. | Calls `useLabelVocabKind`. Reads `resolveSynonym` and `matchesQuery`. |
| **`components/labeling/LabelFreeChipInput.tsx`** | Free-text chip input (Enter to add, Backspace on empty to remove last). For string-array fields with no controlled vocab. | Used by `ScreenAnalysisSection` (colors, visible_text), `VisualDesignSection` (style_keywords), all of `DesignReferenceSection`. |
| **`components/labeling/sections/IdentitySection.tsx`** | Title, one-line summary, source app, product category, platform/device-type/screen-state combos, page-types multi-pick. 6 of the 10 required fields live here — open by default. | Uses `LabelVocabSinglePick`, `LabelVocabMultiPick`. |
| **`components/labeling/sections/JourneySection.tsx`** | All journey fields. Numeric inputs for step_index/screens_count. | Plain inputs/textareas. |
| **`components/labeling/sections/ScreenAnalysisSection.tsx`** | Description/layout/functions text; ui_elements/ux_patterns multi-pick; colors and visible_text as free chips. | Uses `LabelVocabMultiPick`, `LabelFreeChipInput`. |
| **`components/labeling/sections/VisualDesignSection.tsx`** | Theme + density single-pick; hierarchy / typography_notes / color_notes / spacing_notes textareas; style_keywords free chips. | Uses `LabelVocabSinglePick`, `LabelFreeChipInput`. |
| **`components/labeling/sections/DesignReferenceSection.tsx`** | All 6 design_reference free-chip fields. Two are required: `good_for` (≥1) and `similar_reference_queries` (≥3). | Uses `LabelFreeChipInput` exclusively. |
| **`components/labeling/sections/ReviewSection.tsx`** | Read-only status pill, live missing-fields list from validator, admin notes textarea, provenance display block. | Reads `validation` from `useLabelEditor`. |

**Edits**:

| File | Why |
|---|---|
| `components/labeling/CatalogueLabelingStudio.tsx` | Adds `selectedId` state, optimistic overlay map (so status badges update locally on save without refetch), prev/next handlers, renders `LabelEditor` when a screenshot is selected. |
| `components/labeling/LabelingStudioCard.tsx` | Card becomes a `<button>` with `onClick` and `aria-pressed`. Adds `.is-selected` highlight when the editor is open on it. |
| `components/Catalogue.tsx` | Passes `userEmail` into the studio (used by `default-label` for `source_email`). |
| `styles/catalogue-labeling-studio.scss` | Adds editor pane layout, section accordion, combobox + free-chip styles, status pills, provenance block. |

### Phase 4 — public catalogue filters from label data

Surfaces label fields in the public catalogue's filter sheet and search.
The studio writes labels; this phase makes them queryable for everyone
browsing the catalogue. No changes to studio code itself.

| File | Why | Linked with |
|---|---|---|
| **`lib/labeling/derive-filter-values.ts`** | Walks `fullScopeScreenshots[]` and collects the distinct in-use values for `page_types`, `ui_elements`, `ux_patterns`, `screen_state`. Returns sorted arrays. The chip pools render only values that exist on at least one screenshot, so unused vocab doesn't clutter the UI. | Called from `Catalogue.tsx` once per `fullScopeScreenshots` change. Output flows into `CatalogueToolbar` → `CatalogueFilterSheet`. |
| `hooks/use-catalogue-filter-state.ts` | 4 new state hooks (`filterPageType`, `filterUiElement`, `filterUxPattern`, `filterScreenState`) and matching setters. New fields propagated into `CatalogueQueryFilters`. | Output passed into `useCatalogueData`. |
| `hooks/use-catalogue-data.ts` | Extends `CatalogueQueryFilters` with the 4 new fields. Adds server-side WHERE clauses on JSONB paths: `metadata->label->identity->>screen_state.eq.X` (string), `metadata->label->...->page_types.cs.["X"]` (JSONB array contains, ORed for "any of"). Search OR clause expanded to also match `metadata->label->identity->>title.ilike` and `metadata->label->identity->>one_line_summary.ilike`. | Consumes filters from `useCatalogueFilterState`. Mirrors the existing `metadata->>catalogue_flow_label` pattern. |
| `components/CatalogueFilterSheet.tsx` | 4 new chip sections (Page type, UI element, UX pattern, Screen state) inserted before the existing Annotation section. Each section renders only when its chip pool is non-empty. Existing "Annotation" relabelled to "Annotation note" for clarity (it's about region-pinned free text, distinct from the new structured filters). | Receives chip pools and filter state from `CatalogueToolbar`; calls `onApply` with the extended payload shape. |
| `components/CatalogueToolbar.tsx` | Pass-through edits: 4 new chip-pool props, 4 new filter-state props, 4 new change-handler props (all optional for backward compatibility). `handleApplyFilters` extended. Forwards to `CatalogueFilterSheet`. | — |
| `components/Catalogue.tsx` | New `labelFilterValues = useMemo(deriveLabelFilterValues(fullScopeScreenshots))`. Plumbs new state, setters, and chip pools through to `CatalogueToolbar`. | Imports `deriveLabelFilterValues`. |

---

## 6. Deferred (Phase 5+)

These are explicitly **not done** in this PR. Each carries a trigger
condition; defer until the trigger fires. Per
[CLAUDE.md](../CLAUDE.md) "no speculative features".

| Item | Trigger | Why deferred |
|---|---|---|
| **Mirror columns + indexes** for hot label paths (`page_type`, `ui_element`, `screen_state`, `platform`, `device_type`) on a dedicated `screenshot_labels` table. | JSONB filter performance becomes user-visible (e.g. > 500 ms on the search query). | Premature optimisation. At hundreds of screenshots, JSONB filtering is fine. The schema in §3.1 always allowed this graduation. |
| **Vocab admin UI** (in-app CRUD for `label_vocab`). | Vocab needs editing by someone who isn't a developer, OR vocab churns more than once a month. | Today: one admin, deploys are fast, SQL-edit is acceptable. Building this earlier is "speculative configurability". |
| **Batch-import script** `scripts/catalogue-label.mjs` (mirrors the existing `catalogue-rename.mjs` pattern: download images locally → ask Claude to read them → produce mappings.tsv → `--apply`). | A run of bulk labelling is needed (e.g. backfilling 100+ screenshots in one sitting). | The studio handles 1-by-1 fine. When the batch case appears, this is ~150 lines of code following an existing precedent. |
| **MCP/API retrieval surface** (`catalogue_search_references`, `catalogue_find_similar`, etc.). | Labels are reliable enough that retrieval quality is worth investing in (i.e. `verified` count > 50 across multiple groups). | Per the original §15 of the labelling-studio ideation: wait until labels exist. Building this without data is theatre. |
| **AI assist** (Gemini Vision or Claude reading images to pre-fill `metadata.label`). | Held by user explicitly during this PR's design phase. | The existing schema's provenance fields (`source='ai'`, `model`, `prompt_version`, `confidence`) are already in place; the day this is unblocked, no schema change is needed. |

---

## 7. Out of scope

### 7.1 Region annotations (formerly `catalogue-ideation-2026-05-04-ui-element-annotations.md`)

The May 4 ideation explored adding a curated `ui_element` column to the
existing `screenshot_annotations` table (region pin/area + free text).
That doc proposed making annotations into a structured-tag system.

**Decision (locked in §4 row 5):** annotations stay separate from the
studio. Annotations are *spatial commentary* ("the CTA here is too
small"); studio labels are *whole-screen classification* ("this is a
Login modal in the Onboarding flow"). Forcing one model to do both jobs
makes labelling slow and pollutes both surfaces.

If region-tagging emerges as a real need later, it lives on
`screenshot_annotations` (e.g. a nullable `ui_element` column) and is a
separate feature — not a merge with the studio.

### 7.2 AI vision search (formerly `catalogue-ideation-2026-05-06-ai-vision-search.md`)

The May 6 ideation proposed a Gemini Vision edge function that reads
each screenshot on upload and produces `ai_description` + `ai_tags[]`
columns. The user paused this work explicitly during Phase 0 design.

The studio's schema is **AI-ready** without any code change: the day
this is unblocked, an edge function calls Gemini, formats the result
into the `ScreenshotLabel` shape, and writes via `saveLabel` with
`source='ai'`, `status='proposed'`, populated `model` and
`prompt_version`. The studio's eventual review queue (per §6) becomes
the human-in-the-loop step.

Two open questions from that doc that survive into the AI re-introduction:
- **PII risk on `visible_text` / `description`**: deciding whether to
  scrape on-screen copy is a privacy decision before scaling AI.
- **`ai_prompt_version` versioning**: already covered by
  `review.prompt_version` on every label.

---

## 8. Open questions (still un-answered)

- **Final vocab seed list expansion.** The Phase-1 seed has 140 rows
  across 8 kinds. As labelling reveals gaps (e.g. "we keep adding
  similar synonyms by hand"), update via SQL. No process for triggering
  vocab review — propose: review vocab if any one `kind` adds > 5 new
  values in a quarter.
- **Required-field threshold tuning.** §3.5's 10-field list is the v1
  floor. If `verified` count stays low after 1 month of use, consider
  splitting `verified` into two tiers (e.g. `verified_minimal` /
  `verified_full`) or relaxing one field. **Don't** add an admin
  override — `needs_review` is the right escape hatch.
- **Filter perf at scale.** Phase 4's JSONB filtering is cursor-paginated
  + indexed-on-`metadata`. If page-load times grow past ~500 ms, that's
  the trigger for the Phase-5+ mirror-columns work.

---

## 9. Reference

- **Vocab seed**: `supabase/migrations/20260506_create_label_vocab.sql`
  — the canonical starter vocabulary.
- **Schema types**: `designer/src/lib/labeling/types.ts` — the
  `ScreenshotLabel` shape and `LabelVocabEntry`.
- **Validator**: `designer/src/lib/labeling/validate-label.ts` — the
  10-rule strict required set.
- **Save path**: `designer/src/lib/labeling/save-label.ts` — the
  read-merge-write helper.
- **Feature flags**: `designer/src/lib/feature-flags.ts` —
  `LABELING_STUDIO_ENABLED`, `LABELING_STUDIO_MIN_VIEWPORT_PX`.
- **Public-release security** (separate doc):
  [`security-rls-public-release.md`](security-rls-public-release.md) —
  the auth/RLS gate that the studio inherits.

## 10. Changelog

- **2026-05-06** — PR #47 lands. This doc consolidates and replaces:
  `catalogue-ideation-2026-05-04-ui-element-annotations.md`,
  `catalogue-ideation-2026-05-06-ai-vision-search.md`,
  `catalogue-ideation-2026-05-06-labeling-studio.md`.
