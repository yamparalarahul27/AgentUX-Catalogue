import { Agentation } from 'agentation';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './lib/useAuth';
import { Catalogue } from './components/Catalogue';

function createGuestUser(): User {
  return {
    id: 'guest-0000-0000-0000-000000000000',
    email: undefined,
    app_metadata: {},
    user_metadata: {},
    aud: 'guest',
    created_at: new Date(0).toISOString(),
  } as User;
}

export function CatalogueApp() {
  const { user, login, logout } = useAuth();
  const effectiveUser = user ?? createGuestUser();

  return (
    <>
      <Catalogue
        user={effectiveUser}
        isGuest={!user}
        onRequestLogin={login}
        onLogout={logout}
      />
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}
