# Working agreement

## Collaboration

- Before any non-trivial change (new deps, new files, architecture, security-sensitive code, "cleanup"), **stop and propose**. Wait for explicit approval.
- Never take autonomous decisions on design, path / folder structure, or dependencies.
- Give 2–3 options with a recommendation — not a single pre-decided path.
- When in doubt, ask.

## UI changes need ASCII first

For any UI/UX change beyond a one-line tweak, sketch the proposed layout in ASCII and get sign-off **before writing code**. Skip only for pure typography/color tweaks or restoring an existing spec.

Why: silent visual decisions burn time. ASCII forces a shared mental model before code.

## Behavioral rules

**1. Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them. If a simpler approach exists, say so. If unclear, stop and ask.

**2. Simplicity first.** Minimum code that solves the problem. No speculative features, no abstractions for single-use code, no flexibility/configurability that wasn't requested, no error handling for impossible scenarios. If 200 lines could be 50, rewrite. Ask "would a senior engineer call this overcomplicated?" — if yes, simplify.

**3. Surgical changes.** Touch only what you must. Don't "improve" adjacent code, formatting, or comments. Don't refactor what isn't broken. Match existing style even if you'd do it differently. Mention unrelated dead code — don't delete. Remove orphans your changes created; leave pre-existing dead code alone unless asked. Test: every changed line should trace directly to the user's request.

**4. Goal-driven execution.** Transform tasks into verifiable goals. "Add validation" → "write tests for invalid inputs, then make them pass." "Fix the bug" → "write a test that reproduces it, then make it pass." Loop until verified.

**5. Verify before asserting.** Never reference a field, column, function, file, env var, or capability without first confirming it exists (grep / Read / schema lookup). Don't pattern-match from "a project like this usually has X" — check what *this* project actually has. If a name surfaces from memory or guesswork, treat it as a hypothesis and verify before mentioning it in a question, recommendation, or design. Saying "we have `foo_count` already" when no such field exists wastes a turn and degrades trust.

These bias toward caution over speed. For trivial tasks, use judgment.

## Project conventions

### File size

- 700 LOC cap for files under `src/`. Excludes generated files, tests, lockfiles, `*.d.ts`.
- Split by responsibility before a file hits the cap: extract hooks, components, utilities, types into their own files.
- Prefer colocation over deep nesting — types near usage, helpers near callers.
- Vendored third-party code is exempt.

### Markdown / docs

- When writing `.md` files (PR bodies, memory files, backlog entries, design docs), reach for **inline HTML** when it makes the information clearer than what raw Markdown can express. Markdown renderers all support a useful subset of HTML inline.
- Reference: https://thariqs.github.io/html-effectiveness/ — examples of HTML constructs that meaningfully improve readability inside `.md` (callouts, nested tables, side-by-side columns, expandable `<details>` blocks, badge rows, etc.).
- Don't reach for HTML for the sake of it — only when the alternative (plain prose / a flat table / a long list) genuinely hurts scannability. The goal is the reader's mental load, not visual cleverness.
- Most useful in practice: `<details><summary>` for collapsible sections, `<sub>` / `<sup>` for terse annotations, side-by-side `<table>` for comparisons that a single column would obscure.

### Secrets & environment

- No hardcoded secrets, tokens, or API keys — ever. Enforced by `.claude/hooks/scan-secrets.js`.
- `.env*` files are never committed (`.gitignore` + deny-list in `.claude/settings.json`).
- API keys and service-role keys live on the server only. Never `NEXT_PUBLIC_*` for anything sensitive.
- Never log secret values, tokens, or wallet private material.
- Never include secret values in error responses, client payloads, or toast messages — return generic `{ error: "…" }`.
- No default credentials, example keys, or placeholder tokens. Use env-var reads that fail loudly on missing values in production.

## Pre-public-release security — done

The three items that were blocking a public link from `hirahul.xyz` have all shipped:

- **Auth gate (front door)** — closed by PR #78 (backend), #79 (PasscodeLogin), #80 (Members panel). No more self-asserted emails; users redeem a passcode minted via `auth-admin`.
- **RLS + storage (back door)** — closed by PR #81. Anon role can only SELECT non-deleted `screenshots` (for share pages); everything else is authenticated-only. Storage buckets locked down to authenticated writes.
- **Claude Code permissions** — `.claude/settings.json` has Read/Write/Edit denies mirrored across all sensitive paths, and `.claude/hooks/scan-secrets.js` redacts secret-shaped strings from Bash output before they enter context. Decision doc: [`docs/security-claude-permissions-public-release.md`](docs/security-claude-permissions-public-release.md).

The catalogue URL is safe to link publicly. If you change the auth model, the share-page anonymous-read policy on `screenshots`, or the deny list, surface those changes as security-sensitive before merging.
