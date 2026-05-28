# Test suite — scoping doc

**Status:** awaiting your review on the UX scenarios section before I write any code or land any deps.

**Pinned by user 2026-05-28** after PR #185 dual-scope leak. Goal: every feature that lands going forward is verified by tests that exercise real state plumbing, not just isolated logic.

---

## Decisions already made

<table>
<tr><th>Decision</th><th>Choice</th><th>Why</th></tr>
<tr>
  <td>Test layers</td>
  <td><b>Vitest + RTL</b> for hooks/components, <b>Playwright</b> for E2E</td>
  <td>Hybrid pyramid: fast feedback at unit, real-browser coverage at the top. Unit-only would have missed the PR #185 leak.</td>
</tr>
<tr>
  <td>Fixture strategy</td>
  <td><b>Hybrid</b> — Vitest mocks supabase-js; Playwright hits a real <code>test-fixtures</code> workspace</td>
  <td>Mocks for speed in the unit layer; real backend for E2E so RLS, storage, and edge functions are actually exercised. Pure mocks would have let PR #185 through.</td>
</tr>
<tr>
  <td>First PR scope</td>
  <td>Harness + lightbox/image-action flow only</td>
  <td>Lock down the area we just regressed on. Auth, upload, share, group detail come in follow-up PRs.</td>
</tr>
</table>

---

## Proposed harness shape

### Deps to add

```
# unit / component
vitest                          ^2.x
@testing-library/react          ^16.x
@testing-library/user-event     ^14.x
@testing-library/jest-dom       ^6.x
jsdom                           ^25.x

# e2e
@playwright/test                ^1.4x
```

All as `devDependencies` in `designer/package.json`. No production-bundle impact.

### Directory layout

```
designer/
├── src/
│   ├── hooks/
│   │   ├── use-catalogue-image-actions.ts
│   │   └── use-catalogue-image-actions.test.ts        ← colocated unit tests
│   ├── components/
│   │   ├── CatalogueFamilyLightbox.tsx
│   │   └── CatalogueFamilyLightbox.test.tsx           ← colocated component tests
│   └── test-utils/
│       ├── setup.ts                                    ← jest-dom + global mocks
│       ├── mock-supabase.ts                            ← shared supabase mock factory
│       └── render.tsx                                  ← RTL render with providers
├── e2e/
│   ├── lightbox-crop.spec.ts                          ← Playwright specs (this PR)
│   ├── fixtures/
│   │   └── seed-screenshots.ts                         ← what the test workspace contains
│   └── playwright.config.ts
└── package.json                                        ← `test`, `test:watch`, `e2e` scripts
```

**Rationale for colocation:** matches the existing convention (no `__tests__` folder anywhere in the repo today). Test sits next to the file it tests; easier to spot when one is missing.

### CI

- Local: `npm run test` (Vitest watch-able), `npm run e2e` (Playwright).
- GitHub Actions in this PR: a new job that runs `npm run test` on every push. Playwright job comes in PR 2 once the test-fixtures Edge Function is deployed.
- No merge gating yet — we let it run in parallel to existing checks for the first week, then turn on gating once we trust it.

### Supabase test workspace

A one-time setup, NOT part of this PR's code:

1. New user `test-runner@agentux.fixtures` in the existing project (no separate Supabase project — saves cost + keeps RLS exercised against the real schema).
2. New passcode `TEST_PASSCODE_2026` minted via `auth-admin`, scoped to that user.
3. New Edge Function `reset-test-fixtures` that:
   - Deletes every row in `screenshots`, `screen_families`, `comments` where `user_id = <test-runner-id>`
   - Deletes that user's storage prefix
   - Re-inserts a fixed seed (3 families, 6 screenshots, 1 group, 1 flow) from a SQL file checked into the repo
4. Playwright `globalSetup` calls the reset function once per test run; individual specs assume the seed state.

**I will do all 4 steps before merging PR 1, but propose each one to you first.** The Edge Function in particular needs your eyes — it's a destructive operation gated to one user_id.

---

## First PR — what gets covered

### Unit (Vitest)

| Target | Test |
|---|---|
| `applyToBothScopes` | Updates both arrays when both setters present |
| `applyToBothScopes` | Falls back gracefully when `setFullScopeScreenshots` is undefined |
| `useCatalogueImageActions.handleCropFamilyImage` | Calls both setters with the new `image_url` and `storage_path` |
| `useCatalogueImageActions.handleReplaceImage` | Bumps `version_count`, updates both scopes |
| `useCatalogueImageActions.handleSetReference` / `handleRemoveReference` | Reference patch lands in both scopes |
| `useCatalogueFamilyActions.setFamilyScreenshotsPatch` | Group/flow/theme metadata lands in both scopes |
| `nextSheetState` / `initialSheetState` (lightbox sheet machine) | min ↔ full transitions, no mid state |

### Component (Vitest + RTL)

| Target | Test |
|---|---|
| `CatalogueFamilyLightbox` | When `screenshot.image_url` changes, `imageLoaded` resets and the thumbhash overlay re-renders |
| `CatalogueFamilyLightbox` | Sheet starts in `min`, grabber click → `full`, chevron rotates, comments visible |
| `CatalogueFamilyLightbox` | `is-crop` class on body hides comments on mobile viewport only |
| `CatalogueLightboxCrop` | Reset link disabled when nothing's trimmed; Apply button visible |

### E2E (Playwright)

> **This is the section where I most want your input.** Please read the scenarios below and add / edit / cut. Each scenario is one Playwright spec.

#### Scenario 1 — Crop flow keeps both scopes in sync

```
1. Log in as test-runner.
2. Click family card "TestFamily-A" → lightbox opens.
3. Note current image_url (read from <img src>).
4. Click Crop, drag the top handle down 100px, click Apply.
5. Wait for toast "Crop applied".
6. Assert: <img src> in lightbox has changed (new URL).
7. Close lightbox.
8. Re-open same family.
9. Assert: <img src> is the NEW URL (not the original) — this is the dual-scope regression check.
10. Reload the page (full SPA reload).
11. Open same family.
12. Assert: image still the cropped one.
```

#### Scenario 2 — Replace image bumps version

```
1. Log in.
2. Open lightbox for "TestFamily-A".
3. Click ⋮ → Replace image, pick a fixture PNG.
4. Wait for toast.
5. Assert: version count badge says "v2".
6. Re-open: still v2, new image visible.
```

#### Scenario 3 — Reference image set / remove

```
1. Log in, open lightbox.
2. Set a reference label + upload a reference image.
3. Assert: reference appears in the side panel.
4. Remove reference.
5. Assert: side panel reference slot is empty.
6. Reload, re-open: still empty (not stale).
```

#### Scenario 4 — Mobile lightbox sheet states

```
1. Log in on iPhone 14 viewport (390x844).
2. Open lightbox.
3. Assert: sheet is in `min` state (only mini action bar visible).
4. Click grabber chevron.
5. Assert: sheet expands to `full`, chevron rotated, comments + meta visible.
6. Click grabber again.
7. Assert: back to `min`.
8. Enter crop mode.
9. Assert: comments section hidden, bottom row shows Cancel / Preview / Apply.
```

#### Scenario 5 — Pixelated thumbhash placeholder fires on image change

```
1. Open lightbox for "TestFamily-A".
2. Crop and apply.
3. Within 100ms of Apply, screenshot the media area.
4. Assert: thumbhash overlay is visible (not fully transparent) — proves the imageLoaded reset path.
5. After 500ms, screenshot again.
6. Assert: thumbhash gone, new image visible.
```

> Scenario 5 is the trickiest — visual + timing-sensitive. May fall back to "assert overlay element exists with opacity > 0 at frame N" rather than pixel diff. Heads-up that this one might land as a soft assertion in PR 1 and get tightened in a follow-up.

---

## What you should review and respond on

1. **Scenarios above** — add any flow you'd actually do as a user that I missed. Edit wording where my mental model is off.
2. **Test passcode value** — `TEST_PASSCODE_2026` placeholder. You'll pick the real one when we mint it.
3. **Seed data** — happy with "3 families / 6 screenshots / 1 group / 1 flow" as the minimum? Or do you want a richer baseline (multiple groups, themes, web + mobile mix)?
4. **CI gating timing** — agree with "run in parallel for a week, then gate"? Or gate from day one?

Once you respond, I'll:
1. Write the Edge Function for fixture reset (propose first, then deploy).
2. Land the harness + unit tests + component tests in PR 1a (zero E2E yet — pure local).
3. Land the Playwright specs + CI job in PR 1b once the fixture reset is deployed.

Splitting the PR keeps each one reviewable.
