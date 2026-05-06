# Catalogue Ideation - May 6 2026 - Screenshot Labeling Studio

> Ideation note only. No implementation work was done. This captures the
> manual labeling workflow, research takeaways from Refero/Mobbin-style
> reference systems, a proposed structured label schema, and the desktop-only
> admin UI direction.

---

## 1. Goal

As the Catalogue grows, screenshots need richer metadata than names, flows, and
groups. The goal is to turn each screenshot into a structured design reference
that can later power search, MCP/API retrieval, and AI-agent suggestions.

The immediate product need is **not** to run AI inside the app. The immediate
need is an admin-facing place where structured label data can be manually added,
edited, reviewed, and saved against each screenshot.

Final clarified flow:

```text
Screenshot exists in Catalogue
  ->
Admin opens Labeling Studio
  ->
Admin selects screenshot from grid
  ->
Admin manually adds/edits structured label fields
  ->
Label data is stored against that screenshot
  ->
Admin saves it
```

AI-generated labels from Claude, ChatGPT, Gemini, or background jobs may later
pre-fill the same structure, but the Catalogue UI should not depend on model
calls and should not expose API keys or AI generation controls.

---

## 2. Research Findings

### Refero

Sources:

- https://github.com/referodesign/refero_skill
- https://raw.githubusercontent.com/referodesign/refero_skill/master/SKILL.md
- Refero MCP tools available in this environment:
  - `refero_search_screens`
  - `refero_search_flows`
  - `refero_get_flow`
  - `refero_get_similar_screens`
  - `refero_get_screen_content`

Refero is the strongest model for this feature because it treats a screenshot as
**design evidence**, not just an image. Its useful fields include:

- Platform
- Page types
- UX patterns
- UI elements
- Colors
- Description
- Layout
- Functions
- App name
- App categories
- Flow membership
- Step number in flow

For flows, Refero adds even more valuable context:

- Flow name
- Screens count
- Flow description
- User problem
- Step goal
- User action
- System response
- Related search queries

The key insight from Refero:

```text
A screenshot is not only an image.
A screenshot is one step in a user problem-solving journey.
```

So our labels should capture:

- what is visible
- what the screen is for
- what the user is trying to do
- what action the screen asks for
- what the system likely does next
- why the screen is useful as a design reference

### Mobbin

Mobbin MCP is also available in this environment. It can return screen images,
app names, platforms, image URLs, and Mobbin URLs from natural-language screen
searches.

Mobbin is useful as a reference source, but the MCP output sampled here is much
lighter than Refero's. It is less useful for defining our internal label schema,
but useful later for validating search query quality.

---

## 3. Labeling Principle

The label should not be a loose blob of tags.

It should be a canonical design metadata object that answers:

```text
What is this screen?
Where does it sit in a journey?
What is the user trying to do?
What action does the screen invite?
What does the system do next?
What UI elements and UX patterns are present?
Why should a designer reference this later?
```

Some fields should use controlled vocabulary for clean filtering. Other fields
should stay free-form for rich retrieval.

Controlled examples:

- `platform`
- `device_type`
- `screen_state`
- `theme`
- `density`
- `page_types`
- `ui_elements`
- `ux_patterns`

Free-form examples:

- `one_line_summary`
- `user_problem`
- `step_goal`
- `description`
- `layout`
- `functions`
- `patterns_to_steal`
- `risks_or_anti_patterns`
- `similar_reference_queries`

---

## 4. Proposed Label Schema

```json
{
  "identity": {
    "title": "",
    "one_line_summary": "",
    "source_app": null,
    "product_category": null,
    "platform": null,
    "device_type": null,
    "page_types": [],
    "screen_state": null
  },
  "journey": {
    "flow_name": null,
    "step_name": null,
    "step_index": null,
    "screens_count": null,
    "user_problem": "",
    "step_goal": "",
    "user_action": "",
    "system_response": "",
    "previous_step": null,
    "next_step": null,
    "inference_notes": ""
  },
  "screen_analysis": {
    "description": "",
    "layout": "",
    "functions": "",
    "ui_elements": [],
    "ux_patterns": [],
    "colors": [],
    "visible_text": []
  },
  "visual_design": {
    "theme": null,
    "density": null,
    "hierarchy": "",
    "typography_notes": "",
    "color_notes": "",
    "spacing_notes": "",
    "style_keywords": []
  },
  "design_reference": {
    "good_for": [],
    "use_when_designing": [],
    "patterns_to_steal": [],
    "risks_or_anti_patterns": [],
    "avoid_using_when": [],
    "similar_reference_queries": []
  },
  "review": {
    "label_status": "draft",
    "confidence": null,
    "missing_fields": [],
    "admin_notes": ""
  }
}
```

Recommended label statuses:

```text
unlabeled
draft
needs_review
verified
```

If AI-generated data is pasted or imported later, additional statuses could be:

```text
ai_draft
human_edited
```

But for the first manual Labeling Studio, `draft`, `needs_review`, and
`verified` are enough.

---

## 5. Controlled Vocabulary Starting Point

```text
platform:
web, ios, android, desktop_app, tablet, unknown

device_type:
mobile, desktop, tablet, responsive_web, unknown

screen_state:
default, loading, empty, error, success, disabled, selected,
expanded, collapsed, modal_open, unknown

theme:
light, dark, mixed, unknown

density:
sparse, comfortable, compact, dense, unknown
```

Page type examples:

```text
Welcome Screen, Login, Sign Up, Onboarding, Dashboard, Settings,
Checkout, Pricing, Search, List, Detail, Editor, Upload, Empty State,
Error State, Success State, Modal, Permission Prompt, Account Setup,
Profile, Feed, Notification, Form
```

UI element examples:

```text
Button, Text Field, Search Field, Navigation Bar, Tabbar, Sidebar,
Card, List, Table, Modal, Dialog, Bottom Sheet, Tooltip, Toast, Badge,
Avatar, Icon, Dropdown, Checkbox, Radio Selector, Stepper,
Progress Indicator, Carousel, Hero Image, Product Image, Form,
Calendar, Chart, Map, Empty State Illustration
```

UX pattern examples:

```text
Single CTA, Progressive Disclosure, Inline Validation, Social Proof,
Trust Signal, Feature Announcement, Mode Selection, Deferrable Decision,
Step-based Onboarding, Personalization, Selection List, Comparison,
Confirmation, Recovery, Upgrade Prompt, Paywall, Guided Tour,
Search and Filter, Bulk Actions, Drag and Drop, Infinite Scroll
```

---

## 6. Claude Prompt Used For Label Testing

This prompt was used to test whether Claude can produce data in the proposed
shape. The resulting label for a KuCoin hedge-mode modal was strong, especially
in `design_reference`.

```text
Analyze the attached UI screenshot and return ONLY valid JSON.

Do not repeat this prompt.
Do not explain your answer.
Do not use markdown.
Do not include text before or after the JSON.
If a field is unknown, use null or [].

Create structured metadata for a design-reference catalogue using this schema:

{
  "identity": {
    "title": "",
    "one_line_summary": "",
    "source_app": null,
    "product_category": null,
    "platform": null,
    "device_type": null,
    "page_types": [],
    "screen_state": null
  },
  "journey": {
    "flow_name": null,
    "step_name": null,
    "step_index": null,
    "screens_count": null,
    "user_problem": "",
    "step_goal": "",
    "user_action": "",
    "system_response": "",
    "previous_step": null,
    "next_step": null
  },
  "screen_analysis": {
    "description": "",
    "layout": "",
    "functions": "",
    "ui_elements": [],
    "ux_patterns": [],
    "colors": [],
    "visible_text": []
  },
  "visual_design": {
    "theme": null,
    "density": null,
    "hierarchy": "",
    "typography_notes": "",
    "color_notes": "",
    "spacing_notes": "",
    "style_keywords": []
  },
  "design_reference": {
    "good_for": [],
    "use_when_designing": [],
    "patterns_to_steal": [],
    "risks_or_anti_patterns": [],
    "avoid_using_when": [],
    "similar_reference_queries": []
  },
  "review": {
    "label_status": "draft",
    "confidence": 0,
    "missing_fields": [],
    "admin_notes": ""
  }
}

Use these controlled values where possible:

platform: web, ios, android, desktop_app, tablet, unknown
device_type: mobile, desktop, tablet, responsive_web, unknown
screen_state: default, loading, empty, error, success, disabled, selected, expanded, collapsed, modal_open, unknown
theme: light, dark, mixed, unknown
density: sparse, comfortable, compact, dense, unknown

For page_types, ui_elements, and ux_patterns, choose concise design terms.
For colors, use hex values if visually clear, otherwise use color names.
For similar_reference_queries, write 5-8 natural language queries useful for Refero, Mobbin, or an internal catalogue.
For patterns_to_steal, write specific reusable design tactics.

Do not assign step_index or screens_count unless visible or provided by metadata.
Do not include UI elements that are only guessed from the app type.
Use ux_patterns only when the pattern is clearly represented by the visible screen.
If system_response is inferred, mention that in review.admin_notes.

Now label the attached screenshot.
```

Notes from the test:

- `design_reference` produced the most future value.
- `journey` fields were useful, but `step_index` and `screens_count` should
  remain `null` unless known.
- UI elements and UX patterns need careful curation to avoid AI adding guessed
  items.
- `system_response` is often inferred and should be marked as such.

---

## 7. Admin UI Direction

Use a dedicated **Labeling Studio**, separate from the normal Catalogue browsing
experience.

This should be desktop-only. No mobile version is planned.

### Option A - Add Labeling To Existing Lightbox

Fastest path, but cramped. It risks crowding the existing screenshot viewing,
annotation, comment, and crop experience.

### Option B - Dedicated Labeling Studio

Recommended. It creates a serious admin workspace for structured metadata,
status filtering, review progress, and screenshot-by-screenshot editing.

### Option C - Spreadsheet-Style Bulk Editor

Useful later for power editing, but weak for visual judgment. It should not be
the v1.

Recommendation: **Option B**.

---

## 8. ASCII - Labeling Studio Grid

```text
Admin / Labeling Studio
+----------------------------------------------------------------------------+
| Labeling Studio                                                           |
| Structured metadata for screenshot retrieval and future AI-agent context   |
|----------------------------------------------------------------------------|
| Status: [ All ] [ Unlabeled ] [ Draft ] [ Needs Review ] [ Verified ]     |
|                                                                            |
| Search screenshots...        Group v     Flow v     Page Type v     Sort v |
|----------------------------------------------------------------------------|
|                                                                            |
| +--------------+ +--------------+ +--------------+ +--------------+       |
| | screenshot   | | screenshot   | | screenshot   | | screenshot   |       |
| |              | |              | |              | |              |       |
| | Draft        | | No label     | | Verified     | | Needs 2      |       |
| | Modal . Web  | | Onboarding   | | Dashboard    | | Checkout     |       |
| +--------------+ +--------------+ +--------------+ +--------------+       |
|                                                                            |
| +--------------+ +--------------+ +--------------+ +--------------+       |
| | screenshot   | | screenshot   | | screenshot   | | screenshot   |       |
| | Needs 4      | | Draft        | | No label     | | Verified     |       |
| | Settings     | | Modal        | | Feed         | | Signup       |       |
| +--------------+ +--------------+ +--------------+ +--------------+       |
|                                                                            |
+----------------------------------------------------------------------------+
```

---

## 9. ASCII - Label Editor Shell

```text
Label Editor
+----------------------------------------------+-----------------------------+
|                                              | Hedge Mode vs One-Way Mode  |
|                                              | Status: Draft               |
|                                              | Missing: previous, next     |
|                                              |                             |
|                                              | [ Save Draft ] [ Verify ]   |
|                                              |                             |
|                 Screenshot                   |-----------------------------|
|                                              | Sections                    |
|                                              | * Identity                  |
|                                              | * Journey                   |
|                                              | * Screen Analysis           |
|                                              | * Visual Design             |
|                                              | * Design Reference          |
|                                              | * Review                    |
|                                              |                             |
+----------------------------------------------+-----------------------------+
```

---

## 10. ASCII - Identity Section

```text
Identity
+----------------------------------------------------------------------------+
| Title                                                                      |
| [ Hedge Mode vs One-Way Mode Selection Modal on Crypto Derivatives... ]    |
|                                                                            |
| One-line summary                                                           |
| [ Centered modal presenting two trading position modes over BTC dashboard ] |
|                                                                            |
| Source app        [ KuCoin                         ]                       |
| Product category  [ Crypto Trading / Derivatives   ]                       |
| Platform          [ Web                         v  ]                       |
| Device type       [ Desktop                     v  ]                       |
| Screen state      [ Modal open                  v  ]                       |
|                                                                            |
| Page types                                                                  |
| [ Modal x ] [ Dashboard x ] [ Settings x ] [+ Add]                         |
+----------------------------------------------------------------------------+
```

---

## 11. ASCII - Journey Section

```text
Journey
+----------------------------------------------------------------------------+
| Flow name        [ Trading Mode Configuration ]                            |
| Step name        [ Choose Position Mode       ]                            |
| Step index       [ Unknown ]      Screens count [ Unknown ]                |
|                                                                            |
| User problem                                                               |
| [ User must decide whether to allow simultaneous long and short...       ] |
|                                                                            |
| Step goal                                                                  |
| [ Inform the user about a newly available position mode...               ] |
|                                                                            |
| User action                                                                |
| [ Read comparison, then choose Enable Hedge Mode or Later.               ] |
|                                                                            |
| System response                                                            |
| [ If enabled, account switches mode. If Later, modal dismisses.          ] |
|                                                                            |
| Previous step [ Unknown ]        Next step [ Unknown ]                     |
+----------------------------------------------------------------------------+
```

---

## 12. ASCII - Screen Analysis Section

```text
Screen Analysis
+----------------------------------------------------------------------------+
| Description                                                                |
| [ A dark centered modal overlays a BTCUSDT perpetual futures dashboard... ]|
|                                                                            |
| Layout                                                                     |
| [ Full-screen dark trading dashboard with centered modal...              ] |
|                                                                            |
| Functions                                                                  |
| [ Educate user, compare two modes, enable now or postpone...             ] |
|                                                                            |
| UI elements                                                                |
| [ Modal x ] [ Button x ] [ Badge x ] [ Card x ] [ Chart x ] [+ Add]       |
|                                                                            |
| UX patterns                                                                |
| [ Comparison x ] [ Feature Announcement x ] [ Single CTA x ] [+ Add]       |
|                                                                            |
| Colors                                                                     |
| [ #000000 ] [ #1A1A1A ] [ #FFFFFF ] [ #22C55E ] [ #EF4444 ]               |
|                                                                            |
| Visible text                                                               |
| [ Hedge Mode Now Available ] [ Later ] [ Enable Hedge Mode ] [+ Add]       |
+----------------------------------------------------------------------------+
```

---

## 13. ASCII - Design Reference Section

```text
Design Reference
+----------------------------------------------------------------------------+
| Good for                                                                   |
| [ Introducing optional mode in complex product                         ]  |
| [ Choosing between two mutually exclusive settings                     ]  |
|                                                                            |
| Use when designing                                                         |
| [ Feature announcement dialogs requiring user choice                   ]  |
| [ Dark-themed fintech comparison cards                                  ]  |
|                                                                            |
| Patterns to steal                                                          |
| [ Use New/Default tags to communicate recommendation and current state  ]  |
| [ Pair each option with a short behavior description                    ]  |
|                                                                            |
| Risks / anti-patterns                                                      |
| [ Blocking modal may interrupt time-sensitive trading workflow          ]  |
|                                                                            |
| Similar reference queries                                                  |
| [ dark mode feature announcement modal with two option cards            ]  |
| [ crypto trading platform mode selection dialog                         ]  |
+----------------------------------------------------------------------------+
```

---

## 14. Storage Direction

The implementation can start with one label record per screenshot.

Possible logical fields:

```text
screenshot_id
label_status
label_json
created_at
updated_at
verified_at
```

For search/filter performance later, commonly queried parts of `label_json` can
be mirrored into dedicated columns:

```text
page_types
ui_elements
ux_patterns
platform
device_type
screen_state
source_app
product_category
similar_reference_queries
```

This keeps v1 simple while leaving a path to strong retrieval and future MCP/API
tools.

---

## 15. Later MCP/API Direction

Once labels are reliable, the future MCP/API surface can be small and powerful:

```text
catalogue_search_references
catalogue_get_screen_context
catalogue_find_similar
catalogue_suggest_screen_structure
catalogue_compare_patterns
```

But this should wait until the label format and admin workflow are validated.

The sequence should be:

```text
Manual structured labels
  ->
Search/filter on label fields
  ->
Quality review and vocabulary cleanup
  ->
MCP/API retrieval
  ->
AI-agent design suggestions
```

---

## 16. Open Questions Before Implementation

1. Confirm the Labeling Studio is desktop-only.
2. Confirm one label record per screenshot for v1.
3. Decide whether labels live in a new table or as JSON columns on
   `screenshots`.
4. Decide whether controlled vocabularies are hardcoded TypeScript constants or
   stored in database lookup tables.
5. Decide whether label editing opens as a route, modal, or admin-only view.
6. Decide whether `verified` requires all required fields or can be manually
   set by admin even with missing fields.
7. Decide which fields are required for v1:
   - likely required: title, summary, platform, device type, page type, UI
     elements, UX patterns, good_for, similar_reference_queries
   - likely optional: flow step index, screen count, previous step, next step

---

## 17. Recommendation

Proceed with **Option B: Dedicated Desktop Labeling Studio**.

Start with manual editing only. Do not include AI calls in the app. Make the
first implementation good at reviewing and saving canonical structured labels.
AI, MCP, API, and richer retrieval can all layer on top once the data model is
stable.

---

## 18. Locked Decisions (Phase 0 — 2026-05-06)

These supersede the open questions in §16 and add details not covered in the
original ideation. Sections §1–§17 capture the *thinking*; this section is the
*implementation contract* for Phase 1+.

### 18.1 Where labels live (refines §14)

**Phase 1:** `screenshots.metadata.label` — a single JSON object stored in the
existing JSONB column.

**Phase 5+ (only when needed):** mirror commonly-queried fields into a
dedicated `screenshot_labels` table.

Why: zero migration in Phase 1, follows the live `metadata.catalogue_flow_label`
precedent (see `designer/src/hooks/use-catalogue-data.ts:214` and
`designer/src/lib/catalogue-families.ts:2`). Defers the table cost until there
is a real query the JSONB filter cannot answer fast at scale.

### 18.2 Vocabulary storage (answers §16 Q4)

**Database lookup table** `label_vocab`:

```sql
create table public.label_vocab (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,           -- 'platform' | 'device_type' | 'screen_state'
                                       -- | 'page_type' | 'ui_element' | 'ux_pattern' | ...
  value       text not null,           -- canonical value, e.g. 'Toast'
  category    text,                    -- 'Container' | 'Feedback' | ...  (optional grouping)
  description text,                    -- 1-line definition (stops drift)
  synonyms    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);
```

Seeded via a one-time SQL migration:
`supabase/migrations/<date>_seed_label_vocab.sql`. After seeding, the table is
the source of truth; v1 edits happen via SQL until a vocab admin UI lands
(deferred, Phase 5+).

Why: vocab will evolve as labelling reveals gaps. Admin-editable at runtime
beats a deploy-per-change cycle. Matches the `synonyms[]` shape that solves the
Toast/Snackbar/Alert drift problem structurally.

### 18.3 Provenance fields on every label (additions to §4 schema)

The `review` block gains five fields, all defaulted for the human-only flow so
nothing is required of the labelling user today:

```jsonc
{
  "review": {
    "label_status": "draft",
    "confidence": null,
    "missing_fields": [],
    "admin_notes": "",

    "source": "user",                  // 'user' | 'ai' | 'import' | 'script'
    "source_email": "rahul@…",         // who created/last-edited this label
    "model": null,                     // AI model id when source='ai'
    "prompt_version": null,            // for selective AI re-scan
    "vocab_version": "2026-05-06"      // which label_vocab seed/migration this label was made against
  }
}
```

Why: provenance is irreversible if not captured at write time. `vocab_version`
is the structural fix to "what if vocab changes later" — a label always knows
which generation of the vocab it was valid against. Cost today: zero
(human-only flow ignores `model`/`prompt_version`); cost the day AI is
re-introduced: zero migration.

### 18.4 Required fields for `verified` (answers §16 Q6, Q7)

**Strict required, 10 fields. No admin override.** The `Verify` button is
enabled only when all 10 pass. `Save Draft` always works. Labels that cannot
meet the floor live in `needs_review` with `admin_notes`.

| Field | Constraint |
|---|---|
| `identity.title` | non-empty string |
| `identity.one_line_summary` | non-empty string |
| `identity.platform` | not null |
| `identity.device_type` | not null |
| `identity.page_types` | length ≥ 1 |
| `identity.screen_state` | not null |
| `screen_analysis.ui_elements` | length ≥ 1 |
| `screen_analysis.ux_patterns` | length ≥ 1 |
| `design_reference.good_for` | length ≥ 1 |
| `design_reference.similar_reference_queries` | length ≥ 3 |

`journey.*`, `visual_design.*`, `screen_analysis.colors / visible_text`, and
the rest of `design_reference.*` stay optional.

Why: this floor maps 1-to-1 to the user-visible filter chips (page type, UI
element, UX pattern, screen state) and the design-reference search seeds
(`similar_reference_queries`). Every required field directly enables
something a designer browsing the catalogue will actually do. Journey fields
are excluded because they are often unknowable from a single screenshot.

### 18.5 Annotations relationship (not in original doc)

The existing `screenshot_annotations` table (region pin/area + free-text
`text`, currently area-only since `PIN_ANNOTATIONS_ENABLED = false`) is
**untouched** by the Studio. The two systems answer different questions:

- **Annotations** — *"Where on this screen is X, and what is notable about
  it?"* Region-pinned, slow to fill (drag a box, type a note), commentary in
  spirit.
- **Studio labels** — *"What kind of screen is this and what does it
  contain?"* Whole-screen structured metadata, fast to fill (pick from
  controlled vocab), classification in spirit.

`screen_analysis.ui_elements[]` is filled by selecting from controlled vocab
in the Studio editor — **not** by drawing boxes. If region-tagging emerges as
a real need, that is a separate feature on `screenshot_annotations` (e.g.
adding a `ui_element` column, à la the May 4 ideation), not a merge with the
Studio.

### 18.6 Studio mount point (answers §16 Q5)

A new `CatalogueSection = 'studio'` branch in
`designer/src/components/Catalogue.tsx` (alongside the existing
`'catalogue' | 'videos' | 'links' | 'team'`), gated by `canAdmin` (renamed
from `canViewTeamSection` at `Catalogue.tsx:296`). Header tab is rendered by
`CatalogueHeader` only when `canAdmin && viewport >= 1024`.

Studio code lives under a new folder `designer/src/components/labeling/`
with a top-level `CatalogueLabelingStudio.tsx` and one file per editor
section. Neither `Catalogue.tsx` nor `CatalogueFamilyLightbox.tsx` grows
(both already at ~970 LOC and exempt by precedent — the Studio respects the
700 LOC cap from the start).

Studio replaces the catalogue grid in the main pane (same pattern as the
Team section at `Catalogue.tsx:561`); not a modal.

### 18.7 Desktop-only viewport gate (refines §7, §16 Q1)

New flag in `designer/src/lib/feature-flags.ts`:

```ts
export const LABELING_STUDIO_MIN_VIEWPORT_PX = 1024;
```

Behaviour:

- Below 1024 px: Studio nav entry is **hidden** in `CatalogueHeader`. No
  dead-end tab on mobile.
- If a user is in the Studio and resizes below 1024 px: the editor pane
  swaps for a placeholder ("Open on a screen at least 1024 px wide").

Reuses the viewport-listener pattern already used for
`ANNOTATION_EDIT_MIN_VIEWPORT_PX = 720` in
`designer/src/components/CatalogueFamilyLightbox.tsx:140` /
`:838`.

### 18.8 Security posture (deferred, documented)

Studio writes go through the anon Supabase key, same as every other write
today. RLS is disabled on `screenshots`, `screenshot_annotations`, and the
new `label_vocab` table. Acceptable while the catalogue URL is unlisted and
team-only.

The Studio inherits whatever auth gate lands as part of the public-release
work tracked in `docs/security-rls-public-release.md` — no Studio-specific
auth work in Phases 1–4 beyond the existing email-based admin check.

### 18.9 Phasing

| Phase | Scope | Branch | Effort |
|---|---|---|---|
| 0 | This doc update (locked decisions) | `claude/review-research-doc-labels-xdGXh` | done |
| 1 | `label_vocab` table + seed migration; `ScreenshotLabel` types; `LABELING_STUDIO_ENABLED = false` flag | one PR | ~1 day |
| 2 | Studio shell — new `CatalogueSection`, grid view, status filter chips, `canAdmin` rename, header entry | one PR | ~2 days |
| 3 | Editor shell — six-section editor, combobox-typeahead vocab inputs (with synonym resolution), required-fields validator, keyboard shortcuts | one PR | ~3–4 days |
| 4 | Public-catalogue filter chips driven by label data (Page Type, UI Element, UX Pattern, Screen State); search extended to `metadata->>title.ilike` and `one_line_summary.ilike` | one PR | ~1 day |
| 5+ | Deferred: mirror columns + indexes, vocab admin UI, batch-import script (mirroring `scripts/catalogue-rename.mjs`), MCP/API surface, AI assist | — | — |

Phase 1 is types-only and safe to land with the feature flag off.

### 18.10 What is still open (must be answered before its phase starts)

- **Final vocab seed list** (blocks Phase 1). The May 4 ideation review
  proposed a de-duped starter set (Modal / Bottom Sheet / Toast with
  synonyms `["Snackbar", "Notification"]` / Banner / Button / Input / List
  Row / Tab Bar / App Bar / Menu / Card; plus a separate `screen_state`
  kind: Default / Empty / Error / Loading / Success / Onboarding). Confirm
  and extend before writing the seed migration.
- **Keyboard shortcut bindings** (blocks Phase 3). Proposed defaults: `J` /
  `K` next/prev, `S` save draft, `V` verify, `R` mark needs-review, `Esc`
  close.
- **Mirror-columns trigger** (blocks Phase 5). Defined operationally as
  "when JSONB filter perf becomes user-visible." No speculative
  pre-optimisation.
