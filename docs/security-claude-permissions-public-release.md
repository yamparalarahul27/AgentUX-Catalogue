# Security: Claude Code Permissions — Required Before Public Release

**Status:** Deferred. Tracked here for the public-release milestone alongside
[`security-rls-public-release.md`](security-rls-public-release.md).

This is a **decision document, not an implementation spec**. When we tackle
this, re-read it, confirm the chosen split (global vs project), then apply.

---

## Context

A baseline `permissions.deny` block was proposed for `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env*)",
      "Read(**/.dev.vars*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/secrets/**)",
      "Read(**/credentials/**)",
      "Read(**/.aws/**)",
      "Read(**/.ssh/**)",
      "Read(**/config/database.yml)",
      "Read(**/config/credentials.json)",
      "Read(**/.npmrc)",
      "Read(**/.pypirc)",
      "Write(**/.env*)",
      "Write(**/secrets/**)",
      "Write(**/.ssh/**)"
    ]
  }
}
```

Solid baseline, but as written it has three holes that make it less
protective than it looks. We already have [`.claude/hooks/scan-secrets.js`](../.claude/hooks/)
as a defense layer — this just tightens the deny list.

---

## Holes in the baseline

### 1. Bash bypass *(the big one)*

`Read`/`Write` deny rules don't stop the `Bash` tool. Claude can still run
`cat .env`, `grep -r "AWS_SECRET" .`, `head ~/.ssh/id_rsa` and the file
contents come right back into the conversation.

**Mitigation:** rely on `.claude/hooks/scan-secrets.js` to scan tool output
for secret patterns. The deny list is not load-bearing on its own here —
the hook is. Verify the hook covers the same patterns this list does.

### 2. `Edit` is not `Write`

`Edit` is a separate tool. `Write(**/.env*)` does **not** stop
`Edit(**/.env*)`. Claude could still modify `.env` via Edit.

**Fix:** mirror every `Write(...)` deny with an `Edit(...)` deny.

### 3. Read/Write asymmetry

The baseline denies `Read` on `*.pem`, `*.key`, `.aws/`, `.npmrc`, `.pypirc`
but allows `Write` on all of them. If Claude shouldn't read your AWS creds,
it shouldn't be able to overwrite them either.

**Fix:** mirror Read denies on the Write (and Edit) side for these paths.

---

## Additions

Common secret stores not in the baseline:

```
"Read(**/.git-credentials)",
"Read(**/.netrc)",
"Read(**/.kube/**)",
"Read(**/*.kubeconfig)",
"Read(**/.docker/config.json)",
"Read(**/.vercel/**)",            // relevant — Catalogue deploys to Vercel
"Read(**/serviceAccountKey*.json)",
"Read(**/firebase-adminsdk*.json)",
"Read(**/*.tfstate*)",            // Terraform state often holds secrets
"Read(**/.terraform/**)",
"Read(**/id_rsa*)",               // belt-and-suspenders with .ssh/**
"Read(**/id_ed25519*)",
"Read(**/.vault-token)",
```

`Read(**/config/database.yml)` is Rails-specific and inert in this repo.
Fine to keep for portability.

---

## Where it should live (recommended split)

- **Global (`~/.claude/settings.json`):** the universal stuff — `.ssh`,
  `.aws`, `*.pem`, `*.key`, `.git-credentials`, `.kube`, `.docker`,
  `id_rsa*`, `.netrc`, `.vault-token`, `.npmrc`, `.pypirc`. These never
  belong in any project, ever.
- **Project (`.claude/settings.json` for AgentUX-Catalogue):** the
  project-specific stuff — `.env*`, `.dev.vars*`, `.vercel/`, `secrets/`,
  `credentials/`, anything Catalogue-shaped.

Splitting means we don't re-paste the universal list into every repo, and
the project file stays focused on what's actually present in this tree.

---

## Recommendation

When tackling this:

1. Move universal denies to `~/.claude/settings.json` (one-time, benefits
   every project).
2. Apply the corrected project-level denies to
   `.claude/settings.json` — with `Read`, `Write`, **and** `Edit` mirrored
   for every path that holds secrets.
3. Audit `scan-secrets.js` to confirm it catches the patterns the deny
   list can't (Bash output, indirect reads).
4. Spot-check by asking Claude to read `.env` and verifying it's blocked.

---

## Open questions (answer before implementing)

- Is anyone else (teammates) using Claude Code in this repo? If yes, the
  project-level denies need to be checked into version control — the
  global ones are per-machine and won't transfer.
- Do we want `defaultMode: "acceptEdits"` style automation gated on this
  list being in place, or stay with manual approval?
- Any internal tooling that *legitimately* needs to read `.env` files
  (migration scripts, etc.)? If so, those exceptions need an `allow`
  carve-out or to run outside Claude.

---

## Out of scope for this doc

- Hook design / what `scan-secrets.js` should match (separate concern).
- Permission rules for **MCP tools** — those use a different syntax
  (`mcp__serverName__toolName`) and aren't covered here.
- The Bash allowlist (a positive list of permitted shell commands) is a
  separate hardening pass.
