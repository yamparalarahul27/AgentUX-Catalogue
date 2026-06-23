// Share-target-only service worker (Web Share Target API).
//
// Scope is /designer/ (this file's location). It intercepts ONLY the POST to
// /designer/share-target — the `action` declared in manifest.webmanifest's
// `share_target`. It does NOT cache app assets or provide an offline shell;
// every other request passes straight through to the network untouched. This
// keeps it surgical and avoids the stale-cache pitfalls of a full PWA shell.
//
// Flow: an installed PWA (Android Chrome / desktop Chromium) shares image
// files here as multipart/form-data. We can't process a POST on a static host,
// so this SW reads the files, stashes their blobs in the Cache API, then
// 303-redirects the client to /designer/?share-target=1. The app drains the
// stash on mount (see hooks/use-share-target-intake.ts) into Quick Upload.
//
// iOS Safari does not support the Web Share Target API; this is a no-op there.

const SHARE_CACHE = 'share-target-v1';
const SHARE_ACTION = '/designer/share-target';
const REDIRECT_TO = '/designer/?share-target=1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === SHARE_ACTION) {
    event.respondWith(handleShare(event.request));
  }
  // Any other request: do not call respondWith — let the browser handle it
  // normally over the network. This SW adds no caching behaviour.
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll('images')
      .filter((value) => value instanceof File && value.size > 0);

    const cache = await caches.open(SHARE_CACHE);
    // Clear any prior stash so a fresh share never accumulates leftovers.
    for (const key of await cache.keys()) {
      await cache.delete(key);
    }

    let index = 0;
    for (const file of files) {
      const headers = new Headers();
      headers.set('content-type', file.type || 'application/octet-stream');
      headers.set('x-share-filename', encodeURIComponent(file.name || `shared-${index}`));
      await cache.put(
        new Request(`/designer/__shared/${index}`),
        new Response(file, { headers }),
      );
      index += 1;
    }
  } catch {
    // Non-fatal: fall through to the redirect. The app will simply find no
    // stashed files and open normally.
  }

  // 303 forces the follow-up navigation to be a GET, not a re-POST.
  return Response.redirect(REDIRECT_TO, 303);
}
