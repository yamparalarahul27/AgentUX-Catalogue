# Stack View — Plan

**Status:** Proposed
**Scope:** Catalogue page (desktop + mobile)
**Replaces:** Table/List view
**Related views:** Grid, Gallery, Folder (CD page, not yet shipped)

---

## 1. What Stack view is

Stack view is a review-oriented view mode that replaces the current Table/List
view in the Catalogue. Each screenshot becomes a horizontal card:

- **Left side** — the screenshot itself, large enough to read UI, with
  annotation pins rendered directly on the image.
- **Right side** — screen metadata, the full comments thread, annotations,
  and an inline input for adding new comments/pins.

Cards stack vertically and the page scrolls naturally. No focus mode, no
swipe deck — it is a long, reviewable feed of screens where comments and
annotations live inline with the work, one entry per screen.

The primary job-to-be-done is **review**: view a screen, read what people
have said about it, respond, drop a pin, move to the next one.

---

## 2. Why this view

The current List/Table view is good for scanning metadata (name, group,
flow, platform, updated-at) but weak for reviewing visual work. Reviewers
have to open the Lightbox per screen to read comments and drop annotations,
which breaks flow.

Stack view brings the review UI inline. Every screen's full conversation
is visible without opening a modal. Scrolling through a group becomes a
guided walkthrough of both the designs and the discussion around them.

---

## 3. Card anatomy

```
┌───────────────┬──────────────────────────────────┐
│               │  Title                     [⋯]   │
│               │  Group · Flow · Variant          │
│   Screenshot  │  ────────────────────────────    │
│   (with pins) │  💬 N comments  📌 N pins        │
│               │                                  │
│               │  Comment thread (scrollable)     │
│               │                                  │
│               │  ┌─────────────────┐  [💬] [📌]  │
│               │  │ Add comment... │               │
│               │  └─────────────────┘               │
└───────────────┴──────────────────────────────────┘
  ~40% width              ~60% width
```

### Left panel — screenshot
- Screenshot rendered at card height (clamped, e.g. 360–480px tall)
- Object-fit: contain — never crop the screen content
- Annotation pins overlay (numbered, colored per reviewer)
- Click image → switches to pin-drop mode if pin tool active

### Right panel — review
- Header row: title + overflow menu
- Meta row: group chip · flow chip · variant chip (Dark / Web / 1512, etc.)
- Counters row: comment count, pin count
- Comments thread — scrollable within card, same UI as Lightbox comments
- Annotations list (collapsible, separate section under comments)
- Composer: text input + "Add comment" / "Add pin" buttons

---

## 4. Layouts

### Desktop (≥ 1024px)

Full two-column card as shown above. Card max-width ~960px, centered in
the content area. Cards stack vertically with gap between them.

### Tablet (640–1023px)

Same two-column layout, but tighter padding and smaller typography.
Screenshot panel min-width 320px.

### Mobile (< 640px)

Card switches to a vertical stack inside itself:

```
┌────────────────────────┐
│                        │
│   Screenshot (full)    │
│   ① ②                  │
│                        │
└────────────────────────┘
Title                [⋯]
Group · Flow
💬 3 · 📌 2

🅡 Rahul · 2h
Copy feels too cramped…

🅐 Anna · 1h
+1, CTA below fold…

┌─────────────────────┐
│ Add comment...     ↵│
└─────────────────────┘
[💬 Comment]  [📌 Pin]
─────────────────────────
(next card)
```

Cards stay full-width. Page scroll continues down through them.

---

## 5. Interactions

| Action | Behaviour |
|---|---|
| Scroll | Normal vertical page scroll through cards |
| Click image | If pin tool active → drop a pin at that coordinate |
| Click pin number | Expand that annotation in the right panel |
| Type in composer, press Enter | Post comment |
| Click "Add pin" | Enter pin-drop mode for this card only |
| Click "…" (overflow) | Card-level actions: edit meta, replace image, delete |
| Keyboard `j` / `k` | Jump to next / previous card (optional) |

### Pin-drop mode
- Activating pin mode is scoped to a single card, not global
- Crosshair cursor on the image
- Click image → pin dropped → inline "add note" input appears above composer
- Submitting the note creates the annotation + a linked comment (one-step)

### Comments vs. annotations
- **Comments** = thread on the card itself, no coordinate
- **Annotations** = pinned to image coordinates, each gets a number and a note
- Both rendered in the same thread timeline, annotations show a pin badge

---

## 6. Integration with existing view system

### View mode type (`designer/src/lib/catalogue-view.ts`)

Currently: `'grid' | 'list' | 'gallery'`
Proposed: `'grid' | 'stack' | 'gallery'` (list is removed)

Folder view (when shipped) adds: `| 'folder'`
Final: `'grid' | 'stack' | 'gallery' | 'folder'`

### Toolbar toggle

Replace the List icon button with a Stack icon button in the view toggle.
Tooltip: "Stack view — inline comments & annotations".

### Migration

- Existing users on `list` view: migrate to `stack` silently on first load
- `persistCatalogueViewMode` accepts `'stack'`, rejects `'list'`
- No data migration required (comments/annotations already exist)
- Migration must be explicit in code, not implicit by fallback:
  - Parser accepts legacy `'list'` but maps it to `'stack'`
  - Persisted storage key `catalogue:view-mode` is rewritten to `'stack'`
  - Unknown values still fall back to default `'grid'`

---

## 7. Component structure

```
components/
  CatalogueStackView.tsx          ← new, main view
  CatalogueStackCard.tsx          ← new, one card per screen
  CatalogueStackComposer.tsx      ← new, inline composer
                                    (wraps existing comment + pin logic)
```

Reuse from Lightbox:
- `useFamilyComments` hook (if exists) — otherwise extract from lightbox
- Pin rendering / positioning logic
- Comment item component
- Resolve current duplication before shipping Stack:
  - Extract shared feedback primitives for comments + annotations
  - Keep behavior parity across Gallery, Lightbox, and Stack
  - Include resolved-comment handling in the shared path (not only one view)

The point is to not duplicate — Lightbox and Stack view share the same
data hooks and UI primitives for comments and annotations.

---

## 8. Styles

New file: `designer/src/styles/catalogue-stack.scss`

Key classes:
- `.catalogue-stack` — container, vertical flex
- `.catalogue-stack__card` — the two-column card
- `.catalogue-stack__media` — left screenshot panel
- `.catalogue-stack__panel` — right review panel
- `.catalogue-stack__composer` — input + pin button

Tokens: reuse existing catalogue dark theme colors
(`#0f0f10`, `#18181b`, `#27272a`, `#6366f1`, Inter font, etc.)

Important style-coupling note:
- `catalogue-list-*` classes are reused outside List view (Gallery + Lightbox
  inline editing/actions). Do not remove list styles until replacements are
  in place for all dependent components.
- Keep cleanup as a final, verified step after soak.

---

## 9. Risks & open questions

1. **Card height on short screens** — if the screenshot is very tall,
   should the left panel scroll independently, or clamp the image and
   show a "see full" affordance?
2. **Performance** — rendering 50+ cards with pins and threads could be
   heavy. Likely need virtualization (react-window or IntersectionObserver).
3. **Pin tool scoping** — should pin-drop mode be one-shot (places one pin
   then exits) or persistent until toggled off?
4. **List view removal** — power users who rely on sortable columns may
   push back. Option: keep List view as a hidden power-mode or export option.
5. **Resolved comments** — how do they render in the inline thread? Hidden
   by default with a "show N resolved" toggle?
6. **Logic divergence risk** — comments/annotation logic currently exists in
   multiple places; Stack can increase drift unless shared first.
7. **Hidden style coupling** — `catalogue-list-*` styles are reused by non-list
   surfaces; premature deletion can regress Gallery/Lightbox.
8. **Bulk action parity** — Stack must define selection UX that works with
   existing global bulk actions (rename/group/delete).
9. **Test gap** — view-mode migration and Stack branching currently need
   explicit tests to avoid manual-only verification.

---

## 10. Milestones

### M0 — Hardening prerequisites (must complete first)
- Implement view-mode migration (`list` -> `stack`) with explicit parser +
  storage rewrite behavior
- Add focused tests for view-mode parsing, persistence migration, and content
  branching for Stack
- Extract shared feedback primitives for comments/annotations used by Gallery,
  Lightbox, and Stack
- Define and prototype Stack selection model compatible with existing
  `CatalogueBulkBar` actions
- Inventory all `catalogue-list-*` dependencies and mark which can/cannot be
  removed yet

### M1 — Prototype on CD page
- Build `CatalogueStackView` with 3 mock screens on `/designer/cd`
- Validate layout, card sizing, scroll behavior
- Validate card-level selection affordance and bulk-action ergonomics
- No real data wiring yet

### M2 — Wire to real data
- Consume `CatalogueFamilyView` data
- Integrate shared comments/annotations primitives (not duplicated logic)
- Add to Catalogue view toggle (behind feature flag if risky)
- Ensure resolved-comment behavior is consistent with Lightbox

### M3 — Replace List view
- Swap List → Stack in the view toggle
- Release migration for persisted `viewMode: 'list'` → `'stack'`
- Keep list components/styles during soak if any non-list surface still depends
  on `catalogue-list-*` styles
- Remove unused list components only after dependency audit passes

### M4 — Polish
- Virtualization for large groups
- Keyboard shortcuts
- Resolved-comments handling
- Mobile gesture tuning
- Regression pass for Gallery + Lightbox + Stack parity

---

## 11. Release gates (definition of done)

Stack view can replace List only when all are true:
- Persisted users with `catalogue:view-mode='list'` land in Stack and storage is
  rewritten safely
- Comments, annotations, and resolved-comment behavior match across Gallery,
  Lightbox, and Stack
- Bulk actions (select all visible, rename, move group, delete) remain fully
  functional in Stack workflows
- Gallery/Lightbox styling is intact after Stack merge (no broken
  `catalogue-list-*` dependencies)
- Automated tests cover migration + Stack branch rendering paths

---

## References

- Existing views: Grid, List, Gallery (shipped) · Folder (CD prototype)
- Data model: `CatalogueFamilyView`, `ScreenshotNode`, comments + annotations
- Related components: `CatalogueFamilyLightbox`, `CatalogueFamilyLightboxActions`
