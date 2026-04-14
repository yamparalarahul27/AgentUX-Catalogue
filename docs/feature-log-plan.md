# Feature Log — Plan

**Status:** Proposed
**Scope:** Catalogue page — new top-level tab
**Related:** Catalogue (screenshots), Videos (stays), Hamburger menu (new)

---

## 1. What Feature Log is

Feature Log is a design ops tracker inside the Catalogue. It lets teams track
features they are working on — from planned to designed to shipped — with
screenshots as evidence at each stage.

A feature is a named unit of work (e.g. "PnL Share", "Deposit V2", "Dark Mode")
that links to existing Catalogue screenshots. Screenshots are tagged as either
`design` (what was planned) or `shipped` (what went live). The feature itself
has a lifecycle status: Planned → Designed → Shipped.

The primary job: answer "what did we ship, what does the design look like vs
what actually shipped, and what's still in progress?"

---

## 2. Why this feature

AgentUX started as a flow-builder + canvas tool, but the real daily use is:
upload screenshots, organize by group, review, comment. Feature Log makes this
workflow explicit by giving features a name, a lifecycle, and a direct link to
the screenshots that prove the work.

This replaces the need for separate project management around "which screens
belong to which feature" — that context now lives inside the tool where the
screenshots already are.

---

## 3. What gets archived

| Feature | Action | Notes |
|---|---|---|
| Flow Builder (`/designer/`) | Archive — comment out from nav | Keep code, don't delete |
| Projects concept | Archive — remove from UI | Features replace projects as organizer |
| Figma component section | Move to hamburger menu | Not deleted, accessible from menu |
| Canvas / node system | Archive with Flow Builder | Keep code |

### What stays

| Feature | Why |
|---|---|
| Catalogue (screenshots, groups, views) | Core — Feature Log links into it |
| Videos section | Stays as top tab |
| Comments + Annotations | Stays — works on linked screenshots |
| Upload / Quick Upload | Stays — screenshots still need uploading |
| Group appearance (icons, descriptions) | Stays — groups are the brand/product axis |
| Compare mode | Stays — standalone Catalogue feature |

---

## 4. Navigation changes

### Header tabs (before)

```
[ Catalogue ]  [ Videos ]  [ Figma ]  [⚙ Settings]
```

### Header tabs (after)

```
[ Catalogue ]  [ Feature Log ]  [ Videos ]  [☰ Menu]
```

### Hamburger menu contents

```
┌─────────────────────────┐
│  Settings               │
│  ────────────────────── │
│  Team (admin only)      │
│  Figma                  │
│  ────────────────────── │
│  Archive                │
│  ├─ Flow Builder        │
│  └─ Projects            │
└─────────────────────────┘
```

- Settings moves from dedicated icon to first menu item
- Team section (admin-only) moves into menu
- Figma section moves into menu
- Archive section shows Flow Builder and Projects (read-only, clearly marked)
- Archived code is commented out from main UI, not deleted

---

## 5. Feature lifecycle

| Status | Meaning | Badge | Required to enter |
|---|---|---|---|
| **Planned** | Idea logged, no screenshots yet | ⚪ | Title + description |
| **Designed** | Design screenshots linked | 🟡 | At least 1 `design` link |
| **Shipped** | Production screenshots added | 🟢 | At least 1 `shipped` link |

### Status transitions

```
Planned ──→ Designed ──→ Shipped
   │                        │
   └────────────────────────┘
         (can skip to Shipped directly)
```

- **Planned → Designed**: Automatic when first `design` screenshot is linked
- **Designed → Shipped**: User clicks "Mark Shipped" → prompted to add at
  least one `shipped` screenshot → status flips
- **Planned → Shipped**: Allowed — skip designed if shipping directly
- **Shipped → Designed**: User can revert if needed (reopen)

---

## 6. Feature list view (main tab)

### Desktop

```
┌──────────────────────────────────────────────────────────────────────┐
│  FEATURE LOG                                        [+ New Feature]  │
│                                                                      │
│  ── SHIPPED ──────────────────────────────────────────────────────── │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Deposit V2                                       🟢 Shipped   │  │
│  │  Redesigned deposit flow with coin search                      │  │
│  │  4 designs · 3 shipped · Updated Apr 10                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── DESIGNED ─────────────────────────────────────────────────────── │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  PnL Share                                        🟡 Designed  │  │
│  │  Allow users to share their PnL as an image card               │  │
│  │  3 designs · 0 shipped · Updated Apr 8                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── PLANNED ──────────────────────────────────────────────────────── │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Dark Mode                                        ⚪ Planned   │  │
│  │  Full dark theme across all screens                            │  │
│  │  0 screenshots · Created Apr 7                                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Ordering

Features are sorted by:
1. Status group: Shipped first, then Designed, then Planned
2. Within each group: latest `updated_at` first

### Mobile

Same vertical list, full-width cards. "+ New Feature" becomes a FAB or sticky
bottom button.

---

## 7. Feature detail view (drill-in)

When user clicks a feature card, they see the detail page using Stack card
layout for linked screenshots.

### Desktop

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Feature Log     PnL Share                  [Edit] [Mark Shipped] │
│  "Allow users to share their PnL as an image card"                   │
│  🟡 Designed · 3 designs · 0 shipped · Updated Apr 8                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ── SHIPPED (what went live) ────────────── [+ Upload] [+ Link]  ── │
│                                                                      │
│  No shipped screenshots yet.                                         │
│  Click "Mark Shipped" to add production screenshots.                 │
│                                                                      │
│  ── DESIGNED (what was planned) ─────────── [+ Upload] [+ Link]  ── │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  PnL Card - Mockup                     [⋯]   │   │
│  │               │  Crpko · Deposit · Dark / Web                │   │
│  │   SCREENSHOT  │  ──────────────────────────────              │   │
│  │               │  💬 2 comments                               │   │
│  │               │                                              │   │
│  │               │  🅡 Rahul · 2h                                │   │
│  │               │  Rounded corners on the card look off        │   │
│  │               │                                              │   │
│  │               │  ┌─────────────────┐  [💬] [Unlink]          │   │
│  │               │  │ Add comment... │                           │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  PnL Share Flow - Step 2               [⋯]   │   │
│  │   SCREENSHOT  │  Crpko · Share · Dark / Web                  │   │
│  │               │  ──────────────────────────────              │   │
│  │               │  💬 0 comments                               │   │
│  │               │  ┌─────────────────┐  [💬] [Unlink]          │   │
│  │               │  │ Add comment... │                           │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────┬──────────────────────────────────────────────┐   │
│  │               │  Binance PnL Reference                 [⋯]   │   │
│  │   SCREENSHOT  │  Binance · Trade · Dark / Web                │   │
│  │               │  ──────────────────────────────              │   │
│  │               │  💬 1 comment                                │   │
│  │               │  ┌─────────────────┐  [💬] [Unlink]          │   │
│  │               │  │ Add comment... │                           │   │
│  └───────────────┴──────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Key elements

- **Back button** → returns to Feature Log list
- **Edit button** → edit title, description
- **Mark Shipped button** → triggers shipped flow (see section 10)
- **Two sections**: Shipped (top) and Designed (bottom)
- Each section has **[+ Upload]** and **[+ Link]** buttons
- Each linked screenshot renders as a **Stack card** (screenshot left, meta +
  comments right)
- Each card has an **[Unlink]** action — removes link, keeps screenshot in
  Catalogue
- Cross-group: screenshots from any group can appear (Crpko, Binance, etc.)

### Mobile

Cards switch to vertical layout (screenshot on top, meta + comments below).
Same two sections. Upload/Link buttons at section headers.

---

## 8. Upload — Hybrid model (Option C)

### From Catalogue (normal path)

Upload works exactly as today. Screenshot lands in Catalogue with
group/flow/variant metadata. No feature link.

### From inside a Feature detail page

Upload button context-aware:

1. User clicks **[+ Upload]** in the Shipped or Designed section
2. Upload modal opens — same as Catalogue upload modal
3. The `link_type` is pre-set based on which section they clicked:
   - [+ Upload] in Shipped section → `link_type: 'shipped'`
   - [+ Upload] in Designed section → `link_type: 'design'`
4. Screenshot gets created in Catalogue (normal) AND auto-linked to the
   feature with the correct `link_type`
5. User can still set group, flow, variant, theme, etc. as usual

### From inside a Feature detail page — link existing

1. User clicks **[+ Link]** in either section
2. **Mini Catalogue picker** opens:
   - Shows a grid of existing screenshots
   - Search bar + filter by group
   - User selects one or more screenshots
   - Confirms selection
3. Selected screenshots get linked with `link_type` matching the section
4. Screenshots remain in Catalogue, only a link row is created

### Unlinking

- Each linked screenshot card has an **[Unlink]** action
- Removes the `feature_log_links` row only
- Screenshot stays in Catalogue completely untouched
- No confirmation modal needed (it's reversible — just re-link)

---

## 9. Feature CRUD

### Create

1. User clicks **[+ New Feature]** on Feature Log tab
2. Modal opens with:
   - Title (required) — text input
   - Description (optional) — textarea
3. User submits → feature created with status `planned`
4. Redirects to feature detail page

### Edit

1. User clicks **[Edit]** on feature detail page
2. Same modal as create, pre-filled
3. Can edit title and description
4. Status is NOT edited here — it changes via Mark Shipped flow

### Delete

1. User clicks **[⋯]** overflow → Delete
2. Confirmation modal: "Delete PnL Share? This will remove the feature and
   all screenshot links. Screenshots themselves will NOT be deleted."
3. On confirm: delete `feature_log` row + all `feature_log_links` rows
4. Screenshots remain in Catalogue

---

## 10. Mark Shipped flow

1. User clicks **[Mark Shipped]** button on feature detail
2. If no shipped screenshots linked yet:
   - Bottom sheet / modal appears: "Add at least one shipped screenshot"
   - Two options: **Upload new** or **Link existing**
   - User completes upload/link with `link_type: 'shipped'`
3. Once at least 1 shipped screenshot is linked:
   - Status flips to `shipped`
   - `updated_at` refreshed
   - Feature moves to top of the Shipped group in the list
4. If shipped screenshots already exist (e.g. added earlier):
   - Status flips immediately, no prompt

### Revert to Designed

- Overflow menu → "Reopen feature"
- Status flips back to `designed` (or `planned` if no design links)
- No screenshots are removed

---

## 11. Mini Catalogue picker

The picker for linking existing screenshots to a feature:

```
┌──────────────────────────────────────────────────┐
│  Link screenshots to "PnL Share"          [✕]    │
│  ┌────────────────────────────────────────────┐  │
│  │ 🔍 Search screenshots...                  │  │
│  └────────────────────────────────────────────┘  │
│  Filter: [All groups ▾]                          │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ ░░░░ │ │ ░░░░ │ │ ░░░░ │ │ ░░░░ │            │
│  │      │ │  ✓   │ │      │ │  ✓   │            │
│  │ ░░░░ │ │ ░░░░ │ │ ░░░░ │ │ ░░░░ │            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
│  PnL Card  PnL Flow  Dashboard  Share Btn        │
│  Crpko     Crpko     Binance    Crpko            │
│                                                  │
│  ┌──────┐ ┌──────┐                               │
│  │ ░░░░ │ │ ░░░░ │                               │
│  │      │ │      │                               │
│  │ ░░░░ │ │ ░░░░ │                               │
│  └──────┘ └──────┘                               │
│  Trade View  Wallet                              │
│  Binance     Coinbase                            │
│                                                  │
│              [Cancel]  [Link 2 screenshots]      │
└──────────────────────────────────────────────────┘
```

- Grid of screenshot thumbnails from Catalogue
- Search by name
- Filter by group dropdown
- Multi-select with checkmarks
- Already-linked screenshots shown as disabled/grayed
- "Link N screenshots" confirms and creates `feature_log_links` rows

---

## 12. Data model

### New table: `feature_log`

```sql
create table if not exists public.feature_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  title       text not null,
  description text,
  status      text not null default 'planned',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint feature_log_status_check
    check (status in ('planned', 'designed', 'shipped'))
);

create index if not exists feature_log_user_status_idx
  on public.feature_log (user_id, status, updated_at desc);
```

### New table: `feature_log_links`

```sql
create table if not exists public.feature_log_links (
  id             uuid primary key default gen_random_uuid(),
  feature_id     uuid not null references public.feature_log (id) on delete cascade,
  screenshot_id  uuid not null,
  link_type      text not null default 'design',
  note           text,
  created_at     timestamptz not null default now(),

  constraint feature_log_links_type_check
    check (link_type in ('design', 'shipped')),

  constraint feature_log_links_unique
    unique (feature_id, screenshot_id)
);

create index if not exists feature_log_links_feature_idx
  on public.feature_log_links (feature_id, link_type, created_at desc);

create index if not exists feature_log_links_screenshot_idx
  on public.feature_log_links (screenshot_id);
```

### Key constraints

- `feature_log_links_unique`: a screenshot can only be linked once per feature
  (but can appear in multiple features)
- `on delete cascade`: deleting a feature removes all its links
- `screenshot_id` has no FK constraint to avoid cross-schema coupling — the app
  validates existence at link time

---

## 13. Component structure

```
components/
  CatalogueFeatureLog.tsx            ← feature list tab
  CatalogueFeatureCard.tsx           ← card in the list
  CatalogueFeatureDetail.tsx         ← detail / drill-in page
  CatalogueFeatureCreateModal.tsx    ← create / edit modal
  CatalogueFeatureLinker.tsx         ← mini Catalogue picker for linking
  CatalogueHamburgerMenu.tsx         ← new hamburger menu component

hooks/
  use-feature-log.ts                 ← CRUD + link/unlink operations

lib/
  feature-log-helpers.ts             ← status logic, sorting

styles/
  catalogue-feature-log.scss         ← all feature log styles

sql/
  feature-log.sql                    ← both tables + indexes
```

### Reuse

- Stack card layout from `CatalogueStackCard.tsx` (already shipped)
- Comments/annotations from existing hooks
- Upload modal from existing `CatalogueUploadModal` / `CatalogueQuickUploadModal`
- Auth from existing `useAuth` + guest guard pattern

---

## 14. Auth model

Same as Catalogue:

- **Authenticated user**: full CRUD on features, can link/unlink, upload,
  comment
- **Guest (no email)**: read-only — can view features and linked screenshots,
  cannot create/edit/link/upload. Prompted to enter email on any write action.

---

## 15. Empty state

First time opening Feature Log with zero features:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│           📋                                     │
│                                                  │
│     Track your features from                     │
│     design to shipped                            │
│                                                  │
│     Create a feature, link screenshots from      │
│     your Catalogue, and mark it shipped when      │
│     it goes live.                                │
│                                                  │
│          [+ Create your first feature]           │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 16. Risks and considerations

1. **Cross-group linking** — a feature can link screenshots from any group.
   The mini picker must show all groups, not just the active filter.

2. **Screenshot deletion** — if a screenshot is deleted from Catalogue, the
   `feature_log_links` row becomes orphaned. The detail view should handle
   this gracefully (show "Screenshot deleted" placeholder, allow unlink).

3. **Feature count scale** — most teams will have 10-50 features. No
   virtualization needed for V1. Revisit if usage grows.

4. **Status auto-transitions** — linking a `design` screenshot to a `planned`
   feature should auto-promote to `designed`. This should be explicit in the
   hook, not implicit side-effect.

5. **Hamburger menu** — replacing the settings icon is a visual regression risk.
   The hamburger must be clearly tappable and not confused with a back button.

6. **Archive visibility** — archived features (Flow Builder, Projects) should
   be clearly marked as "archived" with reduced visual weight. Users should
   understand these are historical, not active.

---

## 17. Out of scope for V1

- Due dates / timelines on features
- Assignees / team members per feature
- Kanban board view of features
- Notifications when features ship
- Side-by-side designed vs shipped comparison view
- Feature templates or recurring feature types
- Export / reporting on feature velocity

---

## 18. Milestones

### M0 — Hamburger menu + archive

- Replace settings icon with hamburger menu
- Move Settings, Team, Figma into hamburger
- Add Archive section with Flow Builder and Projects (commented out from nav)
- Comment out Flow Builder and Projects from main tab area

### M1 — Feature Log tab (empty + CRUD)

- Add "Feature Log" tab to header
- `feature_log` table in Supabase
- Create / edit / delete features
- Feature list view with status badges and ordering
- Empty state

### M2 — Screenshot linking

- `feature_log_links` table in Supabase
- Mini Catalogue picker (search + filter + multi-select)
- Link / unlink screenshots from feature detail
- Auto-status promotion (planned → designed when first design linked)

### M3 — Feature detail with Stack cards

- Detail page with Shipped and Designed sections
- Stack card layout for linked screenshots
- Comments on linked screenshots (reuse existing)
- Mark Shipped flow with prompt

### M4 — Context-aware upload

- Upload from feature detail auto-links to feature
- Pre-set `link_type` based on section (shipped/designed)
- Upload modal works same as Catalogue, just adds the link

### M5 — Polish

- Mobile responsive tuning
- Keyboard shortcuts
- Orphaned screenshot handling
- Feature search / filter (if needed at scale)

---

## 19. Decision log

| # | Question | Decision |
|---|---|---|
| 1 | Cross-group features? | Yes — any group |
| 2 | Screenshot in multiple features? | Yes |
| 3 | Auth model | Same as Catalogue (email-based) |
| 4 | Feature ordering | Latest first, grouped by status |
| 5 | Shipped section layout | Separate section above designed |
| 6 | Link picker | Mini Catalogue grid (search + filter) |
| 7 | Unlink without deleting screenshot? | Yes |
| 8 | Where to create features | Only from Feature Log tab |
| 9 | Empty state | CTA + short explainer |
| 10 | Activity feed / notifications | No — visible in feature detail only |
| 11 | Upload auto-link model | Option C — hybrid (context-aware) |
| 12 | Compare mode in Feature Log? | No — already in Catalogue |

---

## References

- Catalogue data model: `ScreenshotNode`, `ScreenFamily`, `CatalogueFamilyView`
- Stack card component: `CatalogueStackCard.tsx`, `CatalogueStackView.tsx`
- Upload system: `use-catalogue-upload.ts`, `CatalogueUploadModal.tsx`
- Auth: `useAuth`, `CatalogueEmailPromptModal.tsx`
- Hamburger menu: new component, replaces `CatalogueHeader.__settings`
