import { Agentation } from 'agentation';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { useAuth } from './lib/useAuth';
import { useGlobalClickSound } from './hooks/use-app-sounds';
import { Catalogue } from './components/Catalogue';
import { PasscodeLogin } from './components/PasscodeLogin';
import { PullToRefresh } from './components/PullToRefresh';
import { SaveTrashAnimationProvider } from './components/SaveTrashAnimation';
import { WELCOME_FLAG } from './lib/auth-passcode';
import { isSharePath } from './lib/share-url';

// Code-splitting: only the landing catalogue and the auth gate ship in the
// initial bundle. Secondary routes load on navigation; the share view loads
// only on a share URL.
const CatalogueGroupDetail = lazy(() => import('./components/CatalogueGroupDetail').then((m) => ({ default: m.CatalogueGroupDetail })));
const CatalogueNotFound = lazy(() => import('./components/CatalogueNotFound').then((m) => ({ default: m.CatalogueNotFound })));
const ChangelogPage = lazy(() => import('./components/ChangelogPage').then((m) => ({ default: m.ChangelogPage })));
const ElementDetailPage = lazy(() => import('./components/ElementDetailPage').then((m) => ({ default: m.ElementDetailPage })));
const ElementsBrowsePage = lazy(() => import('./components/ElementsBrowsePage').then((m) => ({ default: m.ElementsBrowsePage })));
const SharePage = lazy(() => import('./components/SharePage').then((m) => ({ default: m.SharePage })));

// WelcomeModal statically pulls in the tegaki handwriting engine + harfbuzz
// wasm + font/glyph bundles — heavy, and shown only on first login. Split it
// out and mount it only when the first-login flag is present, so that weight
// never loads for everyone else.
const WelcomeModal = lazy(() => import('./components/WelcomeModal').then((m) => ({ default: m.WelcomeModal })));

// Neutral dark backdrop shown while a lazy route chunk resolves — matches the
// pre-mount boot backdrop so navigation doesn't flash white.
const routeFallback = (
  <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: '#0a0a0c', zIndex: 0 }} />
);

export function CatalogueApp() {
  // Public share view — bypasses the catalogue and auth gate entirely.
  // No session needed; only reads. Agentation feedback toolbar still
  // mounts in DEV so we can collect UI feedback on the share view too.
  // See lib/share-url.ts.
  if (typeof window !== 'undefined' && isSharePath(window.location.pathname)) {
    return (
      <Suspense fallback={routeFallback}>
        <SharePage />
        {import.meta.env.DEV && <Agentation />}
      </Suspense>
    );
  }

  const { user, loading, logout, logoutEverywhere } = useAuth();

  // Audio feedback: global click sound on interactive elements. Boot
  // chime is fired earlier from an inline script in catalogue.html — see
  // that script — so it syncs with the pre-React boot-screen splash
  // instead of waiting for auth + mount.
  useGlobalClickSound();

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

  // Only mount (and therefore download) the WelcomeModal chunk on the very
  // first login — peek at the flag here without consuming it; the modal's
  // own effect reads + clears it.
  const showWelcome =
    typeof window !== 'undefined' && window.sessionStorage.getItem(WELCOME_FLAG) === '1';

  return (
    <SaveTrashAnimationProvider>
      <PullToRefresh />
      <Suspense fallback={routeFallback}>
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
            path="/elements"
            element={(
              <ElementsBrowsePage
                user={user}
                onLogout={logout}
                onLogoutEverywhere={logoutEverywhere}
              />
            )}
          />
          <Route
            path="/elements/:kind/:slug"
            element={(
              <ElementDetailPage
                user={user}
                onLogout={logout}
                onLogoutEverywhere={logoutEverywhere}
              />
            )}
          />
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
      </Suspense>
      {showWelcome && (
        <Suspense fallback={null}>
          <WelcomeModal />
        </Suspense>
      )}
      {import.meta.env.DEV && <Agentation />}
    </SaveTrashAnimationProvider>
  );
}
