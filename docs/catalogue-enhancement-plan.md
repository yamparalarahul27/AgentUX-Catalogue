# Catalogue — Feature Roadmap & Research

Single source of truth for all Catalogue feature planning, research, and decisions.

---

## 1. Video Support

### Problem
Add video support to Catalogue. Supabase free tier (1 GB storage, 2 GB bandwidth/month) makes direct video storage impractical.

### Storage Comparison

| Content type | Typical size | Fits in 1 GB |
|-------------|-------------|--------------|
| Screenshot (WebP) | 50-200 KB | 5,000+ |
| 15s recording | 5-15 MB | 50-100 |
| 1 min clip | 20-50 MB | 20-50 |

### Services Evaluated

| Service | Free Tier | Fit |
|---------|-----------|-----|
| **Cloudflare R2** | 10 GB, zero egress | Best self-hosted |
| **Cloudflare Stream** | $5/mo for 1000 min | Best UX, paid |
| **Bunny.net** | ~$0.01/GB | Great budget option |
| **YouTube** | Free but re-encodes, no upload API, content policy risks | Not suitable |

### Decision: Phased approach
- **Phase 1**: External URL (paste Loom/Drive/mp4 link). Zero cost. Add `video_url` text field to screenshots table.
- **Phase 2**: Direct upload via Cloudflare R2 when ready to scale.

### Schema (Phase 1)
```sql
ALTER TABLE screenshots ADD COLUMN video_url text;
```

### UI (Phase 1)
- Upload Modal: optional "Video URL" input
- Family Card: video badge when video_url exists
- Lightbox: image/video toggle

### Open Decisions
- [ ] Confirm Phase 1 approach
- [ ] Video per-variant or per-family?
- [ ] Accepted URL formats

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

## 3. Primary Group + Flow Comparison

### Problem
Need to set Crpko as primary product and compare its flows against competitors (Binance, Coinbase, etc.) to identify extra steps, missing screens, and flow differences.

### Existing Infrastructure (already in codebase)

| Piece | Status |
|-------|--------|
| `project.primary_group` | In DB + types + hook (hardcoded `null` at `use-catalogue-filters.ts:39`) |
| `project.vs_groups` | In DB + types + hook (hardcoded `[]` at `use-catalogue-filters.ts:40`) |
| `screenshot.sequence` | In DB + types (mostly unused) |
| `metadata.catalogue_flow_label` | Working |
| Group config UI | Built in toolbar (`showGroupConfig={false}` in Catalogue.tsx) |
| Sort by primary → vs groups | Already implemented in `useCatalogueFilters` |

### Activation Steps
1. Remove hardcoded `null`/`[]` in `useCatalogueFilters`
2. Set `showGroupConfig={true}` in `Catalogue.tsx`
3. Primary group gets badge, sorts first
4. Vs groups sort after primary

### Flow Comparison View

New view mode alongside grid/list/gallery:
```
BINANCE (Primary) — Deposit Flow — 4 steps
┌─────┐ → ┌─────┐ → ┌─────┐ → ┌─────┐
│  1  │   │  2  │   │  3  │   │  4  │
└─────┘   └─────┘   └─────┘   └─────┘

vs COINBASE — Deposit Flow — 3 steps (-1)
┌─────┐ → ┌─────┐ → ┌─────┐
│  1  │   │  2  │   │  3  │
└─────┘   └─────┘   └─────┘
           ↑ MISSING: Review step
```

### Screen Audit Dashboard (future)
- Per group: total screens, in flows, orphaned
- Per flow: step count, coverage across groups
- Quick actions: assign orphaned screens, mark as "not needed"

---

## Implementation Priority

| Step | Feature | Effort | Dependencies |
|------|---------|--------|-------------|
| 1 | Quick Upload Enhancement | Medium | None |
| 2 | Activate primary_group + vs_groups | Small | None |
| 3 | Flow comparison view | Large | Steps 1 + 2 |
| 4 | Screen audit dashboard | Medium | Step 3 |
| 5 | Video support (Phase 1) | Small | None |
