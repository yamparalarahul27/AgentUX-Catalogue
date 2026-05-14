#!/usr/bin/env node
// scan-secrets.js — PostToolUse hook on Bash.
//
// Closes the "Bash bypass" hole in the .claude/settings.json deny list:
// Read/Write/Edit denies don't stop `cat .env`, `printenv`, `grep -r ...`,
// or any other shell command that surfaces secret values. This hook
// scans Bash tool output for known secret patterns and, if any match,
// emits a `block` decision so the output never enters Claude's context.
//
// Companion docs:
//   - docs/security-claude-permissions-public-release.md  (decision doc)
//   - CLAUDE.md  ("Secrets & environment" section)
//
// Wired in .claude/settings.json under `hooks.PostToolUse`.
//
// Patterns are intentionally specific (well-known prefixes / formats)
// to keep false positives low. Adding a new one: pick a prefix or
// format that's unique enough to avoid hitting normal code or docs.

const PATTERNS = [
  // JWT-shaped strings (Supabase service-role key, anon key, GitHub
  // OIDC, Firebase, etc.). Three base64url segments separated by dots.
  { name: 'jwt', regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },

  // Stripe secret / publishable keys.
  { name: 'stripe-key', regex: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/ },

  // GitHub personal access tokens & OAuth tokens.
  { name: 'github-token', regex: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82})\b/ },

  // Google API keys.
  { name: 'google-api-key', regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/ },

  // Telegram bot tokens (BotFather format).
  { name: 'telegram-bot-token', regex: /\b\d{8,}:[A-Za-z0-9_-]{35}\b/ },

  // AWS access key IDs (the secret half is harder to pattern-match
  // reliably — relying on the access key ID to flag the pair).
  { name: 'aws-access-key', regex: /\bAKIA[A-Z0-9]{16}\b/ },

  // PEM-encoded private key block (any flavour: RSA, EC, OPENSSH, etc.).
  { name: 'private-key-block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },

  // Project-specific env-var assignments. These hold non-JWT secrets
  // (admin passcode, webhook secret) that no generic pattern would
  // catch. Match KEY=value where value has at least 6 non-placeholder
  // chars (so `KEY=<your-value>` in docs doesn't trigger).
  {
    name: 'env-secret-assignment',
    regex: /\b(INVITE_ADMIN_PASSCODE|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*[A-Za-z0-9@#$%^&*+_./:!?=-]{6,}/i,
  },
];

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // If we can't parse the hook input, fail open — better than
    // breaking every Bash call when the hook contract changes.
    process.exit(0);
  }

  // PostToolUse payload shape: { tool_name, tool_input, tool_response }.
  // For Bash, tool_response may have `stdout`, `stderr`, or `output`.
  const response = payload.tool_response || {};
  const fields = [response.stdout, response.stderr, response.output, response.content]
    .filter((s) => typeof s === 'string' && s.length > 0);
  if (fields.length === 0) {
    process.exit(0);
  }
  const combined = fields.join('\n');

  const matched = PATTERNS
    .filter(({ regex }) => regex.test(combined))
    .map(({ name }) => name);

  if (matched.length === 0) {
    process.exit(0);
  }

  // Block the output. Claude sees only `reason` instead of the
  // secret-containing text.
  const decision = {
    decision: 'block',
    reason:
      `scan-secrets: Bash output suppressed — matched secret pattern(s): ${matched.join(', ')}. ` +
      'The actual values were NOT added to context. If you need the value, ask the user to paste it directly, ' +
      'or use a command that does not surface the secret.',
  };
  process.stdout.write(JSON.stringify(decision));
});