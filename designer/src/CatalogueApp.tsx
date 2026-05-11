import { Agentation } from 'agentation';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './lib/useAuth';
import { Catalogue } from './components/Catalogue';
import { SharePage } from './components/SharePage';
import { isSharePath } from './lib/share-url';

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

  // Public share view — bypasses the catalogue entirely. No auth, no
  // catalogue chrome; only reads. See lib/share-url.ts.
  if (typeof window !== 'undefined' && isSharePath(window.location.pathname)) {
    return <SharePage />;
  }

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
