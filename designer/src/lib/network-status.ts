// Process-wide network status tracker. Combines two signals:
//
//   1. `navigator.onLine` + `online`/`offline` events — the browser's
//      built-in coarse detection. Reliable for "is the radio on" but
//      reports `true` even when DNS resolves nothing.
//
//   2. Real Supabase fetch outcomes — every supabase.from(), .functions
//      .invoke(), and .storage call routes through a wrapped fetch in
//      lib/supabase.ts that pings reportFetchFailure / reportFetchSuccess.
//      Two failures inside a 30s window while navigator says we're online
//      flips status to 'unstable'.
//
// Why both: navigator.onLine alone misses captive portals, DNS failures,
// and "the wifi joined but the router has no upstream". Real fetch
// outcomes catch those, but they need the browser-event layer to flip
// back to 'online' the moment the radio reconnects (before the next
// supabase call even fires).

export type NetworkStatus = 'offline' | 'unstable' | 'online';

const FAILURE_WINDOW_MS = 30_000;
const FAILURE_THRESHOLD = 2;

let recentFailureTimestamps: number[] = [];
const subscribers = new Set<(status: NetworkStatus) => void>();
let lastReportedStatus: NetworkStatus = computeStatus();

function pruneOldFailures() {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  recentFailureTimestamps = recentFailureTimestamps.filter((ts) => ts > cutoff);
}

function computeStatus(): NetworkStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  pruneOldFailures();
  if (recentFailureTimestamps.length >= FAILURE_THRESHOLD) return 'unstable';
  return 'online';
}

function emitIfChanged() {
  const next = computeStatus();
  if (next === lastReportedStatus) return;
  lastReportedStatus = next;
  // If we just went back to 'online', clear the failure window so a stale
  // unstable counter doesn't immediately re-trip us.
  if (next === 'online') recentFailureTimestamps = [];
  for (const listener of subscribers) listener(next);
}

export function reportFetchFailure(): void {
  recentFailureTimestamps.push(Date.now());
  emitIfChanged();
}

export function reportFetchSuccess(): void {
  pruneOldFailures();
  emitIfChanged();
}

export function getNetworkStatus(): NetworkStatus {
  return computeStatus();
}

export function subscribeNetworkStatus(
  listener: (status: NetworkStatus) => void,
): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', emitIfChanged);
  window.addEventListener('offline', emitIfChanged);
}
