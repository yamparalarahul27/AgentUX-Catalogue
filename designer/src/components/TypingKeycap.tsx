import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import clickSoundUrl from '../assets/sounds/keyb-click.mp3?url';

// Global on/off for the typing-feedback keycap (visual + sound).
// Toggled from the account menu; persisted to localStorage. The
// TypingKeycap reads this at press-time, so disabling stops further
// presses immediately without re-mounting the component.
const STORAGE_KEY = 'agentux:typing-keycap-enabled';
const PREF_CHANGE_EVENT = 'agentux:typing-keycap-pref-change';

export function getTypingKeycapEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setTypingKeycapEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch { /* swallow — private mode etc. */ }
  window.dispatchEvent(new CustomEvent(PREF_CHANGE_EVENT));
}

export function useTypingKeycapEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(getTypingKeycapEnabled);
  useEffect(() => {
    function refresh() { setEnabled(getTypingKeycapEnabled()); }
    window.addEventListener(PREF_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PREF_CHANGE_EVENT, refresh);
  }, []);
  return [enabled, setTypingKeycapEnabled];
}

// TypingKeycap — floating keycap that pops up at the bottom of the
// screen each time the user types a character. Visual modelled on
// keyb.himan.me's "classic" theme (slate trapezoid). Sound is a single
// ~120ms click extracted from keyb.himan.me's sound.ogg sprite.
//
// Mount near the input you want to feedback. Hold a ref, call
// `keycap.press(event.key)` from the input's keydown handler.

export interface TypingKeycapHandle {
  press: (key: string) => void;
}

interface Props {
  // Sound is delight-not-utility; default on but a parent can flip it
  // off if it ever needs to be silenced in context (e.g. share modal).
  soundEnabled?: boolean;
}

interface KeyDescriptor {
  label: string;
  variant: 'normal' | 'wide' | 'space';
}

function describeKey(key: string): KeyDescriptor {
  if (key === ' ') return { label: 'space', variant: 'space' };
  if (key === 'Enter') return { label: '↵', variant: 'normal' };
  if (key === 'Backspace') return { label: '⌫', variant: 'normal' };
  if (key === 'Tab') return { label: '⇥', variant: 'normal' };
  if (key === 'Escape') return { label: 'esc', variant: 'wide' };
  if (key === 'Shift') return { label: '⇧', variant: 'normal' };
  if (key === 'Meta') return { label: '⌘', variant: 'normal' };
  if (key === 'Alt') return { label: '⌥', variant: 'normal' };
  if (key === 'Control') return { label: '⌃', variant: 'normal' };
  if (key === 'CapsLock') return { label: 'caps', variant: 'wide' };
  if (key === 'ArrowUp') return { label: '↑', variant: 'normal' };
  if (key === 'ArrowDown') return { label: '↓', variant: 'normal' };
  if (key === 'ArrowLeft') return { label: '←', variant: 'normal' };
  if (key === 'ArrowRight') return { label: '→', variant: 'normal' };
  if (key.length === 1) return { label: key.toUpperCase(), variant: 'normal' };
  return { label: key.toLowerCase(), variant: 'wide' };
}

export const TypingKeycap = forwardRef<TypingKeycapHandle, Props>(function TypingKeycap(
  { soundEnabled = true },
  ref,
) {
  const [descriptor, setDescriptor] = useState<KeyDescriptor | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const idleTimerRef = useRef<number | null>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const decodingRef = useRef(false);

  // Web Audio API is far more reliable than <audio> for short clicks
  // on Safari. AudioContext can't be constructed before a user gesture
  // — keydown counts as one, so we lazy-init on first press.
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!audioBufferRef.current && !decodingRef.current) {
      decodingRef.current = true;
      fetch(clickSoundUrl)
        .then((response) => response.arrayBuffer())
        .then((buffer) => ctx.decodeAudioData(buffer))
        .then((decoded) => { audioBufferRef.current = decoded; })
        .catch(() => { /* decode failed — visual still works */ })
        .finally(() => { decodingRef.current = false; });
    }
    return ctx;
  }, []);

  const playClick = useCallback(() => {
    if (!soundEnabled) return;
    const ctx = ensureAudio();
    if (!ctx || !audioBufferRef.current) return;
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }, [ensureAudio, soundEnabled]);

  useImperativeHandle(ref, () => ({
    press: (key: string) => {
      if (!getTypingKeycapEnabled()) return;
      setDescriptor(describeKey(key));
      setIsActive(true);
      setIsPressed(true);

      if (pressedTimerRef.current !== null) window.clearTimeout(pressedTimerRef.current);
      pressedTimerRef.current = window.setTimeout(() => setIsPressed(false), 80);

      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setIsActive(false), 700);

      playClick();
    },
  }), [playClick]);

  useEffect(() => () => {
    if (pressedTimerRef.current !== null) window.clearTimeout(pressedTimerRef.current);
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
  }, []);

  if (!descriptor) return null;

  const variantClass = descriptor.variant === 'normal' ? '' : ` typing-keycap--${descriptor.variant}`;
  const stateClass = `${isActive ? ' is-active' : ''}${isPressed ? ' is-pressed' : ''}`;

  return createPortal(
    <div className="typing-keycap-stage" aria-hidden="true">
      <div className={`typing-keycap${variantClass}${stateClass}`}>
        <div className="typing-keycap__top">{descriptor.label}</div>
        <div className="typing-keycap__skirt typing-keycap__skirt--r" />
        <div className="typing-keycap__skirt typing-keycap__skirt--l" />
      </div>
    </div>,
    document.body,
  );
});
