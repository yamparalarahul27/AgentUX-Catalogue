import { useEffect } from 'react';

import {
  getClickSoundEnabled,
  getSoundEnabled,
} from '../lib/feedback-prefs';
import { playSound } from '../lib/feedback-sounds';

// Selector for elements that should emit a click sound. Limited to
// interactive roles so we don't fire on raw text/div containers — the
// catalogue has many divs with `onClick` that act as cards, those carry
// `role="button"` already where it matters. Anything outside this list
// (random text clicks, scroll-area clicks, etc.) stays silent.
const CLICK_TARGET_SELECTOR = [
  'button',
  'a',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="checkbox"]',
  '[role="link"]',
].join(', ');

// Add `data-no-click-sound` to any interactive ancestor to opt that
// subtree out of the click-sound feedback. Useful for surfaces that
// fire their own semantic sound on action completion (Save / Delete /
// Upload) so we don't double up.

// Document-level click listener. One pass through the SPA lifetime —
// fires `playSound('click')` on any qualifying interactive element. The
// prefs are read on every click so toggling the master / click switch
// takes effect immediately without a re-mount.
export function useGlobalClickSound() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!getSoundEnabled() || !getClickSoundEnabled()) return;
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      const interactive = target.closest<HTMLElement>(CLICK_TARGET_SELECTOR);
      if (!interactive) return;
      if (interactive.closest('[data-no-click-sound]')) return;
      if (interactive.matches('[disabled], [aria-disabled="true"]')) return;
      void playSound('click', 0.25);
    }
    // Capture phase so we run even if a handler downstream calls
    // stopPropagation — UX-wise the user pressed something interactive,
    // they should hear it regardless of how the component handles the click.
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
}
