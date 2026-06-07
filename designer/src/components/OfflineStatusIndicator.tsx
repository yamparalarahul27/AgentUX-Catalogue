import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';

import { useMutationQueueStatus } from '../hooks/use-mutation-queue';
import { useOnlineStatus } from '../hooks/use-online-status';

// Floating bottom-center pill that surfaces network + sync status. Five
// states cycle through the same DOM surface so we never get two
// overlapping pills saying conflicting things.
//
//   ① 🔴 You're offline          — persistent while offline
//   ② 🟡 Network unstable        — persistent while flaky
//   ③ 🟢 You're online           — transient, auto-fades
//   ④ ⟳  Syncing N changes      — persistent while queue > 0
//   ⑤ ✓  Synced all             — transient, auto-fades
//
// Precedence is: offline > unstable > syncing > online-toast >
// synced-toast > hidden. So if you're offline and have queued
// mutations, the pill says "You're offline" — the user understands
// the queue isn't draining yet for the obvious reason.

const ONLINE_TOAST_MS = 2000;

type DotVariant = 'offline' | 'unstable' | 'online' | 'syncing' | 'synced';

interface Visible {
  variant: DotVariant;
  label: string;
}

export function OfflineStatusIndicator() {
  const status = useOnlineStatus();
  const { offlineQueueSize, justDrained } = useMutationQueueStatus();
  const [onlineToast, setOnlineToast] = useState(false);
  const previousStatusRef = useRef(status);
  const pillRef = useRef<HTMLDivElement>(null);

  // Attention pulse — when the user scrolls to the very end of the
  // catalogue list while offline, briefly breathe the pill so they
  // notice "this is everything available offline; reconnect for more".
  // Imperative class toggle (rather than React state) keeps the
  // pulse cheap: no re-render per scroll event, and forcing reflow
  // between remove + add lets us re-fire the same keyframes on each
  // new scroll-to-bottom without remounting the pill.
  useEffect(() => {
    if (status !== 'offline') return;
    let atBottomActive = false;
    let pulseTimer: number | null = null;
    function onScroll() {
      const el = document.scrollingElement;
      if (!el) return;
      const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
      const atBottom = remaining <= 24;
      if (atBottom && !atBottomActive) {
        atBottomActive = true;
        const pill = pillRef.current;
        if (!pill) return;
        pill.classList.remove('is-pulsing');
        // Force reflow so the next class add restarts the animation.
        void pill.offsetWidth;
        pill.classList.add('is-pulsing');
        if (pulseTimer) window.clearTimeout(pulseTimer);
        // 2 cycles × 600ms + small buffer before clearing the class.
        pulseTimer = window.setTimeout(() => {
          pillRef.current?.classList.remove('is-pulsing');
          pulseTimer = null;
        }, 1300);
      } else if (!atBottom) {
        atBottomActive = false;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    // Check on mount too — if the user was already at the bottom when
    // they went offline, fire the pulse once so the cue isn't missed.
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (pulseTimer) window.clearTimeout(pulseTimer);
    };
  }, [status]);

  // When network flips from offline/unstable → online, surface the
  // transient "You're online" message for ONLINE_TOAST_MS, then hide.
  // A flip back to offline mid-toast cancels it cleanly.
  useEffect(() => {
    const prev = previousStatusRef.current;
    previousStatusRef.current = status;
    if (status === 'online' && (prev === 'offline' || prev === 'unstable')) {
      setOnlineToast(true);
      const timeout = setTimeout(() => setOnlineToast(false), ONLINE_TOAST_MS);
      return () => clearTimeout(timeout);
    }
    if (status !== 'online') setOnlineToast(false);
  }, [status]);

  // Syncing pill only surfaces when there are offline-enqueued mutations
  // still in flight — online round-trips drain in ~100ms and don't
  // deserve a toast. Same gating for the 'Synced all' transient.
  const visible: Visible | null = (() => {
    if (status === 'offline') return { variant: 'offline', label: "You're offline" };
    if (status === 'unstable') return { variant: 'unstable', label: 'Network unstable' };
    if (offlineQueueSize > 0) {
      return {
        variant: 'syncing',
        label: `Syncing ${offlineQueueSize} change${offlineQueueSize === 1 ? '' : 's'}`,
      };
    }
    if (justDrained) return { variant: 'synced', label: 'Synced all' };
    if (onlineToast) return { variant: 'online', label: "You're online" };
    return null;
  })();

  if (!visible) return null;

  // Spinning icon for syncing state; static dot for the others. The
  // synced state uses a check icon instead of a dot so the "done"
  // beat is visually distinct from the steady-state online pill.
  const showSpinner = visible.variant === 'syncing';
  const showCheck = visible.variant === 'synced';

  return (
    <div
      ref={pillRef}
      className={`offline-status offline-status--${visible.variant}`}
      role="status"
      aria-live="polite"
    >
      {showSpinner ? (
        <RefreshCw size={12} className="offline-status__spinner" aria-hidden="true" />
      ) : showCheck ? (
        <Check size={12} className="offline-status__check" aria-hidden="true" />
      ) : (
        <span className="offline-status__dot" aria-hidden="true" />
      )}
      <span className="offline-status__label">{visible.label}</span>
    </div>
  );
}
