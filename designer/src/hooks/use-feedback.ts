import { useCallback } from 'react';
import { useWebHaptics } from 'web-haptics/react';

import { getHapticsEnabled, getSoundEnabled } from '../lib/feedback-prefs';
import { playSound, type SoundKey } from '../lib/feedback-sounds';

// Semantic feedback events → the CC0 sound clip + the web-haptics preset
// they fire. Haptic values are web-haptics' built-in preset names (resolved
// by trigger() at runtime). Sound and haptics are gated independently by the
// user's prefs, which are read fresh from localStorage on each fire() so the
// action hooks that call useFeedback() don't re-render when a pref toggles.
export type FeedbackEvent = 'save' | 'delete' | 'upload' | 'restore' | 'notify';

const FEEDBACK_MAP: Record<FeedbackEvent, { sound: SoundKey; haptic: string }> = {
  save: { sound: 'select', haptic: 'selection' },
  delete: { sound: 'minimize', haptic: 'error' },
  upload: { sound: 'success', haptic: 'success' },
  restore: { sound: 'maximize', haptic: 'light' },
  // M5 — fired when a new notification arrives via realtime INSERT in
  // useNotifications. Uses the `select` clip (same as save — small +
  // discreet, not celebratory) and a `light` haptic so phones buzz
  // softly without dominating attention.
  notify: { sound: 'select', haptic: 'light' },
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useFeedback() {
  const { trigger } = useWebHaptics();

  const fire = useCallback((event: FeedbackEvent) => {
    const mapping = FEEDBACK_MAP[event];
    if (!mapping) return;
    if (getSoundEnabled()) void playSound(mapping.sound);
    if (getHapticsEnabled() && !prefersReducedMotion()) {
      try {
        void trigger(mapping.haptic);
      } catch {
        /* unsupported / blocked — haptics are non-critical */
      }
    }
  }, [trigger]);

  return { fire };
}
