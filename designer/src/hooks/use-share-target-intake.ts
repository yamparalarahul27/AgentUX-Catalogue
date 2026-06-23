import { useEffect, useRef } from 'react';

const SHARE_CACHE = 'share-target-v1';

interface Args {
  enabled: boolean;
  onFiles: (files: File[]) => void;
}

// Drains any image files stashed by share-target-sw.js into Quick Upload.
//
// After a Web Share Target POST, the service worker stores the shared blobs in
// the Cache API and redirects here with `?share-target=1`. On mount (once the
// user is authenticated and on the catalogue section) we read those blobs back,
// reconstruct File objects, clear the stash, strip the marker from the URL, and
// hand the files to `onFiles` — which feeds the existing Quick Upload queue.
//
// The cache is the source of truth, not the query param: if the user had to
// redeem a passcode first, the marker may be gone by the time Catalogue mounts,
// but the stashed files survive and are still picked up.
//
// `consumed` is claimed *synchronously* at the top of the effect so React
// StrictMode's double-invoke (dev) bails on the second pass — otherwise the
// first pass could delete the cached blobs and a `cancelled` guard would drop
// them before delivery. A fresh share always arrives via a full SW redirect
// navigation, which remounts the app and resets the ref, so consuming once per
// page load is correct.
export function useShareTargetIntake({ enabled, onFiles }: Args) {
  const consumed = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (consumed.current) return;
    if (typeof window === 'undefined' || !('caches' in window)) return;
    consumed.current = true;

    void (async () => {
      let cache: Cache;
      try {
        cache = await caches.open(SHARE_CACHE);
      } catch {
        return;
      }

      const keys = await cache.keys();
      if (keys.length === 0) return;

      const files: File[] = [];
      for (const key of keys) {
        const res = await cache.match(key);
        if (!res) continue;
        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get('x-share-filename') || 'shared-image');
        const type = blob.type || res.headers.get('content-type') || '';
        files.push(new File([blob], name, { type }));
      }

      // Clear the stash so a refresh doesn't re-open it.
      for (const key of keys) {
        await cache.delete(key);
      }

      // Strip ?share-target so a subsequent refresh is a normal load.
      const url = new URL(window.location.href);
      if (url.searchParams.has('share-target')) {
        url.searchParams.delete('share-target');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }

      if (files.length > 0) onFiles(files);
    })();
  }, [enabled, onFiles]);
}
