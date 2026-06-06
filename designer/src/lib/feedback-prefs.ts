import { useEffect, useState } from 'react';

// Independent feedback preferences that all feed useFeedback() and the
// global click-sound + boot-sound surfaces:
//   · sound effects   — master toggle for ALL audio. Default OFF (audio
//                       is intrusive, so opt-in).
//   · haptic feedback — default ON for touch devices, OFF for desktop.
//   · click sound     — fires on button / tab / link / role=button
//                       interactions. Sub-gate under sound effects.
//                       Default ON (when master is on).
//   · boot sound      — fires once on app mount as a welcome chime.
//                       Sub-gate under sound effects. Default ON.
// Stored in localStorage, broadcast via a CustomEvent so the account-menu
// toggles and the hook stay in sync without prop drilling. Mirrors the
// canvas-gallery / typing-keycap toggle pattern.

const SOUND_KEY = 'agentux:sound-enabled';
const HAPTICS_KEY = 'agentux:haptics-enabled';
const CLICK_SOUND_KEY = 'agentux:click-sound-enabled';
const BOOT_SOUND_KEY = 'agentux:boot-sound-enabled';
const PREF_CHANGE_EVENT = 'agentux:feedback-pref-change';

function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

export function getSoundEnabled(): boolean {
  try {
    // null (never set) → OFF by default.
    return window.localStorage.getItem(SOUND_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

export function getHapticsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(HAPTICS_KEY);
    // null (never set) → on for touch devices, off for desktop.
    return raw === null ? isTouchDevice() : raw === 'true';
  } catch {
    return false;
  }
}

export function setHapticsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(HAPTICS_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

function usePref(get: () => boolean, set: (next: boolean) => void): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(get);
  useEffect(() => {
    function refresh() { setValue(get()); }
    window.addEventListener(PREF_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PREF_CHANGE_EVENT, refresh);
  }, [get]);
  return [value, set];
}

export function useSoundEnabled(): [boolean, (next: boolean) => void] {
  return usePref(getSoundEnabled, setSoundEnabled);
}

export function useHapticsEnabled(): [boolean, (next: boolean) => void] {
  return usePref(getHapticsEnabled, setHapticsEnabled);
}

export function getClickSoundEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(CLICK_SOUND_KEY);
    // null (never set) → on by default. The master sound toggle still gates.
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

export function setClickSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(CLICK_SOUND_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

export function useClickSoundEnabled(): [boolean, (next: boolean) => void] {
  return usePref(getClickSoundEnabled, setClickSoundEnabled);
}

export function getBootSoundEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(BOOT_SOUND_KEY);
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

export function setBootSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(BOOT_SOUND_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

export function useBootSoundEnabled(): [boolean, (next: boolean) => void] {
  return usePref(getBootSoundEnabled, setBootSoundEnabled);
}
