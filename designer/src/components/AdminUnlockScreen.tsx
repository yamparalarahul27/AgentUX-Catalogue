import { useState } from 'react';

import { callAdmin } from '../lib/auth-passcode';

// Inline unlock screen shared by the Members + Roles admin panels.
//
// Validates the admin passcode via a cheap `list` call (returns 401 if
// wrong), then hands the verified passcode to the parent via onUnlock —
// which lifts it into the shared useAdminUnlock state and persists to
// sessionStorage. Failed validation surfaces a localised error and
// leaves the parent's unlock state untouched.

interface AdminUnlockScreenProps {
  // Display copy specific to the section being unlocked. The unlock
  // logic is the same either way; only the wording differs.
  title: string;
  description: string;
  onUnlock: (passcode: string) => void;
}

export function AdminUnlockScreen({ title, description, onUnlock }: AdminUnlockScreenProps) {
  const [passcode, setPasscode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!passcode.trim()) return;
    setUnlocking(true);
    setError(null);
    const result = await callAdmin(passcode, 'list');
    setUnlocking(false);
    if (!result.ok) {
      setError(adminUnlockErrorMessage(result.code));
      return;
    }
    onUnlock(passcode);
  }

  return (
    <div className="catalogue-members">
      <div className="catalogue-members__unlock">
        <h3>{title}</h3>
        <p>{description}</p>
        <form onSubmit={handleSubmit} className="catalogue-members__unlock-form">
          <input
            className="auth-input"
            type="password"
            placeholder="Admin passcode"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            autoFocus
            disabled={unlocking}
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn auth-btn-primary" type="submit" disabled={unlocking}>
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}

function adminUnlockErrorMessage(code: string): string {
  switch (code) {
    case 'unauthorized':  return 'Wrong admin passcode.';
    case 'network':       return "Couldn't reach the server. Try again.";
    default:              return 'Something went wrong. Try again.';
  }
}
