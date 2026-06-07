import { useEffect, useRef } from 'react';

import {
  getNetworkStatus,
  subscribeNetworkStatus,
} from '../lib/network-status';
import { invalidateCatalogueFullScopeCache } from './use-catalogue-full-scope';

// When the network transitions back to 'online' after being offline or
// unstable, force-refresh the catalogue full-scope cache so the user
// lands on the latest server data without manually reloading. The
// existing module + IndexedDB cache stays as the seed on next mount;
// this just kicks off the revalidation pass that would have happened
// at next page-visibility change anyway.
export function useReloadOnReconnect(): void {
  const previousRef = useRef(getNetworkStatus());
  useEffect(() => {
    return subscribeNetworkStatus((next) => {
      const prev = previousRef.current;
      previousRef.current = next;
      if (next === 'online' && (prev === 'offline' || prev === 'unstable')) {
        invalidateCatalogueFullScopeCache();
      }
    });
  }, []);
}
