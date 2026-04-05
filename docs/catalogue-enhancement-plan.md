# Catalogue — Feature Roadmap & Research

Single source of truth for all Catalogue feature planning, research, and decisions.

---

## UX Design: Unified Catalogue

### Principle
Catalogue is the **single home** for all screenshot and flow work. No separate Flow Builder needed for comparison workflows. Everything lives in one scrollable, mobile-friendly space.

### Three Modes (same page, same toolbar)

| Tab | Sub-mode | What shows |
|-----|----------|------------|
| **Screens** | Compare OFF | Normal grid/list/gallery (existing) |
| **Screens** | Compare ON | Flow strips stacked by group (new) |
| **Videos** | — | Reference videos + X posts (existing, shipped) |

Compare is a **toggle within the Screens tab**, not a separate page.

### Mobile Layout — Screens (Compare OFF, default)

```
┌─────────────────────────────┐
│  [≡] [↕] [⊞≡🖥] [🔍] [+]  │  ← existing toolbar
├─────────────────────────────┤
│  [Screens] [Videos]         │  ← existing tabs
├─────────────────────────────┤
│                              │
│  ☐ Deposit Address    (37)  │  ← normal grid
│  ┌───────────────────────┐  │
│  │     screenshot        │  │
│  └───────────────────────┘  │
│                              │
│  ☐ Coin Suspended     (12)  │
│  ┌───────────────────────┐  │
│  │     screenshot        │  │
│  └───────────────────────┘  │
│                              │
└─────────────────────────────┘
```

### Mobile Layout — Screens (Compare ON)

```
┌─────────────────────────────┐
│  [≡] [↕] [⊞≡🖥] [🔍] [+]  │
├─────────────────────────────┤
│  [Screens] [Videos]         │
│  [Deposit ▾]  [Compare: ON] │  ← flow picker + toggle
├─────────────────────────────┤
│                              │
│  Crpko ● · 4 steps          │  ← primary group first
│  ┌───┐ → ┌───┐ → ┌───┐ → ┌───┐
│  │   │   │   │   │   │   │   │
│  └───┘   └───┘   └───┘   └───┘
│  Select   Amount  Review   Done
│                              │
│  ─────────────────────────── │
│                              │
│  Binance · 3 steps · -1     │  ← vs group
│  ┌───┐ → ┌───┐ → ┌───┐    │
│  │   │   │   │   │   │     │
│  └───┘   └───┘   └───┘     │
│  Select   Address  Done     │
│           ⚠ Missing: Review │
│                              │
│  ─────────────────────────── │
│                              │
│  Coinbase · 4 steps · +1    │  ← vs group
│  ┌───┐ → ┌───┐ → ┌───┐ → ┌───┐
│  │   │   │   │   │   │   │   │
│  └───┘   └───┘   └───┘   └───┘
│  Select   Network  Review   Done
│           ★ Extra: Network   │
│                              │
└─────────────────────────────┘
        ↕ scroll
```

### Mobile Layout — Videos (existing, unchanged)

```
┌─────────────────────────────┐
│  [≡] [↕] [⊞≡🖥] [🔍] [+]  │
├─────────────────────────────┤
│  [Screens] [Videos]         │  ← Videos active
├─────────────────────────────┤
│                              │
│  Reference Videos            │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ ▶️  │ │ ▶️  │ │ ▶️  │  │
│  └─────┘ └─────┘ └─────┘  │
│                              │
│  X Posts                     │
│  ┌─────────────────────┐    │
│  │  embedded tweet      │    │
│  └─────────────────────┘    │
│                              │
└─────────────────────────────┘
```

### Desktop Layout — Compare ON

```
┌──────────────────────────────────────────────────────────────┐
│  AgentUX                                    [rahul] [⚙]     │
├──────────────────────────────────────────────────────────────┤
│  [Search......] [Filter] [Sort ▾] [⊞≡🖥]  [Quick] [+Upload]│
│  [Screens] [Videos]       [Deposit ▾]        [Compare: ON]  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Crpko (Primary) ─── Deposit ───────────────────────────┐│
│  │                                                          ││
│  │  ┌─────┐  →  ┌─────┐  →  ┌─────┐  →  ┌─────┐         ││
│  │  │ img │     │ img │     │ img │     │ img │          ││
│  │  └─────┘     └─────┘     └─────┘     └─────┘         ││
│  │  Select      Amount      Review       Success          ││
│  │  4 steps                                               ││
│  └────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─ Binance ─── Deposit ───────────────────────────────────┐│
│  │  ┌─────┐  →  ┌─────┐  →  ┌─────┐       3 steps        ││
│  │  │ img │     │ img │     │ img │       -1 vs primary   ││
│  │  └─────┘     └─────┘     └─────┘       ⚠ Missing:     ││
│  │  Select      Address     Success         Review         ││
│  └────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─ Coinbase ─── Deposit ──────────────────────────────────┐│
│  │  ┌─────┐  →  ┌─────┐  →  ┌─────┐  →  ┌─────┐         ││
│  │  │ img │     │ img │     │ img │     │ img │  4 steps ││
│  │  └─────┘     └─────┘     └─────┘     └─────┘  +1 extra││
│  │  Select      Network     Review       Success  ★Network││
│  └────────────────────────────────────────────────────────┘│
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Compare Mode Behavior

| Action | Result |
|--------|--------|
| Toggle Compare ON | Flow picker appears, view switches to flow-strip layout |
| Toggle Compare OFF | Back to normal grid/list/gallery |
| Change flow in picker | Shows that flow across all groups |
| Tap a screenshot in strip | Opens existing lightbox |
| Scroll vertically | See more groups for the same flow |
| Horizontal swipe on strip | See more steps if flow is long |

### Insights (shown per vs group)

| Insight | When shown |
|---------|-----------|
| `+N steps` / `-N steps` | Step count differs from primary |
| `⚠ Missing: {screen}` | Primary has a step that vs group doesn't |
| `★ Extra: {screen}` | Vs group has a step that primary doesn't |
| Similarity score | Percentage overlap with primary |

---

## 1. Video Support — SHIPPED

Already built in `CatalogueVideosSection.tsx`:
- Reference videos from benji.org (55 clips)
- X/Twitter post embeds with save/remove
- Comments per video/post (stored in `catalogue_video_comments`)
- Preview modal with video player + comments panel
- Accessible via Videos tab in header

---

## 2. Quick Upload Enhancement

### Problem
Bulk uploading screenshots requires setting platform/preset/OS individually. Quick Upload doesn't support batch-level settings, and parsed filename `group` doesn't map to `flow_label`.

### Solution
Add batch-level fields to Quick Upload. Parse filenames to auto-extract flow + screen name + sequence.

### File Naming Convention

```
{sequence}-{flow}-{screen-name}.png
```

Example: `03-deposit-review-details.png` →
- sequence: `3` (order within flow)
- flow: `deposit` (→ flow label)
- name: `Review Details` (screen name)

**Existing parser already supports this.** The `parseScreenshotName()` function in `designer/src/lib/naming.ts` splits by dashes, extracts sequence prefix, first segment becomes group (which we map to flow label).

### Folder Structure

```
📁 Crpko-Web-MVP/
├── 01-deposit-select-coin.png
├── 02-deposit-enter-amount.png
├── 03-deposit-review-details.png
├── 04-deposit-confirm-otp.png
├── 05-deposit-success.png
├── 01-withdraw-select-coin.png
├── 02-withdraw-enter-address.png
├── ...
├── 01-auth-login.png
├── 02-auth-register.png
└── 01-home-dashboard.png
```

Same filenames for mobile — batch settings change platform/preset/OS.
Same filenames for competitors — batch group changes (Binance, Coinbase, etc.).

### Batch Settings (per upload)

| Setting | Crpko Web | Crpko Mobile | Competitor |
|---------|-----------|-------------|------------|
| Group | Crpko | Crpko | Binance/etc |
| Platform | web | mobile | web |
| Preset | 1512 | — | 1512 |
| OS | — | ios | — |
| Theme | dark | dark | dark |

### Renaming Existing Screenshots

For screenshots already uploaded without the naming convention, run this **locally** (not in cloud/sandbox — needs internet access to Supabase):

**Prerequisites:**
- Clone the repo on your local machine
- `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set
- Claude Code CLI installed

**Steps:**
1. Open Claude Code in the repo folder on your local machine
2. Ask Claude Code to run a script that:
   - Queries Supabase for all screenshot records (id, name, image_url, metadata)
   - Downloads each image to a temp folder
3. Claude Code reads each image (multimodal) and identifies:
   - The app/brand (from UI/branding in the screenshot)
   - The flow (deposit, withdraw, auth, etc.)
   - The screen name (select coin, review, success, etc.)
   - The logical sequence within the flow
4. Claude Code generates rename mappings and updates Supabase:
   - `name` → new parsed screen name
   - `metadata.catalogue_flow_label` → identified flow
   - `sequence` → order within the flow
5. Provide a reference list of expected flows/screens for better accuracy

**Note:** This cannot be done from the cloud sandbox environment (no external internet). Must be run locally where Supabase is reachable.

### Implementation
- Add batch fields to Quick Upload: group, platform, theme, preset/OS
- Map parsed `group` from filename → `flow_label` on the screenshot
- Auto-assign `sequence` from filename prefix
- Support folder drag-and-drop

---

## 3. Primary Group + Compare Mode

### Problem
Need to set Crpko as primary product and compare its flows against competitors.

### Existing Infrastructure (already in codebase)

| Piece | Status |
|-------|--------|
| `project.primary_group` | In DB + types + hook (hardcoded `null` at `use-catalogue-filters.ts:39`) |
| `project.vs_groups` | In DB + types + hook (hardcoded `[]` at `use-catalogue-filters.ts:40`) |
| `screenshot.sequence` | In DB + types (mostly unused) |
| `metadata.catalogue_flow_label` | Working |
| Group config UI | Built in toolbar (`showGroupConfig={false}` in Catalogue.tsx) |
| Sort by primary → vs groups | Already implemented in `useCatalogueFilters` |
| Flow comparison engine | `lib/compare-flows.ts` — diffs steps + transitions, similarity score |
| Step normalizer | `lib/flow-step-normalizer.ts` — normalizes names for matching |
| FlowCompareModal UI | `FlowCompareModal.tsx` — side-by-side with shared/unique sections |
| Auto-connect algorithm | `lib/auto-connect.ts` — sequence + group based |

### What needs to happen

**3a. Activate primary/vs groups:**
1. Remove hardcoded `null`/`[]` in `useCatalogueFilters`
2. Set `showGroupConfig={true}` in `Catalogue.tsx`
3. Primary group gets badge, sorts first

**3b. Add Compare toggle to toolbar:**
1. Compare toggle button in toolbar (within Screens tab)
2. Flow picker dropdown (shows available flow labels)
3. When ON: switches from grid to flow-strip view

**3c. Build flow-strip compare view:**
1. Group screenshots by `group` + `flow_label` + sort by `sequence`
2. Primary group flow strip on top
3. Vs group strips below with diff insights
4. Horizontal scroll per strip, vertical scroll for groups
5. Tap screenshot → existing lightbox

**3d. Bridge Catalogue data to comparison engine:**
1. Build `FlowCompareSnapshot` from catalogue data (group + flow_label + sequence)
2. Reuse `buildComparison()` diff logic from `compare-flows.ts`
3. Generate insights: missing steps, extra steps, step count diff, similarity score

---

## 4. Screen Audit Dashboard (future)

- Per group: total screens, screens in flows, orphaned
- Per flow: step count, coverage across groups
- Quick actions: assign orphaned screens, mark as "not needed"

---

## Implementation Priority

| Step | Feature | Effort | Dependencies |
|------|---------|--------|-------------|
| 1 | Rename existing screenshots (run locally) | Medium | Naming convention defined |
| 2 | Quick Upload Enhancement | Medium | Step 1 validates the convention |
| 3 | Activate primary_group + vs_groups | Small | None |
| 4 | Compare mode + flow-strip view | Large | Steps 2 + 3 |
| 5 | Screen audit dashboard | Medium | Step 4 |

**Already shipped:** Video support (`CatalogueVideosSection.tsx`)
