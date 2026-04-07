# Bulk Figma Webapp Capture Skill Prompt

Use this prompt to run authenticated multi-breakpoint captures into one Figma file.

## Reusable Prompt

```text
Capture this authenticated webapp into my Figma file as an ordered user journey.

App URL: <APP_URL>
Figma file key: <FIGMA_FILE_KEY>
Breakpoints: 1512, 720, 320

States to capture in order:
1) <STATE_1>
2) <STATE_2>
3) <STATE_3>
...

Rules:
- If login/challenge appears, pause and ask me to complete login, then resume.
- Keep previous captures; do not delete old frames.
- Move old/incorrect frames to Legacy/Archive sections.
- Name frames using UJ-## / EX-## conventions.
- Arrange sections as:
  01 Core Journey (UJ)
  02 Extended - Auth
  03 Extended - Orders & History
  04 Extended - Account & Wallet
  05 Extended - Product Areas
  90 Archive - Raw Captures
  99 Legacy (Reference Only)
- Validate tab accuracy (positions/history/wallet must match selected tab).
- Keep browser session open when I request KEEP_OPEN mode.

Deliverables:
- Figma organized by section and journey flow.
- A short run report with captured states, missing states, and fallback image-backed notes.
```

## Script Companion
Use with:
- `scripts/bulk_webapp_capture_template.cjs`
- `docs/bulk-figma-capture-sop.md`

## Example Run

```bash
URL=https://early.bulk.trade \
PROFILE_DIR=/tmp/bulk-trade-keepalive \
PAUSE_FOR_LOGIN=1 \
KEEP_OPEN=1 \
node scripts/bulk_webapp_capture_template.cjs
```
