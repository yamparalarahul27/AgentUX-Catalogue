# Feature Log & Navigation Restructure — Plan

**Status:** Completed (context-aware upload intentionally deferred)
**Date:** Apr 14, 2026
**Last Updated:** Apr 14, 2026 (docs-sidecar sync)

---

## 0. Notes locations + progress snapshot

### Where release/landing notes are maintained

| Note type | Canonical file |
|---|---|
| Release notes / changelog | `site/changelog.html` |
| Landing page update notes | `site/index.html` |
| Implementation progress for this track | `docs/feature-log-plan.md` |

### Current progress (Apr 14, 2026)

- Navigation restructure is complete.
- Feature Log list view is complete.
- Feature Log detail view and link existing/unlink flows are complete.
- Context-aware upload from feature detail is intentionally deferred for this pass.
- Pending docs-only sync items requested in this pass are now completed in this document.

---

## 1. Vision

AgentUX is shifting from a canvas/flow-builder tool to a **design ops tracker**.
The real unit of work isn't a "project with flows" — it's a **feature that moves
from designed to shipped**, with screenshots as evidence at each stage.

Feature Log makes this workflow explicit. Every feature the team is working on
gets a tracked entry that connects Catalogue screenshots to a lifecycle:
Planned → Designed → Shipped.

---

## 2. What changes

### New

| Item | Description |
|---|---|
| **Feature Log** | New top-level tab in the Catalogue header, between Catalogue and Videos. Users create features, link screenshots, track status. |
| **Hamburger menu** | Replaces the settings gear icon. Contains: Settings, Figma, Team, Archive. |
| **Archive section** | Inside the hamburger menu. Shows archived features (Flow Builder, Projects) as read-only. |

### Archived (not deleted)

| Item | Action |
|---|---|
| **Flow Builder** (`/designer/`) | Comment out from nav. Keep all code. Visible in hamburger Archive section. |
| **Projects concept** | Comment out project selector from Catalogue toolbar. Features replace projects as the organizing unit. |
| **Figma component section** | Move from header tab into hamburger menu. |

### Stays unchanged

| Item | Why |
|---|---|
| Catalogue (screenshots, groups, views) | Core — Feature Log links into it |
| Videos section | Stays as header tab |
| Comments + Annotations | Stays — works on linked screenshots |
| Upload / Quick Upload | Stays — screenshots still need uploading |
| Group appearance (icons, descriptions) | Stays — groups are the brand/product axis |
| Compare mode | Stays as standalone Catalogue feature |

### Header tab structure after

```
[ Catalogue ]  [ Feature Log ]  [ Videos ]  [☰]
                                              │
                                    ┌─────────┴──────────┐
                                    │  Settings           │
                                    │  Figma              │
                                    │  Team (admin)       │
                                    │  ──────────         │
                                    │  Archive            │
                                    │    Flow Builder     │
                                    │    Projects         │
                                    └─────────────────────┘
```

On mobile (≤ 900px), tab labels shorten to: **C**, **F**, **V**, **☰**

---

## 3. Feature Log — overview

### What a feature is

A tracked unit of work that connects screenshots to a lifecycle:

```
┌───────────────────────────────────────────────────────┐
│  PnL Share                                 🟡 Designed │
│  "Allow users to share their PnL as an image card"    │
│                                                       │
│  Linked: 3 designs · 0 shipped                        │
└───────────────────────────────────────────────────────┘
```

### Feature statuses

| Status | Badge | Meaning | Required |
|---|---|---|---|
| **Planned** | ⚪ | Idea logged, no screenshots yet | Title + description |
| **Designed** | 🟡 | Design screenshots linked | ≥1 `design` link |
| **Shipped** | 🟢 | Production screenshots added | ≥1 `shipped` link |

### Ordering

Features sorted by **latest first**, grouped by status:
1. Shipped (most recently shipped on top)
2. Designed
3. Planned

---

## 4. Feature Log — list view

```
┌──────────────────────────────────────────────────────────────────────┐
│  FEATURE LOG                                      [+ New Feature]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ── SHIPPED ─────────────────────────────────────────────────────── │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Deposit V2                                      🟢 Shipped   │  │
│  │  "Redesigned deposit flow with coin search"                   │  │
│  │  Linked: 4 designs · 3 shipped          Updated 2h ago        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── DESIGNED ────────────────────────────────────────────────────── │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PnL Share                                      🟡 Designed   │  │
│  │  "Allow users to share PnL as image card"                     │  │
│  │  Linked: 3 designs · 0 shipped          Updated 1d ago        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── PLANNED ─────────────────────────────────────────────────────── │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Dark Mode                                      ⚪ Planned    │  │
│  │  "Full dark theme across all screens"                         │  │
│  │  Linked: 0                              Updated 3d ago        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── Empty state (first visit) ──────────────────────────────────── │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  Track features from design to shipped.                       │  │
│  │  Create a feature, link screenshots from the Catalogue,       │  │
│  │  and mark it shipped when it goes live.                       │  │
│  │                                                               │  │
│  │              [+ Create your first feature]                    │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Feature Log — detail view (Stack card layout)

When a user clicks into a feature, they see shipped vs designed sections
using the Stack card layout (screenshot on left, meta + comments on right):

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Feature Log     PnL Share                 [Edit] [Mark Shipped]  │
├──────────────────────────────────────────────────────────────────────┤
│  "Allow users to share their PnL as an image card"                   │
│  🟡 Designed · 3 designs · 0 shipped                                │
│                                                                      │
│  ── SHIPPED (what actually went live) ────────────────────────────── │
│                                                                      │
│  No shipped screenshots yet.                                         │
│  [Mark Shipped] to add production screenshots.                       │
│                                                                      │
│  ── DESIGNED (what was planned) ──────────────────────────────────── │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  PnL Card - Mockup                    [unlink]   │
│  │  SCREENSHOT   │  Crpko · Deposit · Dark / Web                │   │
│  │               │  ──────────────────────────                  │   │
│  │               │  💬 2 comments                               │   │
│  │               │  🅡 Rahul · 2h                                │   │
│  │               │  Copy feels too cramped…                     │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  PnL Share Flow - Step 2              [unlink]   │
│  │  SCREENSHOT   │  Crpko · Share · Figma ref                   │   │
│  │               │  ──────────────────────────                  │   │
│  │               │  No comments                                 │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
│  [Link existing screenshot]  [Upload new to this feature]            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

After marking shipped:

```
│  ── SHIPPED (what actually went live) ────────────────────────────── │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  PnL Card - Final                     [unlink]   │
│  │   SHIPPED     │  Crpko · Deposit · Web 1512                  │   │
│  │   SCREENSHOT  │  ──────────────────────────                  │   │
│  │               │  💬 1 comment                                │   │
│  │               │  🅡 Rahul · shipped Apr 10                    │   │
│  │               │  "Shipped with rounded corners per design"   │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
│  ── DESIGNED (what was planned) ──────────────────────────────────── │
│  ...                                                                 │
```

---

## 6. Feature creation

- Only from Feature Log tab (dedicated "+ New Feature" button)
- **Not** from screenshot context menus

### Create modal

```
┌─────────────────────────────────┐
│  New Feature                    │
│                                 │
│  Title:                         │
│  [ PnL Share______________ ]    │
│                                 │
│  Description:                   │
│  [ Allow users to share... ]    │
│                                 │
│         [Cancel]  [Create]      │
└─────────────────────────────────┘
```

Creates with status `planned`. User can immediately link screenshots or
come back later.

---

## 7. Linking screenshots — hybrid model (Option C)

### From Catalogue (normal upload)

- Upload works exactly as today
- Screenshot lands in Catalogue with group/flow/variant metadata
- No feature link — just a screenshot in the library

### From inside a Feature detail page — upload new

- Upload button says "Upload to [Feature Name]"
- User picks link type: `design` or `shipped`
- Screenshot created in Catalogue (with normal group/variant metadata)
  AND auto-linked to the feature in one step
- The link type is set at upload time

### From inside a Feature detail page — link existing

- "Link screenshot" button opens a **mini Catalogue picker**
- Mini picker: search + filter, grid of existing screenshots, multi-select
- User picks link type: `design` or `shipped` for the batch
- Screenshots stay in Catalogue, just get linked via `feature_log_links`

### Unlink

- Each linked screenshot card has an "Unlink" action
- Removes the `feature_log_links` row only
- Screenshot remains in Catalogue untouched

### Cross-group linking

- A feature can link screenshots from **any group** (Crpko, Binance, etc.)
- A screenshot can belong to **multiple features**
- Example: "Dashboard" screenshot linked to both "Dark Mode" and "Dashboard V2"

---

## 8. Marking shipped

1. User clicks "Mark Shipped" on a Planned/Designed feature
2. Prompt: "Add shipped screenshots to complete"
3. Opens upload or link picker with `shipped` type pre-selected
4. User adds ≥1 screenshot as `shipped`
5. Status flips to **Shipped**
6. Feature detail now shows Shipped section on top, Designed below

### Auto status transitions

- **Planned → Designed**: automatic when first `design` screenshot is linked
- **Designed → Shipped**: explicit via "Mark Shipped" button (requires ≥1 shipped link)
- **Manual override**: user can always edit status directly via Edit modal

---

## 9. Decisions record

| # | Question | Answer |
|---|---|---|
| 1 | Cross-group linking? | Yes — a feature can link screenshots from any group |
| 2 | Screenshot in multiple features? | Yes |
| 3 | Auth model | Same as Catalogue (email-based, guest read-only) |
| 4 | Feature ordering | Latest first, grouped by status (Shipped → Designed → Planned) |
| 5 | Shipped section layout | Separate section above Designed in detail view |
| 6 | Link picker UI | Mini Catalogue grid with search + filter |
| 7 | Unlink without deleting? | Yes — removes link only, screenshot stays in Catalogue |
| 8 | Where to create features | Only from Feature Log tab |
| 9 | Empty state | CTA + short explainer of what Feature Log is |
| 10 | Activity feed / notifications | No — just visible in feature detail |
| 11 | Upload auto-linking | Option C hybrid — context-aware from Feature detail, normal from Catalogue |
| 12 | Compare mode in Feature Log? | No — Compare stays as standalone Catalogue feature |

---

## 10. Data model

### New tables

```sql
-- Features
create table public.feature_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  title         text not null,
  description   text,
  status        text not null default 'planned'
                  check (status in ('planned', 'designed', 'shipped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index feature_log_user_idx
  on public.feature_log (user_id, status, updated_at desc);

-- Links between features and screenshots
create table public.feature_log_links (
  id            uuid primary key default gen_random_uuid(),
  feature_id    uuid not null references public.feature_log (id) on delete cascade,
  screenshot_id uuid not null references public.screenshots (id) on delete cascade,
  link_type     text not null check (link_type in ('design', 'shipped')),
  note          text,
  created_at    timestamptz not null default now(),
  unique (feature_id, screenshot_id)
);

create index feature_log_links_feature_idx
  on public.feature_log_links (feature_id, link_type, created_at desc);

create index feature_log_links_screenshot_idx
  on public.feature_log_links (screenshot_id);
```

### Existing tables — no changes

- `screenshots` — untouched, features link to existing rows
- `screenshot_comments` — untouched, comments on linked screenshots work as-is
- `screenshot_annotations` — untouched

---

## 11. Component structure

```
components/
  CatalogueFeatureLog.tsx           ← feature list view (the tab content)
  CatalogueFeatureCard.tsx          ← single feature in the list
  CatalogueFeatureDetail.tsx        ← detail view with shipped/designed sections
  CatalogueFeatureCreateModal.tsx   ← create/edit feature modal
  CatalogueFeatureLinkPicker.tsx    ← mini catalogue grid picker for linking
  CatalogueHamburgerMenu.tsx        ← hamburger dropdown (settings, figma, team, archive)

hooks/
  use-feature-log.ts                ← CRUD + link/unlink operations
  use-feature-log-data.ts           ← fetch features + linked screenshots

styles/
  catalogue-feature-log.scss        ← all feature log styles
  catalogue-hamburger.scss          ← hamburger menu styles
```

### Reuse from existing

- `CatalogueStackCard` — for rendering linked screenshots in detail view
- Comment/annotation primitives from Lightbox/Gallery
- Upload modal/quick upload — triggered from feature context
- Mini Catalogue grid — simplified version of existing grid view

---

## 12. Hamburger menu

### What goes inside

```
┌─────────────────────────┐
│  Settings               │  ← current settings modal
│  ──────────────         │
│  Figma                  │  ← moved from header tab
│  Team                   │  ← admin only, moved from header tab
│  ──────────────         │
│  Archive                │
│    Flow Builder         │  ← commented out, read-only link
│    Projects             │  ← commented out, read-only
└─────────────────────────┘
```

### Implementation

- Replace settings gear icon with hamburger (☰) icon in `CatalogueHeader.tsx`
- Dropdown panel, right-aligned, closes on outside click / Escape
- Settings opens existing `CatalogueSettingsModal`
- Figma and Team render their existing section components
- Archive items link to `/designer/` (Flow Builder) and show a
  "This feature is archived" banner

### Archiving approach

- **Do not delete code** — comment out imports/renders in the main
  `Catalogue.tsx` and `CatalogueHeader.tsx`
- Keep all Flow Builder, Project, and Figma components in the codebase
- Hamburger Archive section re-enables them in a read-only context
- Add `/* ARCHIVED */` comment markers for easy grep

---

## 13. Milestones

### M0 — Navigation restructure (Completed)

- [x] Build `CatalogueHamburgerMenu` component
- [x] Replace settings gear with hamburger icon
- [x] Move Figma + Team tabs into hamburger
- [x] Comment out Flow Builder from nav, add to Archive
- [x] Comment out Project selector from toolbar, add to Archive
- [x] Update mobile tab shortening (C, F, V, ☰)

### M1 — Feature Log — list view (Completed)

- [x] Create `feature_log` + `feature_log_links` tables in Supabase
- [x] Build `CatalogueFeatureLog` list view with status grouping
- [x] Feature CRUD (create, edit title/description, delete)
- [x] Empty state with explainer + CTA
- [x] Add "Feature Log" tab to header

### M2 — Feature Log — detail + linking (Completed except deferred upload)

- [x] Build `CatalogueFeatureDetail` with shipped/designed sections
- [x] Build `CatalogueFeatureLinkPicker` (mini Catalogue grid)
- [x] Link/unlink existing screenshots
- [ ] Context-aware upload from feature detail (auto-links) — intentionally deferred for this pass
- [x] Unlink action per card

### M3 — Mark shipped flow (Completed)

- [x] "Mark Shipped" button on feature detail
- [x] Prompts user to add ≥1 shipped screenshot
- [x] Status transitions: planned → designed (auto on first design link),
  designed → shipped (explicit via Mark Shipped)
- [x] Shipped section renders above Designed in detail view

### M4 — Polish (Completed)

- [x] Search/filter within Feature Log list
- [x] Feature edit modal (update title, description, status)
- [x] Delete feature (with confirmation, removes links, keeps screenshots)
- [x] Mobile layout for feature detail (stack cards go vertical)
- [x] Update landing page and changelog

---

## 14. Out of scope for V1

- Due dates / timelines on features
- Assignees / team members per feature
- Kanban board view of features
- Notifications when features ship
- Side-by-side designed vs shipped comparison
- Telegram bot integration

---

## 15. References

- Existing: `CatalogueStackView`, `CatalogueStackCard` (shipped)
- Data: `ScreenshotNode`, `CatalogueFamilyView`, comments, annotations
- Auth: `useAuth` hook, guest user pattern
- Stack view plan: `docs/stack-view-plan.md`
