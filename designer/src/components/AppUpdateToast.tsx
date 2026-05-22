import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

// Build-time identifier baked into the bundle by vite.config.ts.
// We compare against the live /designer/build-id.json on a polling
// interval; when they diverge, a new build has shipped and we
// surface the App-update toast.
declare const __BUILD_ID__: string;

const BUILD_ID_URL = '/designer/build-id.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min, the Linear-style cadence
const SNOOZE_MS = 30 * 60 * 1000; // 30 min when user picks "Later"
const SNOOZE_KEY = 'agentux:update-snoozed-until';
const DISMISSED_BUILD_KEY = 'agentux:update-dismissed-for';

interface AppUpdateToastProps {
  // Fired when the user clicks Refresh — gives the host a hook to
  // do anything before reloading (e.g. mark the What's New panel
  // to auto-open on the next load). The host MUST call
  // `window.location.reload()` itself (this component doesn't,
  // because the host may want to defer or animate first).
  onRefresh: () => void;
}

export function AppUpdateToast({ onRefresh }: AppUpdateToastProps) {
  const [stale, setStale] = useState(false);
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);
  const pollHandleRef = useRef<number | null>(null);

  // The actual freshness check — fetches the live build-id and
  // compares to the bundled constant. Skips if the user has
  // snoozed via "Later" or dismissed this exact build.
  const checkForUpdate = useCallback(async () => {
    try {
      const snoozedUntil = readSnoozeTimestamp();
      if (snoozedUntil && Date.now() < snoozedUntil) return;

      const response = await fetch(`${BUILD_ID_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { id?: unknown };
      if (typeof data?.id !== 'string') return;

      const dismissedBuildId = readDismissedBuildId();
      if (dismissedBuildId === data.id) return;

      if (data.id !== __BUILD_ID__) {
        setLatestBuildId(data.id);
        setStale(true);
      }
    } catch {
      // Network blip — silently retry next interval.
    }
  }, []);

  // Poll only while the tab is visible. Spending one fetch every
  // 5 min on inactive tabs would mostly be wasted; the visibility
  // listener also forces an immediate check the moment the user
  // tabs back, which is when freshness matters most.
  useEffect(() => {
    // Don't poll if the bundled build-id is empty (dev mode or
    // misconfigured) — comparison would be unstable.
    if (!__BUILD_ID__) return;

    function start() {
      if (pollHandleRef.current !== null) return;
      void checkForUpdate();
      pollHandleRef.current = window.setInterval(checkForUpdate, POLL_INTERVAL_MS);
    }
    function stop() {
      if (pollHandleRef.current === null) return;
      window.clearInterval(pollHandleRef.current);
      pollHandleRef.current = null;
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkForUpdate]);

  function handleRefresh() {
    onRefresh();
  }

  function handleLater() {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // Ignore quota / disabled storage.
    }
    setStale(false);
  }

  function handleDismiss() {
    if (latestBuildId) {
      try {
        window.localStorage.setItem(DISMISSED_BUILD_KEY, latestBuildId);
      } catch {
        // Ignore.
      }
    }
    setStale(false);
  }

  if (!stale) return null;

  return (
    <div className="app-update-toast" role="status" aria-live="polite">
      <span className="app-update-toast__icon" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <div className="app-update-toast__body">
        <p className="app-update-toast__title">A new version is available</p>
        <p className="app-update-toast__text">Refresh to get the latest fixes and features.</p>
        <div className="app-update-toast__actions">
          <button
            type="button"
            className="app-update-toast__primary"
            onClick={handleRefresh}
          >
            Refresh
          </button>
          <button
            type="button"
            className="app-update-toast__secondary"
            onClick={handleLater}
            title="Hide for 30 minutes"
          >
            Later
          </button>
        </div>
      </div>
      <button
        type="button"
        className="app-update-toast__close"
        onClick={handleDismiss}
        title="Dismiss for this build"
        aria-label="Dismiss"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function readSnoozeTimestamp(): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function readDismissedBuildId(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_BUILD_KEY);
  } catch {
    return null;
  }
}
