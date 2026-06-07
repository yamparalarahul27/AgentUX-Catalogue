import { useEffect, useState } from 'react';

import {
  getOfflineQueueSize,
  subscribeQueueDrained,
  subscribeQueueSize,
} from '../lib/mutation-queue';

// Re-renders when the offline-enqueued queue size changes. Quick online
// round-trips (enqueue → 1ms → replay → 0) don't touch this number, so
// the indicator stays silent during normal use and only surfaces while
// genuine offline work is in flight.
//
// The drained flag fires briefly when an offline-flagged drain
// completes — the indicator uses it to surface the transient
// "Synced all" pill.
export function useMutationQueueStatus(): {
  offlineQueueSize: number;
  justDrained: boolean;
} {
  const [offlineQueueSize, setOfflineQueueSize] = useState<number>(getOfflineQueueSize);
  const [justDrained, setJustDrained] = useState(false);

  useEffect(() => {
    return subscribeQueueSize((_size, offlineSize) => {
      setOfflineQueueSize(offlineSize);
    });
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeQueueDrained(() => {
      setJustDrained(true);
      if (timeoutId) clearTimeout(timeoutId);
      // 2.4s matches the offline-status "You're online" fade so the two
      // transient pills harmonise visually.
      timeoutId = setTimeout(() => setJustDrained(false), 2400);
    });
    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { offlineQueueSize, justDrained };
}
