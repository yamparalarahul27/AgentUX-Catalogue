// useAdminUnlock
//
// Holds the admin passcode + unlocked flag for the Members + Roles
// admin panels. Persists to sessionStorage (tab-lifetime, cleared on
// tab close). Never localStorage — the original Members panel comment
// captures the rationale: this is a UX cache, not a security boundary,
// because the auth-admin Edge Function re-validates the passcode on
// every action. Stale passcodes self-recover via the onUnauthorized
// callback wired into the children.
//
// Companion code:
//   - components/AdminUnlockScreen.tsx
//   - components/CatalogueTeamSection.tsx (consumer)
//   - components/CatalogueMembersSection.tsx (consumer)
//   - components/CatalogueRolesSection.tsx (consumer)

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'agentux:admin-passcode';

function readStored(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Storage can throw in private-mode / disabled-storage contexts;
    // fall back to in-memory only.
    return '';
  }
}

function writeStored(value: string) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same — fall back to in-memory only.
  }
}

export interface AdminUnlockState {
  adminPasscode: string;
  unlocked: boolean;
  unlock: (passcode: string) => void;
  clearUnlock: () => void;
}

export function useAdminUnlock(): AdminUnlockState {
  const [adminPasscode, setAdminPasscode] = useState<string>(readStored);
  const [unlocked, setUnlocked] = useState<boolean>(() => readStored().length > 0);

  const unlock = useCallback((passcode: string) => {
    setAdminPasscode(passcode);
    setUnlocked(true);
    writeStored(passcode);
  }, []);

  const clearUnlock = useCallback(() => {
    setAdminPasscode('');
    setUnlocked(false);
    writeStored('');
  }, []);

  return { adminPasscode, unlocked, unlock, clearUnlock };
}
