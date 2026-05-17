import { Agentation } from 'agentation';

import { useAuth } from './lib/useAuth';
import { Catalogue } from './components/Catalogue';
import { PasscodeLogin } from './components/PasscodeLogin';
import { SharePage } from './components/SharePage';
import { WelcomeModal } from './components/WelcomeModal';
import { isSharePath } from './lib/share-url';

export function CatalogueApp() {
  // Public share view — bypasses the catalogue and auth gate entirely.
  // No session needed; only reads. Agentation feedback toolbar still
  // mounts in DEV so we can collect UI feedback on the share view too.
  // See lib/share-url.ts.
  if (typeof window !== 'undefined' && isSharePath(window.location.pathname)) {
    return (
      <>
        <SharePage />
        {import.meta.env.DEV && <Agentation />}
      </>
    );
  }

  const { user, loading, logout, logoutEverywhere } = useAuth();

  // Avoid flashing the login screen for users who already have a
  // persisted session in localStorage; getSession() resolves quickly.
  if (loading) return null;

  if (!user) return <PasscodeLogin />;

  return (
    <>
      <Catalogue user={user} onLogout={logout} onLogoutEverywhere={logoutEverywhere} />
      <WelcomeModal />
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}
