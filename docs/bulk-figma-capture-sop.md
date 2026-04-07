# Bulk Webapp -> Figma Capture SOP

## 1) Objective
Capture authenticated webapp flows into one Figma file at:
- `1512px` (desktop)
- `720px` (tablet)
- `320px` (mobile)

Output is arranged as an understandable user journey with sections, while preserving previous runs.

## 2) What This Process Achieves
1. Works with auth-gated products (login/session required).
2. Captures critical product states (trade, order actions, wallet, account, history).
3. Produces a 3-breakpoint matrix for each state.
4. Organizes frames into clear Figma sections.
5. Keeps old captures in archive/legacy sections (no destructive cleanup).

## 3) Expected Deliverables
1. A single Figma file containing ordered journey sections.
2. Named frame set for each state (`1512`, `720`, `320`).
3. Archive of older captures for reference.
4. A run log (state x width x capture id x status).

## 4) Prerequisites
1. Figma file key (new or existing).
2. Valid app credentials (or demo funds if placing test orders).
3. Playwright + Chrome installed.
4. Figma MCP tools available:
   - `generate_figma_design`
   - `use_figma`
5. Capture template script available:
   - `scripts/bulk_webapp_capture_template.cjs`

## 5) Recommended Figma Section Taxonomy
Use this top-level structure for readability:
1. `01 Core Journey (UJ)`
2. `02 Extended - Auth`
3. `03 Extended - Orders & History`
4. `04 Extended - Account & Wallet`
5. `05 Extended - Product Areas`
6. `90 Archive - Raw Captures`
7. `99 Legacy (Reference Only)`

## 6) State Naming Convention
1. Core journey:
   - `UJ-01 Trade Screen - 1512px`
   - `UJ-01 Trade Screen - 720px`
   - `UJ-01 Trade Screen - 320px`
2. Extended states:
   - `EX-03 Open Orders - 1512px`
   - `EX-03 Open Orders - 720px`
   - `EX-03 Open Orders - 320px`

Rule: same state key across all 3 widths.

## 7) End-to-End Workflow

### Step A: Define Capture Matrix
Create an ordered table:
- `state_key`
- `state_name`
- `section_name`
- `width` (`1512|720|320`)
- `capture_id`

### Step B: Create/Reuse Capture IDs
For each `state x width`:
1. Call `generate_figma_design` in `existingFile` mode to create capture IDs.
2. Store capture IDs into the script mapping (`CAPTURE_IDS`).

### Step C: Run Browser Capture
1. Launch persistent profile (prevents repeated relogins).
2. Open app URL.
3. If anti-bot/challenge appears, pause for manual login.
4. For each state and width:
   - set viewport
   - navigate/prep UI state
   - inject capture hook
   - submit to mapped `captureId`

### Step D: Poll Import Completion
For each `captureId`:
1. Poll with `generate_figma_design` until `completed`.
2. Record imported Figma node IDs.

### Step E: Organize Canvas
1. Move nodes into target section.
2. Align rows by journey step.
3. Align columns by breakpoint order (`1512`, `720`, `320`).
4. Move older/incorrect frames to archive sections.

### Step F: Validate
1. Imported frame count matches expected `states x 3`.
2. Names follow convention.
3. Order is readable as a left-to-right, top-to-bottom flow.
4. Wallet/history/order tabs match intended active state.

## 8) Editability Expectations
1. Many trading/auth pages import as image-backed frames due to dynamic rendering and anti-bot layers.
2. Treat these as reliable visual references and annotation surfaces.
3. For truly layer-editable UI, recreate key screens manually in Figma from captured reference.

## 9) Reliability and Login Stability
1. Reuse a persistent profile directory.
2. Keep browser open between retries when possible.
3. If session expires, log in manually and resume script.
4. If profile lock occurs, close old browser process and relaunch using same profile.

## 10) Troubleshooting
1. `Failed to verify your browser / Code 21`
   - Manually complete challenge and login, then resume capture.
2. Missing capture hook
   - Re-inject `capture.js` and retry state.
3. Wrong tab/state captured
   - Add explicit UI prep steps before `submitCapture`.
4. Frames appear uncategorized
   - Run sectioning/layout pass in Figma and revalidate counts.

## 11) Definition of Done
- [ ] All target states captured at `1512`, `720`, `320`
- [ ] Imports completed for every capture ID
- [ ] Frames arranged by section and journey order
- [ ] Legacy/raw captures preserved in archive sections
- [ ] Naming standardized (`UJ-*` / `EX-*`)
- [ ] Team can re-run from script + SOP without tribal knowledge

## 12) Re-run Notes
1. Never delete legacy unless explicitly requested.
2. Append new run output into the same section system.
3. If replacing a bad frame, move old one to `99 Legacy` instead of removing it.
