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
//   - ⌘K / Ctrl+K — the web convention (Linear, GitHub, Slack, etc).
//   - Option+Space — user-requested binding. May collide with macOS
//     system shortcuts on some configurations.
// Both are suppressed while an editable field is focused so they don't
// stomp on in-field typing or paste behaviour.
export function useCatalogueSearchShortcut({ enabled, onOpen }: Args) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      const isMetaK = (event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K');
      const isOptionSpace = event.altKey && event.code === 'Space';
      if (!isMetaK && !isOptionSpace) return;
      event.preventDefault();
      onOpen();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpen]);
}
