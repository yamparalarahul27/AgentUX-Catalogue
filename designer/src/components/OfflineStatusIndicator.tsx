import { useEffect, useRef, useState } from 'react';

import { useOnlineStatus } from '../hooks/use-online-status';

// Floating bottom-right pill that surfaces the network status. Five
// visual states are designed; PR 1 wires three (offline / unstable /
// online-transient). PR 2 will add 'syncing' + 'synced' on top of the
// same component when the mutation queue lands.
//
//   ① 🔴 You're offline          — persistent
//   ② 🟡 Network unstable        — persistent
//   ③ 🟢 You're online           — transient, auto-fades after ONLINE_TOAST_MS
//   ④ ⟳  Syncing N changes      — persistent while queue > 0 (PR 2)
//   ⑤ ✓  Synced all             — transient, auto-fades (PR 2)
//
// The component is the single home for all these states so we never end
// up with two overlapping toasts saying conflicting things.

const ONLINE_TOAST_MS = 2000;

type Visible =
  | { kind: 'offline' }
  | { kind: 'unstable' }
  | { kind: 'online-toast' }
  | { kind: 'hidden' };

export function OfflineStatusIndicator() {
  const status = useOnlineStatus();
  const [onlineToast, setOnlineToast] = useState(false);
  const previousStatusRef = useRef(status);

  // When status flips from offline/unstable → online, surface the
  // transient "You're online" message for ONLINE_TOAST_MS, then hide.
  // A flip directly back to offline mid-toast cancels it cleanly.
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

  const visible: Visible =
    status === 'offline' ? { kind: 'offline' }
    : status === 'unstable' ? { kind: 'unstable' }
    : onlineToast ? { kind: 'online-toast' }
    : { kind: 'hidden' };

  if (visible.kind === 'hidden') return null;

  const { dotVariant, label } = (() => {
    switch (visible.kind) {
      case 'offline':
        return { dotVariant: 'offline' as const, label: "You're offline" };
      case 'unstable':
        return { dotVariant: 'unstable' as const, label: 'Network unstable' };
      case 'online-toast':
        return { dotVariant: 'online' as const, label: "You're online" };
    }
  })();

  return (
    <div
      className={`offline-status offline-status--${dotVariant}`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-status__dot" aria-hidden="true" />
      <span className="offline-status__label">{label}</span>
    </div>
  );
}
