# AgentUX Catalogue — Backlog

Living index of parked features, ideas, polish items, and bugs. Each row links
to a memory file (for full context) or to a PR (for in-flight work).

**How to use**

- Start a session by picking an item from the **Open** section.
- When a PR lands an item, move it to **Recently shipped** in the same PR.
- New ideas go straight into **Open** with a memory file backing them.
- Estimates are rough — sizes are 🟢 quick (≤3h), 🟡 medium (½ day), 🔵 large (full session + scoping).

Last updated: 2026-05-26 (latest) — Added coverage-score-per-group as 🔵 (user flagged important; denominator open — overlaps with UX strengths chart). Earlier (2026-05-25): Cleared two stale rows that had already shipped (T scroll-to-top → PR #147; App-update toast base feature → PR #141). Earlier (2026-05-23): Four items filed from a single batch of screenshots: overlapping annotation labels (🔴 bug — labels collide when boxes stack vertically), video lightbox side-panel stretches with long X embeds (🔴 bug — empty dark area), Quick Upload paste-tile becomes an iOS-opt-in toggle + drop zone shrinks (🟢), and strip + active-filter chip redundancy (🟡 — needs design pass). Earlier (2026-05-21): Two more ideas added on top of the earlier seven: App Store / Play Store info on the group detail page (🟡, hardcoded with "as-of" date, recommended build) and Crop UI polish split into two parts — dotted guide lines (🟢, ship) + "pieces detach" animation on confirm (🔵 trial-only with shift-to-skip + `prefers-reduced-motion` fallback). Thought-through in [mockup-2026-05-21-app-store-and-crop-animation.html](mockups/mockup-2026-05-21-app-store-and-crop-animation.html). Earlier (2026-05-21): Seven ideas / page-feedback items filed from a single dump: `T` keyboard shortcut for scroll-to-top (🟢), Studio button enforce circle h=w (🟢), name-based group onboarding for new users (🔵, delight feature), Designer Picks featured row on group detail (🟡, needs `is_designer_pick` column), video timestamp comments (🔵, blocked on moving off X embeds), Telegram-as-video-storage (🔵, NOT recommended — Supabase Storage already wired and better-suited), and edit-comments (🟡, missing CRUD round-trip). Earlier (2026-05-21): Performance program after reading Linear's perf breakdown: six techniques mapped to this stack (IndexedDB cache for catalogue, SW precache, lazy chunks for lightbox/Tegaki/admin, inline app shell + localStorage boot restore, animation audit for composited props ≤150ms, variable Inter self-host). Filed as 🟢 quick wins (E+F bundle) and 🔵 full program. Earlier (2026-05-20): Mobile QA pass: share modal not centered on mobile (🔴 bug, in `CatalogueShareModal`); Filters bottom sheet hard to use on mobile — long A–Z group list, no search, Flow/Platform/Sort buried (🔵, overlaps Mobbin #5–#7). Earlier (2026-05-18): `/designer` page feedback: bottom-to-top fading gradient behind the "No matching screen families" empty state (🟢). Clickable group label on catalogue card → `/g/<key>` (🟢), and group-detail header collapsing into a sticky strip on scroll (🟡). Dimensional border shadows experiment (🟢, replace flat 1px borders with inset highlight + outer shadow, both themes). Post-login 404 (🟢), Edit/Share pill styling (🟢), in-app "What's new" (🔵). Mobbin #3 extended to "mobile = icons everywhere" beyond the strip. Multi-select group chip stub clarified (mobile `×` chips + smooth removal, emilkowal.ski reference). Feedback modal (#11) now has a working mockup ([mockup-2026-05-18-feedback-modal.html](mockups/mockup-2026-05-18-feedback-modal.html)) — Emil Kowalski morphing pill pattern.

---

## 🔴 Open bugs

| Item | Status | Source |
|---|---|---|
| `purge-orphan-storage` Edge Function returns 500 after CORS fix | PR #85 open — needs Supabase log read to identify server-side error | [`parked_orphan_storage_cleanup`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_orphan_storage_cleanup.md) |
| Share modal ("Share this view") not center-aligned on mobile — sits flush left/bottom in iOS Safari | Reproduced via mobile QA screenshot 2026-05-20; CSS-only fix in `CatalogueShareModal` | [`parked_mobile_share_modal_alignment`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobile_share_modal_alignment.md) |
| Overlapping annotation labels in lightbox — stacked boxes cause labels to collide with each other and obscure screenshot content | Reported 2026-05-23 from "Propose Position" mobile screenshot; needs anchor-offset / collision logic | [`parked_overlapping_annotations`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_overlapping_annotations.md) |
| Video lightbox side panel stretches with long X embeds — leaves empty dark area below "Add a reference note" input | Reported 2026-05-23 from @williambout "Secure Your Account" tweet; CSS-only align-self / sticky fix | [`parked_video_lightbox_side_panel_stretch`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_video_lightbox_side_panel_stretch.md) |

---

## 🟢 Quick wins (≤ 3 hours each)

| Item | Area | Source |
|---|---|---|
| Rename "Bookmarks" → "Saved" + parabolic flight animation to the nav entry on save | Sidebar / micro-interaction | [Mobbin backlog #1 + #9](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Subtle hover scale/rotate on every icon-button | Polish | [Mobbin backlog #2](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| Icons for Filter / Group / Flow / Group View in toolbar | Toolbar | [`parked_toolbar_filter_icons`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_toolbar_filter_icons.md) |
| Concentric corner radii audit — apply `inner = outer − padding` wherever a rounded element sits inside another rounded container with non-zero padding | Polish / design system | [`feedback_concentric_corner_radii`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/feedback_concentric_corner_radii.md) |
| Restyle Edit/Share buttons to match Figma design-system pill (needs Figma reference) | Group detail | [`parked_edit_share_pill_styling`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_edit_share_pill_styling.md) |
| Lightbox: ESC to close + upload date "X days ago" (exact on hover) | Lightbox | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Settings: reorder tabs so Groups appears first | Settings | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Gallery: remove Reupload button | Gallery | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Combobox in lightbox: show group icons in the options | Lightbox | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Capability staleness: admin self-edit invalidates own caps; cross-session "Your role was updated · Refresh now" banner; web preset save broadcast | Auth / RBAC | [`parked_capability_staleness`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_capability_staleness.md) |
| Dimensional border experiment — replace flat 1px borders with `inset 0 1px 0 white` + `0 1px 0 rgba(0,0,0,0.04)`; dark theme uses ~6% white inset + ~40% black outer. Trial on one surface first | Polish | [`parked_dimensional_border_shadows`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_dimensional_border_shadows.md) |
| Catalogue card group label → group detail page (`<CatalogueGroupLabel>` inside `<CatalogueFamilyCard>` becomes a link to `/g/<key>`). Scope click handling so share-page H1 and other consumers stay non-interactive | Catalogue card | [`parked_clickable_group_label_on_card`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_clickable_group_label_on_card.md) |
| "No matching screen families" empty state: bottom-to-top fading gradient background (theme-aware, scoped to the empty-state container) | Catalogue empty state | [`parked_empty_state_gradient_fade`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_empty_state_gradient_fade.md) |
| Upload button: add tactile depth (layered shadows + inset top highlight + subtle gradient + pressed state). Light + dark variants; may pilot the dimensional-borders system | Polish / primary action | [`parked_upload_button_depth`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_upload_button_depth.md) |
| Login page polish — real brand mark + tagline (A), returning-user email shortcut (B), loading/error micro-interactions (F). Smallest viable "front door fix" bundle | Auth / brand | [`parked_login_page_polish`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_login_page_polish.md) |
| Perf quick wins (E+F bundle): self-host variable Inter (drop 4×Google-Fonts hops) + animation audit (composited props only, ≤150ms). No architecture risk; needs Lighthouse baseline before/after | Perf | [`parked_perf_linear_techniques`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_perf_linear_techniques.md) |
| Labelling Studio header button — enforce `height: 32px` on `.catalogue-header__tab--icon` so it renders as a true circle alongside the other 34×34 icon-buttons in `.catalogue-header__right` | Polish / header | [`parked_studio_button_circle`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_studio_button_circle.md) |
| Lightbox crop — dotted guide lines (Part A of the crop UI polish). Replace solid border + grid with `border-style: dashed` to match Photoshop / Figma convention. Zero risk, one CSS line | Lightbox / polish | [`parked_crop_dotted_lines_and_detach_animation`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_crop_dotted_lines_and_detach_animation.md) |
| Quick Upload modal — paste tile becomes an iOS-opt-in toggle (off by default), drop zone shrinks to a single shorter surface | Upload UX | [`parked_paste_toggle_and_dropzone_height`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_paste_toggle_and_dropzone_height.md) |

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
| Group detail: header collapses into a thin sticky strip on scroll (icon + label + meta + Share/Edit stay accessible while browsing). `IntersectionObserver` + `position: sticky` | Group detail | [`parked_group_detail_sticky_strip_header`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_detail_sticky_strip_header.md) |
| Login page hero — Tegaki handwriting greeting (D) + segmented passcode input (C) + memorable backdrop (E). The "all-in" bundle from the login polish memory; login becomes brand, not gate | Auth / brand | [`parked_login_page_polish`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_login_page_polish.md) |
| Videos section: click-to-load X embeds — replace always-embedded posts with thumbnail-first cards that only load `widgets.js` after a user click. Privacy + perf + cleaner UI | Videos | [`parked_videos_click_to_load`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_videos_click_to_load.md) |
| Designer Picks featured row on group detail — admin-curated screenshots flagged via `is_designer_pick` shown above the regular Web/Mobile grids on `/g/<key>` | Group detail | [`parked_designer_picks_group_detail`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_designer_picks_group_detail.md) |
| Edit comments (web + mobile) — UPDATE RLS policy + inline edit affordance on own comments, with `edited_at` timestamp and "(edited)" suffix | Comments | [`parked_edit_comments`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_edit_comments.md) |
| App Store + Play Store info on group detail — show store icons + hardcoded rating / download count with "as-of <month>" footnote on `/g/<key>`. Optional fields, hide when no URLs. Existing `apple-logo.svg` / `android-logo.svg` ready to use | Group detail | [`parked_app_store_info_on_group_detail`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_app_store_info_on_group_detail.md) |
| Strip + active-filter chip redundancy — when chip-strip is on, the remove-pill above duplicates the same selection state shown by the highlighted strip chip. Needs design pass (drop pill / move × onto strip chip / soft text link) | Catalogue toolbar | [`parked_strip_chip_redundancy`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_strip_chip_redundancy.md) |

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
| Feedback / Bug Report modal — Emil Kowalski morphing pill pattern, see [mockup](mockups/mockup-2026-05-18-feedback-modal.html) | [Mobbin backlog #11](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobbin_ux_backlog.md) |
| "What's new" in-app surface — release notes / activity feed visible inside the catalogue | [`parked_whats_new_in_app`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_whats_new_in_app.md) |
| Video section + Link section UI improvements | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Full-page loading: design quotes + "About me and my work" instead of plain spinner | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Roles / Members panel UI improvements | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Skeuomorphic physical toggle component (overlaps with `skeumorphic-ui` skill) | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Multi-select group chip with `×` (mobile-style) + smooth removal animation | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Sort/filter ordering based on usage frequency | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Favourite groups in the chip strip | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Trigger public group view from the group strip | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Loading states for flows / groups / other views | [UX polish dump](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_ux_polish_backlog.md) |
| Group trading volume from CoinGecko (CEX) + DefiLlama (DEX) on group header/detail | [`parked_group_trading_volume`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_trading_volume.md) |
| Per-group UX strengths chart (Auth/Trading/Onboarding scores; curator vs peer review TBD) | [`parked_group_ux_strengths`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_ux_strengths.md) |
| **Coverage score per group (Mobile + Web)** — breadth-of-capture metric split by platform on each group card and `/g/<key>` hero. User flagged as important. Denominator still open (canonical flow list vs diversity vs bucketed count); overlaps with the UX-strengths chart above — consider bundling | [`parked_group_coverage_score`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_group_coverage_score.md) |
| "Features" filter — hierarchy above Flows (e.g. "Spot" feature bundles many trading flows); needs schema + assignment UI | [`parked_features_filter`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_features_filter.md) |
| Colour filter — once colour metadata is captured on every screenshot, surface a Colour filter rendered as a **circular flower-shape** swatch picker (petals = colour buckets, radial layout). Metadata pipeline (extraction + storage) is a precondition and a separate prior PR | [`parked_colour_filter`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_colour_filter.md) |
| Filters bottom sheet — mobile UX overhaul (search/typeahead, pinned recents/favourites, possibly tabbed Groups \| Flow \| Platform \| Sort). Overlaps Mobbin #5–#7; may be absorbed into that overhaul rather than landing standalone | [`parked_mobile_filters_bottom_sheet`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_mobile_filters_bottom_sheet.md) |
| Performance program — Linear-style speedups: IndexedDB cache for catalogue list (A), SW precache (B), lazy chunks for lightbox/Tegaki/admin (C), inlined app shell + localStorage boot restore (D). Sequence A → C → D → B across 2–3 sessions, each with a Lighthouse baseline. Don't bundle in one PR | [`parked_perf_linear_techniques`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_perf_linear_techniques.md) |
| HIG whole-app rollout — pilot landed on WhatsNew + Toast. Codify HIG spacing/type/radius as `_tokens.scss`, then apply surface-by-surface across ~10 PRs (header → cards → lightbox → settings → modals → login → group detail → team → studio → videos). Tokens-first PR has zero visual diff | [`parked_hig_whole_app_rollout`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_hig_whole_app_rollout.md) |
| Name-based group onboarding — first-run shows groups whose names start with each letter of the user's name (Rahul → R, A, U, L). Delight feature; needs fallbacks for missing letters / no name / duplicate letters | [`parked_name_based_group_onboarding`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_name_based_group_onboarding.md) |
| Video timestamp comments — pin comments to specific moments in a video. **Blocked** by current X-embed approach (Twitter widgets don't expose player state); requires moving to self-hosted video first | [`parked_video_timestamp_comments`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_video_timestamp_comments.md) |
| Telegram as video storage — **not recommended.** Supabase Storage already wired, gives signed URLs + RLS + backups. Telegram adds rate limits, weak privacy on `file_id`s, external dependency. Filed for the record only | [`parked_telegram_video_storage`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_telegram_video_storage.md) |
| Crop UI: "pieces detach" animation on confirm (Part B of the crop UI polish) — split image into 4 rims, animate each outward with rotate + opacity over ~350ms, then settle the kept area. Trial-only — needs shift-to-skip + `prefers-reduced-motion` fallback before merge. Risk: theatre cost on repeat use | [`parked_crop_dotted_lines_and_detach_animation`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_crop_dotted_lines_and_detach_animation.md) |
| Toast rework — consolidate 4 separate surfaces (Toast / AppUpdateToast / members section status / auth bokeh) into one primitive with shared variants, placement, animation, stacking, accessibility. Today the mosaic effect had to be duplicated across two SCSS files because no shared component exists | [`parked_toast_rework`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_toast_rework.md) |

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
| #157 + #158 | Save + Trash micro-animations (floppy / bin corner-docked, with linger) | Replaces the legacy parabolic save-to-Saved fly |
| #154 | Videos: per-video tags + multi-select filter strip + Sort dropdown + delete modal + minus icon | — |
| #152 | Share page (single mode): per-comment public flag + comments tile + lightbox toggle | — |
| #151 | Main-page scrollbar: trim indigo (5px) | — |
| #149 + #150 | Toast mosaic: fade fix + close-icon bumps + blur-left/sharp-right gradient on app-update toast | — |
| #148 | What's New: runtime JSON loader (no rebuild for content) + initial toast mosaic | — |
| #147 | UI Element from annotation drift fixes + `T` scroll-to-top shortcut | **`T` scroll-to-top shortcut** |
| #146 | Quick Upload: Paste-from-clipboard target | Base of [`parked_paste_toggle_and_dropzone_height`](../../../.claude/projects/-Users-yamparalarahul-Desktop-Personal-Apps-AgentUX-Catalogue/memory/parked_paste_toggle_and_dropzone_height.md) (iOS-opt-in toggle still parked) |
| #145 | UI Element from annotation: tag while annotating + filter exposure | — |
| #144 | Filter pills: show on all viewports + add Clear all | — |
| #142 | Lightbox annotation composer tidy | — |
| #141 | App-update toast: top-right on desktop, gradient stripe + mosaic | **App-update toast** (base feature) |
| #140 | PWA: safe-area inset on header + inline boot orb | — |
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
