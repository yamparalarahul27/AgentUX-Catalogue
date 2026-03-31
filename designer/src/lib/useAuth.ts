import { useState } from 'react';
import type { User } from '@supabase/supabase-js';

const STORAGE_KEY = 'agentux-designer-email';

function createMockUser(email: string): User {
  const hash = Array.from(email).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const id = `${hex}-0000-0000-0000-000000000000`;

  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}

export function useAuth() {
  const [email, setEmail] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  function login(newEmail: string) {
    localStorage.setItem(STORAGE_KEY, newEmail);
    setEmail(newEmail);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setEmail(null);
  }

  const user = email ? createMockUser(email) : null;

  return { user, login, logout };
}
