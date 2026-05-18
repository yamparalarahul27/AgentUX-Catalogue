# AgentUX Catalogue — Backlog

Living index of parked features, ideas, polish items, and bugs. Each row links
to a memory file (for full context) or to a PR (for in-flight work).

**How to use**

- Start a session by picking an item from the **Open** section.
- When a PR lands an item, move it to **Recently shipped** in the same PR.
- New ideas go straight into **Open** with a memory file backing them.
- Estimates are rough — sizes are 🟢 quick (≤3h), 🟡 medium (½ day), 🔵 large (full session + scoping).

Last updated: 2026-05-18 — added post-login 404 (🟢), Edit/Share pill styling (🟢), in-app "What's new" (🔵). Mobbin #3 extended to "mobile = icons everywhere" beyond the strip.

---

## 🔴 Open bugs

| Item | Status | Source |
|---|---|---|
| `purge-orphan-storage` Edge Function returns 500 after CORS fix | PR #85 open — needs Supabase log read to identify server-side error | [`parked_orphan_storage_cleanup`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_orphan_storage_cleanup.md) |

---

## 🟢 Quick wins (≤ 3 hours each)

| Item | Area | Source |
|---|---|---|
| Rename "Bookmarks" → "Saved" + parabolic flight animation to the nav entry on save | Sidebar / micro-interaction | [Mobbin backlog #1 + #9](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Subtle hover scale/rotate on every icon-button | Polish | [Mobbin backlog #2](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Icons for Filter / Group / Flow / Group View in toolbar | Toolbar | [`parked_toolbar_filter_icons`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_toolbar_filter_icons.md) |
| Post-login 404 page — catch-all `Route` rendering a branded NotFound + "Back to catalogue" | Routing | [`parked_post_login_404`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_post_login_404.md) |
| Restyle Edit/Share buttons to match Figma design-system pill (needs Figma reference) | Group detail | [`parked_edit_share_pill_styling`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_edit_share_pill_styling.md) |
| Lightbox: ESC to close + upload date "X days ago" (exact on hover) | Lightbox | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Settings: reorder tabs so Groups appears first | Settings | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Gallery: remove Reupload button | Gallery | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Combobox in lightbox: show group icons in the options | Lightbox | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |

---

## 🟡 Medium effort (½ day)

| Item | Area | Source |
|---|---|---|
| Share-page polish — tighter paddings + carousel as default + targeted UI optimisation (user will point at specifics) | Share | [`parked_share_page_polish`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_share_page_polish.md) |
| Edit-icon modal: Type + Region side-by-side, wrap chips, replace upload box with a simple button | Group editor | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Catalogue strip (mobile) — SIP-style big icons + hover names | Mobile chip strip | [Mobbin backlog #3](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Tooltip pass — replace remaining `title=…` natives with Radix Tooltip | Polish | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md), [`feedback_radix_for_primitives`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/feedback_radix_for_primitives.md) |
| Trash for non-admin (own items, read-only, 15-day window) | Trash | [`parked_marketing_trash_visibility`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_marketing_trash_visibility.md) |
| Settings: better empty states + flow card improvements | Settings | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Inline-toast → real toast notifications across the app | Notifications | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| useEffect audit — sweep 213 effects for "You Might Not Need an Effect" anti-patterns; replace with derived state / handlers / `useMemo` | Code quality | [`parked_useeffect_audit`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_useeffect_audit.md) |
| Animated main-tab indicator (buildui.com pattern) | Navigation | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Customisable quick-filter chip strip (Cex/Dex/Spot/Futures etc.) | Search | [Mobbin backlog #7](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Group View — shrunken dock when active (pill of 8 overlapping icons, click-to-expand, scroll-to-collapse) | Catalogue dock | [`parked_group_view_shrunken_dock`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_view_shrunken_dock.md) |
| Group detail: Edit button (extract `GroupAppearanceEditModal` state into a hook / dialog) | Group detail | [`parked_group_detail_followups`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_detail_followups.md) |
| Group detail: full `CatalogueFamilyLightbox` (annotations / comments / metadata) on preview | Group detail | [`parked_group_detail_followups`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_detail_followups.md) |

---

## 🔵 Larger features (need scoping session)

| Item | Source |
|---|---|
| Per-role onboarding flow (welcome modal was step 1) | [`parked_onboarding_flow_new_users`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_onboarding_flow_new_users.md) |
| Feature unlock for users (per-role / per-user) | [`parked_feature_unlock_for_users`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_feature_unlock_for_users.md) |
| Full bucket/scope architecture (replaces group-as-bucket) | [`parked_full_bucket_architecture`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_full_bucket_architecture.md) |
| Approval workflow for uploads | [`parked_approval_workflow`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_approval_workflow.md) |
| **Architecture cleanup: remove `Project` as a scoping concept** (latent bug source) | [`parked_remove_project_concept`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_remove_project_concept.md) |
| Variants / versions view for a screenshot | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Search/filter overhaul — typeahead pills + filter modal + quick toggles | [Mobbin backlog #5–#7](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Text-view mode with hover-shuffling screenshot previews | [Mobbin backlog #8](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Carousel-style screenshot card (Mobbin-style, multiple shots per card) | [Mobbin backlog #10](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Feedback / Bug Report modal | [Mobbin backlog #11](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| "What's new" in-app surface — release notes / activity feed visible inside the catalogue | [`parked_whats_new_in_app`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_whats_new_in_app.md) |
| Video section + Link section UI improvements | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Full-page loading: design quotes + "About me and my work" instead of plain spinner | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Roles / Members panel UI improvements | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Skeuomorphic physical toggle component (overlaps with `skeumorphic-ui` skill) | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Multi-select chip with quick-remove | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Sort/filter ordering based on usage frequency | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Favourite groups in the chip strip | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Trigger public group view from the group strip | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Loading states for flows / groups / other views | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Group trading volume from CoinGecko (CEX) + DefiLlama (DEX) on group header/detail | [`parked_group_trading_volume`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_trading_volume.md) |
| Per-group UX strengths chart (Auth/Trading/Onboarding scores; curator vs peer review TBD) | [`parked_group_ux_strengths`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_ux_strengths.md) |
| "Features" filter — hierarchy above Flows (e.g. "Spot" feature bundles many trading flows); needs schema + assignment UI | [`parked_features_filter`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_features_filter.md) |

---

## 🌍 Open upstream PRs (yours)

| PR | Title | URL |
|---|---|---|
| Tegaki #48 | fix(generator): fall back to requested family when font name table is missing | https://github.com/KurtGokhan/tegaki/pull/48 |
| Tegaki #49 | docs(website): add Vite bundler setup guide | https://github.com/KurtGokhan/tegaki/pull/49 |

Working clone is at `~/Desktop/tegaki-fork/` if review feedback comes.

---

## ✅ Recently shipped (for context)

| PR | What | Closed items from this backlog |
|---|---|---|
| #107 | Welcome modal: hero handwriting on first login (5 scripts) | Onboarding (step 1) |
| #106 | Settings → Team: span all projects, drop URL filter hydration | **Allinx/Bvox missing bug** |
| #105 | Magnified bottom dock: cursor-proximity group picker (desktop) | **Catalogue strip at bottom with macOS magnification** |
| #104 | EditableTitle: click-to-rename on lightbox, stack, gallery | **Click filename to edit inline** |
| #103 | Single-screenshot share: lightbox + card share buttons + hero view | — |
| #102 | Share page paddings + carousel-as-default partial | Partial of share-page polish (still has follow-up) |
| #101 | Search shortcut: `/` opens search modal | **`/` keyboard shortcut for search** |
| #100 | Admin passcode shared unlock (sessionStorage) | — |
| #98 | Delete-UI gating + revert-on-RLS-reject + role-aware toast (A+B+C1 of delete UX) | A+B+C1 from delete UX bundle (C2 still parked) |

---

## Notes on this doc

- Every row should point at a `parked_*.md` memory file. If an item lacks one, create one as part of picking it up — don't leave detail in this index alone.
- This file is intentionally short on detail; depth lives in the memory files and in PR descriptions.
- When in doubt about size, err larger — under-promise on triage.
