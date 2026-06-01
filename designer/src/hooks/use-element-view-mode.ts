import { useCallback, useEffect, useState } from 'react';

export type ElementViewMode = 'full' | 'cropped';

const STORAGE_PREFIX = 'agentux:elements-view:';
const VIEW_CHANGE_EVENT = 'agentux:elements-view-change';

function readMode(scope: string): ElementViewMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + scope);
    return raw === 'cropped' ? 'cropped' : 'full';
  } catch {
    return 'full';
  }
}

function writeMode(scope: string, mode: ElementViewMode) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + scope, mode);
  } catch {
    /* private mode / quota — fall back to in-memory only */
  }
  window.dispatchEvent(new CustomEvent(VIEW_CHANGE_EVENT, { detail: { scope, mode } }));
}

// Per-page view mode pref for Elements surfaces. `scope` is the
// surface identifier — typically the route segment (e.g. 'browse' or
// 'detail:ui:primary-cta') so flipping one element's detail page to
// Cropped doesn't change every other page. Cross-tab + cross-mount
// sync via a CustomEvent so two mounted components on the same page
// stay in lockstep.
export function useElementViewMode(scope: string): [ElementViewMode, (next: ElementViewMode) => void] {
  const [mode, setMode] = useState<ElementViewMode>(() => readMode(scope));

  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ scope: string; mode: ElementViewMode }>).detail;
      if (!detail || detail.scope !== scope) return;
      setMode(detail.mode);
    }
    window.addEventListener(VIEW_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(VIEW_CHANGE_EVENT, onChange);
  }, [scope]);

  const setModeAndPersist = useCallback((next: ElementViewMode) => {
    setMode(next);
    writeMode(scope, next);
  }, [scope]);

  return [mode, setModeAndPersist];
}
