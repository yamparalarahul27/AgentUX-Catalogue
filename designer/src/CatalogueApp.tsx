import { Agentation } from 'agentation';
import { lazy, Suspense, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

import { useAuth } from './lib/useAuth';
import { useGlobalClickSound } from './hooks/use-app-sounds';
import { useReloadOnReconnect } from './hooks/use-reload-on-reconnect';
import { Catalogue } from './components/Catalogue';
import { OfflineStatusIndicator } from './components/OfflineStatusIndicator';
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

// Neutral dark backdrop shown while a lazy route chunk resolves — colour
// aligned to the pre-React boot-screen background in catalogue.html so the
// hand-off between the two is invisible. (Earlier this rendered #0a0a0c,
// which was a single-frame off from the splash.)
const routeFallback = (
  <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: '#0f0f10', zIndex: 0 }} />
);

export function CatalogueApp() {
  // Decide once which surface to render. window.location.pathname is
  // stable within a single component instance (BrowserRouter updates
  // routes via the React tree, not by re-rendering CatalogueApp under
  // a new path), so this constant is safe to derive at the top.
  const isShare = typeof window !== 'undefined' && isSharePath(window.location.pathname);

  // All hooks called unconditionally — placed BEFORE any early return
  // so the hook count is stable across share / loading / unauthenticated /
  // authenticated render branches (Rules of Hooks; the cause of #223).
  //
  //   - useAuth subscribes to Supabase auth events. On the share path
  //     the returned user/loading aren't read; the subscription is one
  //     extra idle listener that unmounts cleanly with the component.
  //   - useGlobalClickSound attaches a document click listener — fine
  //     on the share surface too; playback is still gated by prefs.
  //   - useState(showWelcome) reads sessionStorage once via the lazy
  //     initializer so the value is frozen at first render. Share-page
  //     anonymous users never have WELCOME_FLAG set, so showWelcome is
  //     false there. WelcomeModal's own effect clears the flag on mount,
  //     so re-reading sessionStorage on every render would unmount the
  //     modal mid-sequence on the next parent re-render.
  const { user, loading, logout, logoutEverywhere } = useAuth();
  useGlobalClickSound();
  // When the network transitions back to 'online' after being offline /
  // unstable, force-refresh the catalogue full-scope so the user lands
  // on the latest data without manually reloading the tab.
  useReloadOnReconnect();
  const [showWelcome] = useState(
    () => typeof window !== 'undefined' && window.sessionStorage.getItem(WELCOME_FLAG) === '1',
  );

  // Public share view — bypasses the catalogue and auth gate entirely.
  // No session needed; only reads. Agentation feedback toolbar still
  // mounts in DEV so we can collect UI feedback on the share view too.
  // See lib/share-url.ts.
  if (isShare) {
    return (
      <Suspense fallback={routeFallback}>
        <SharePage />
        <OfflineStatusIndicator />
        {import.meta.env.DEV && <Agentation />}
      </Suspense>
    );
  }

  // Render a neutral dark backdrop while `getSession()` resolves so a
  // slow first response doesn't briefly paint the login screen for
  // users who actually have a persisted session. Sits as a stable
  // shell on top of the body background until useAuth flips.
  if (loading) {
    return (
      <>
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0a0a0c',
            zIndex: 0,
          }}
        />
        <OfflineStatusIndicator />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PasscodeLogin />
        <OfflineStatusIndicator />
        {import.meta.env.DEV && <Agentation />}
      </>
    );
  }

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
      <OfflineStatusIndicator />
      {import.meta.env.DEV && <Agentation />}
    </SaveTrashAnimationProvider>
  );
}
