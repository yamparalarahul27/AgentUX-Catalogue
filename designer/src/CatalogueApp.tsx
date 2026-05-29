import { Agentation } from 'agentation';
import { Route, Routes } from 'react-router-dom';

import { useAuth } from './lib/useAuth';
import { Catalogue } from './components/Catalogue';
import { CatalogueGroupDetail } from './components/CatalogueGroupDetail';
import { CatalogueNotFound } from './components/CatalogueNotFound';
import { ChangelogPage } from './components/ChangelogPage';
import { PasscodeLogin } from './components/PasscodeLogin';
import { SaveTrashAnimationProvider } from './components/SaveTrashAnimation';
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

  // Render a neutral dark backdrop while `getSession()` resolves so a
  // slow first response doesn't briefly paint the login screen for
  // users who actually have a persisted session. Sits as a stable
  // shell on top of the body background until useAuth flips.
  if (loading) {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0a0a0c',
          zIndex: 0,
        }}
      />
    );
  }

  if (!user) {
    return (
      <>
        <PasscodeLogin />
        {import.meta.env.DEV && <Agentation />}
      </>
    );
  }

  return (
    <SaveTrashAnimationProvider>
      <Routes>
        <Route
          path="/"
          element={(
            <Catalogue
              user={user}
              onLogout={logout}
              onLogoutEverywhere={logoutEverywhere}
            />
          )}
        />
        <Route
          path="/g/:groupKey"
          element={(
            <CatalogueGroupDetail
              user={user}
              onLogout={logout}
              onLogoutEverywhere={logoutEverywhere}
            />
          )}
        />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route
          path="*"
          element={(
            <CatalogueNotFound
              user={user}
              onLogout={logout}
              onLogoutEverywhere={logoutEverywhere}
            />
          )}
        />
      </Routes>
      <WelcomeModal />
      {import.meta.env.DEV && <Agentation />}
    </SaveTrashAnimationProvider>
  );
}
