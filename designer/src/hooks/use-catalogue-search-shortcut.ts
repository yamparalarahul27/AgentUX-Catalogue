import { useEffect } from 'react';

interface Args {
  enabled: boolean;
  onOpen: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

// Global keyboard shortcut to open the catalogue search modal.
// Bindings:
//   - Option+Space — user-requested binding. May collide with macOS
//     system shortcuts on some configurations.
//   - `/` — Mobbin-style trigger (also matches Slack, GitHub, X, etc).
//     Bare keypress with no modifiers; suppressed inside editable fields
//     so it doesn't interrupt typing a literal "/".
// (The ⌘K / Ctrl+K binding was removed 2026-05-29 — felt redundant
// alongside `/`, and freed up the shortcut for other uses if needed.)
// Both remaining shortcuts are suppressed while an editable field is
// focused so they don't stomp on in-field typing or paste behaviour.
export function useCatalogueSearchShortcut({ enabled, onOpen }: Args) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      const isOptionSpace = event.altKey && event.code === 'Space';
      // Bare `/` — no modifiers. Reject if any modifier is held so we
      // don't intercept things like ⌘? or shifted-slash combinations
      // that other handlers may bind.
      const isSlash =
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      if (!isOptionSpace && !isSlash) return;
      event.preventDefault();
      onOpen();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpen]);
}
