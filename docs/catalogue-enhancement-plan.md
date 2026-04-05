# Catalogue Enhancement Plan - Quick Upload + Flow Comparison

## Goal
Capture MVP screenshots for Crpko (primary) and competitors, organize them by flows, and compare flows side-by-side.

---

## File Naming Convention

```
{sequence}-{flow}-{screen-name}.png
```

| Part | Example | Purpose |
|------|---------|---------|
| `sequence` | `01`, `02`, `03` | Order within a flow (resets per flow) |
| `flow` | `deposit`, `withdraw`, `auth` | First word after sequence → becomes flow label |
| `screen-name` | `select-coin`, `review-details` | Rest of filename → becomes screen name |

### How the existing parser reads it

`03-deposit-review-details.png` →
- sequence: `3`
- group (→ flow label): `deposit`
- name: `Review Details`

### Example folder structure

```
📁 Crpko-Web-MVP/
├── 01-deposit-select-coin.png
├── 02-deposit-enter-amount.png
├── 03-deposit-review-details.png
├── 04-deposit-confirm-otp.png
├── 05-deposit-success.png
├── 01-withdraw-select-coin.png
├── 02-withdraw-enter-address.png
├── 03-withdraw-review.png
├── 04-withdraw-otp.png
├── 05-withdraw-success.png
├── 01-kyc-personal-info.png
├── 02-kyc-document-upload.png
├── 03-kyc-selfie.png
├── 04-kyc-pending.png
├── 01-trade-market-view.png
├── 02-trade-order-book.png
├── 03-trade-place-order.png
├── 01-auth-login.png
├── 02-auth-register.png
├── 03-auth-forgot-password.png
├── 01-settings-profile.png
├── 02-settings-security.png
└── 01-home-dashboard.png
```

Same filenames for mobile — batch settings change platform/preset/OS.

For competitors: same naming, different batch group.
```
📁 Binance-Web/
├── 01-deposit-select-coin.png
├── 02-deposit-network-select.png    ← extra step
├── 03-deposit-address.png
├── ...
```

---

## Batch Upload Settings (per folder upload)

| Setting | Crpko Web | Crpko Mobile | Competitor Web |
|---------|-----------|-------------|----------------|
| Group | Crpko | Crpko | Binance/Coinbase/etc |
| Platform | web | mobile | web |
| Preset | 1512 | — | 1512 |
| OS | — | ios | — |
| Theme | dark | dark | dark |

---

## Renaming Existing Screenshots

For already-uploaded screenshots that don't follow the naming convention, use **Claude Code** to bulk rename:

1. Export/download screenshots to a local folder
2. Prompt Claude Code:
   ```
   Look at all screenshots in ~/folder/. These are screens from a crypto 
   exchange app. Rename following: {sequence}-{flow}-{screen-name}.png
   Identify flow and screen from image content.
   ```
3. Claude Code reads images (multimodal), identifies screens, renames
4. Re-upload with Quick Upload using batch settings

Alternatively, provide a reference list of flows and screens to improve accuracy:
```
Flows and screens:
- deposit: select coin, enter amount, review, otp, success
- withdraw: select coin, address, review, confirm, success
- auth: login, register, forgot password
- kyc: personal info, document upload, selfie, pending
```

---

## Implementation Steps

### Step 1: Quick Upload Enhancement
- Add batch-level fields: group, platform, theme, preset/OS
- Map parsed filename `group` → `flow_label`
- All files in queue inherit batch settings
- Sequence auto-assigned from filename prefix

### Step 2: Activate primary_group + vs_groups
- Remove hardcoded `null` in useCatalogueFilters (line 39-40)
- Set `showGroupConfig={true}` in Catalogue.tsx
- UI: set Crpko as primary, add competitors as vs groups

### Step 3: Flow comparison view
- New view mode alongside grid/list/gallery
- Primary group flow on top, vs group flows below
- Same flow label → aligned side by side
- Step count diff, missing/extra screen markers

### Step 4: Screen audit dashboard
- Per group: total screens, screens in flows, orphaned
- Per flow: step count, coverage across groups
- Quick actions: assign orphaned screens, mark as "not needed"

---

## Data Model Notes

Already exists in codebase:
- `project.primary_group` — in DB + types + hook (hardcoded null)
- `project.vs_groups` — in DB + types + hook (hardcoded [])
- `screenshot.sequence` — in DB + types (mostly unused)
- `metadata.catalogue_flow_label` — working, used for flow tagging
- Group config UI — built in toolbar (hidden with showGroupConfig=false)
- Sort prioritizes primary_group first, then vs_groups — already implemented
