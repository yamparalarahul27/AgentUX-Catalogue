import { useEffect, useState } from 'react';

import {
  getNetworkStatus,
  subscribeNetworkStatus,
  type NetworkStatus,
} from '../lib/network-status';

// Reads the process-wide network status tracker. Re-renders on transition.
// Source of truth lives in lib/network-status.ts so non-React code (the
// Supabase fetch wrapper) can write to the same tracker without dragging
// React state through it.
export function useOnlineStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(getNetworkStatus);
  useEffect(() => {
    return subscribeNetworkStatus(setStatus);
  }, []);
  return status;
}
