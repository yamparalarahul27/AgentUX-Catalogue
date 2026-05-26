import { useEffect, useState } from 'react';

// Personal preference: render the new "Canvas" view when the user
// picks Gallery, instead of the existing DOM-based CatalogueGalleryView.
// Stored in localStorage, broadcast via a CustomEvent so the toggle
// in the account menu and the routing in Catalogue.tsx stay in sync
// without prop drilling. Mirrors the typing-keycap toggle pattern.
//
// Default is ON — canvas view ships enabled. Toggling off falls back
// to the existing gallery view with zero behaviour change.

const STORAGE_KEY = 'agentux:canvas-gallery-enabled';
const PREF_CHANGE_EVENT = 'agentux:canvas-gallery-pref-change';

export function getCanvasGalleryEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // null (never set) → on by default.
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

export function setCanvasGalleryEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

export function useCanvasGalleryEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(getCanvasGalleryEnabled);
  useEffect(() => {
    function refresh() { setEnabled(getCanvasGalleryEnabled()); }
    window.addEventListener(PREF_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PREF_CHANGE_EVENT, refresh);
  }, []);
  return [enabled, setCanvasGalleryEnabled];
}
