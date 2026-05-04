# Catalogue Ideation — May 4 2026 — UI element annotations

> Session log on branch `claude/ui-element-annotations-Qwr0g`. No
> implementation work was done. This doc captures the question, the
> current-state findings, the option set, the recommendation, and the
> open questions awaiting answers before any code lands.

---

## 1. The question

Today annotations are free-text. Users typing things like `Toast`,
`Modal`, or `Tooltip` describe a UI element, but the system treats those
strings as opaque labels.

> *"Can we give the user a way to set an annotation as a UI element?
> And if yes, when the filter for annotations is on, how can the user
> filter UI elements and how will that be shown in the screenshot?"*

So the design question is whether **"UI element"** should become a
first-class, curated concept on an annotation, or stay as a free-text
label.

---

## 2. Current state (what already exists)

Findings from reading the code on `main` at the time of the session:

- **Schema** — `screenshot_annotations` table, modelled in
  `designer/src/lib/screenshot-annotations.ts`:
  ```
  id, screenshot_id, shape ('pin' | 'area'),
  x, y, width, height,
  text,            ← free-text label, doubles as the "name"
  user_email, created_at
  ```
- **Composer** — `designer/src/components/CatalogueFamilyLightbox.tsx`
  around line 847 has the `<input>` for `text`, with placeholder
  *"Name this area (e.g. Sign-up modal)"*. A `<datalist>` at
  `:863` already auto-suggests previously-used labels via
  `existingAnnotationLabels`.
- **Label discovery** — `fetchAnnotationLabelsForProjects` in
  `screenshot-annotations.ts:131` collects distinct trimmed labels
  across the user's projects. Stored in `use-catalogue-full-scope.ts`
  as `annotationLabels`.
- **Filter UI** — `designer/src/components/CatalogueFilterSheet.tsx`
  around line 296 already renders an **"Annotation"** chip section
  built from those labels. Selecting chips filters screenshots via
  the `screenshots_with_annotation_labels` RPC
  (`screenshot-annotations.ts:148`).

**Implication:** the feature *loosely* exists today. Anyone can type
`Toast` and filter by it. The shortcomings are (a) no curated
vocabulary, so `toast`, `Toast`, and `toast notification` create three
filter chips, and (b) UI element isn't a real dimension — we cannot
render UI-element annotations differently, count them, or roll them up.

---

## 3. Options considered

### Option A — Curated dropdown only (lightest)

Replace or augment the free-text input with a UI-element picker
(Toast, Modal, Button, Input, Tooltip, Snackbar, Drawer, Tab, …). Free
text becomes a secondary "note" field.

- **Pros:** clean taxonomy, filter chips collapse naturally, smallest
  surface area.
- **Cons:** loses the "describe what's wrong" use case unless we keep
  a second free-text field anyway — at which point we're effectively
  at Option B.

### Option B — Two-field annotation: `ui_element` + `text` *(recommended)*

Add a nullable `ui_element` column with a controlled vocabulary
alongside the existing `text`. An annotation can be:

- *only* free-text — `"login button is misaligned"`
- *only* a UI element — `"Toast"`
- *both* — `ui_element="Toast"`, `text="overlaps the CTA"`

- **Pros:** preserves today's flow, makes UI element a real filter
  dimension, lets us render UI-element annotations differently
  (icon/colour), and unlocks future analytics ("how often does Toast
  appear in onboarding flows?").
- **Cons:** schema migration, taxonomy maintenance, extra UI in the
  composer.

### Option C — Tag-based (most flexible, heaviest)

Annotations get N tags from a controlled list, joined via a junction
table. UI element is just one tag namespace; later we could add
`severity`, `persona`, etc.

- **Pros:** future-proof.
- **Cons:** overkill right now per the project's "no speculative
  features" rule — we don't have a second tag dimension yet, and
  Option B can be evolved into Option C later if needed.

---

## 4. Recommendation

**Option B.** Smallest meaningful change that turns "UI element" into a
real concept without throwing away the free-text affordance. C can be
layered on later if a second tag dimension shows up.

---

## 5. Filter UX (when an annotation filter is on)

Two stacked chip sections in the existing filter sheet — they AND
together (e.g. UI element = Toast **and** label contains "error").

```
Filter sheet
┌────────────────────────────────────────────┐
│ ...existing filters...                     │
│                                            │
│ UI element                                 │
│ [ Toast ] [ Modal ] [ Button ] [ Input ]   │
│ [ Tooltip ] [ Drawer ] [ Tab ] ...         │
│                                            │
│ Annotation (free text)                     │
│ [ login button ] [ misaligned ] ...        │
└────────────────────────────────────────────┘
```

---

## 6. On-screenshot rendering when filter is on

Three behaviours considered:

- **B1 — Dim others.** Render every annotation, but fade non-matches
  to ~30% opacity.
- **B2 — Highlight matches, hide rest.** *(recommended.)* Render
  only matching annotations. Add a small chip badge in the corner of
  each box: `Toast`. Footer reminds: *"2 of 5 annotations shown ·
  Clear filter"*. Mirrors the behaviour of the existing label filter.
- **B3 — Always show, badge filtered.** Render everything, add a
  coloured ring around matches.

ASCII sketch for the recommended B2:

```
Screenshot lightbox (filter: UI element = Toast)
┌──────────────────────────────────────────────┐
│                                              │
│   [ app screenshot ]                         │
│                                              │
│         ┌─────────────────┐                  │
│         │ ▣ Toast         │ ← matching       │
│         │  "save failed"  │   annotation     │
│         └─────────────────┘                  │
│                                              │
│    (other annotations hidden while filtered) │
│                                              │
└──────────────────────────────────────────────┘
Footer: "2 of 5 annotations shown · Clear filter"
```

---

## 7. Composer UX

```
Add annotation
┌──────────────────────────────────────────┐
│ UI element  [ Toast        ▼ ] (optional)│
│ Note        [ "save failed banner"     ] │
│             [ Save area ]   [ Cancel ]   │
└──────────────────────────────────────────┘
```

UI element is optional; an annotation may still be free-text only.

---

## 8. Open questions (must be answered before any code)

1. **Confirm Option B**, or do you prefer A or C?
2. **Initial vocabulary** — do you have a list, or should the next
   session draft one (~15 items: Toast, Modal, Drawer, Tooltip,
   Snackbar, Button, Input, Tab, Stepper, Chip, Card, Alert, Badge,
   Menu, Dropdown)?
3. **Vocabulary storage** — hardcoded TS constant, Postgres enum, or
   a `ui_elements` lookup table (admin-editable)?
4. **Filter behaviour on screenshot** — B2 (hide non-matches) or B1
   (dim)?
5. **Required vs. optional** — should `ui_element` be optional on
   every annotation, or required for newly-created ones?

---

## 9. Status

No code, schema, or UI changed in this session. Branch
`claude/ui-element-annotations-Qwr0g` exists to hold this doc and any
follow-up implementation once the open questions above are answered.
