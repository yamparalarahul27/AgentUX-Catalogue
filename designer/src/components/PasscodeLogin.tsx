import { useEffect, useState } from 'react';

import { BokehBackdrop } from './BokehBackdrop';
import { redeemPasscode } from '../lib/auth-passcode';

// Full-page login screen. Submits (email, passcode) to auth-login via
// redeemPasscode(); on success the supabase client sees a real session
// and useAuth() flips the CatalogueApp gate. See docs §8.
export function PasscodeLogin() {
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while locked so the countdown stays live.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const lockedMs = lockedUntil ? new Date(lockedUntil).getTime() - now : 0;
  const isLocked = lockedMs > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || isLocked) return;
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPasscode = passcode.trim();
    if (!trimmedEmail || !trimmedPasscode) return;

    setSubmitting(true);
    setError(null);
    setLockedUntil(null);

    const result = await redeemPasscode(trimmedEmail, trimmedPasscode);
    if (result.ok) {
      // Push a fresh history entry so the user's first browser-back
      // after sign-in keeps them in the catalogue instead of leaving
      // the site. Without this, the form's mount didn't change the
      // URL, so back would still point at whatever was here before
      // they ever opened /designer/.
      try {
        window.history.pushState({}, '', window.location.href);
      } catch {
        // History API can throw in cross-origin / sandboxed contexts.
        // Failing silently is the right call — sign-in still succeeded.
      }
      // useAuth's onAuthStateChange listener flips the gate; nothing
      // more for this component to do.
      return;
    }

    setSubmitting(false);
    switch (result.code) {
      case 'invalid_credentials':
        setError('Email or passcode is wrong.');
        break;
      case 'disabled':
        setError('This account is disabled. Contact the admin.');
        break;
      case 'locked':
        setLockedUntil(result.retryAfter);
        break;
      case 'network':
        setError("Couldn't reach the server. Try again.");
        break;
      default:
        setError('Something went wrong. Try again.');
    }
  }

  return (
    <div className="auth-page">
      <BokehBackdrop />
      <div className="auth-card">
        <h1>AgentUX Catalogue</h1>

        <form className="auth-form passcode-login__form" onSubmit={handleSubmit}>
          <label className="passcode-login__label">
            Email
            <input
              className="auth-input"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting || isLocked}
              required
            />
          </label>

          <label className="passcode-login__label">
            Passcode
            <input
              className="auth-input passcode-login__passcode"
              type="password"
              autoComplete="current-password"
              placeholder="XXXX-XXXX-XXXX"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              disabled={submitting || isLocked}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}
          {isLocked && (
            <p className="auth-error">
              Too many attempts. Try again in {formatCountdown(lockedMs)}.
            </p>
          )}

          <button
            className="auth-btn auth-btn-primary"
            type="submit"
            disabled={submitting || isLocked}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="passcode-login__hint">
          Don't have a passcode? Ping{' '}
          <a
            className="passcode-login__hint-link"
            href="https://x.com/yamparalarahul1"
            target="_blank"
            rel="noopener noreferrer"
          >
            @yamparalarahul1&nbsp;→
          </a>
        </p>
      </div>
    </div>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
