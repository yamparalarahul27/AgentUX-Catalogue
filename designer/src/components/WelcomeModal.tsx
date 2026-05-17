// WelcomeModal
//
// One-shot welcome shown the very first time a user logs in. Detection
// piggybacks on `user_passcodes.last_login_at`: auth-login captures the
// pre-update value and returns `is_first_login`; redeemPasscode() drops
// a sessionStorage flag (WELCOME_FLAG) that this component reads on mount.
//
// The handwriting loops through GREETINGS, one word at a time. English
// uses bundled Caveat; Hindi uses bundled Tillana. Kannada, Malayalam, and
// Telugu use bundles generated via the Tegaki web tool and dropped in
// designer/src/assets/tegaki-fonts/. All non-Latin scripts need the
// harfbuzz shaper for conjuncts (e.g. "स्व", "ಸ್ವ", "സ്വ") — registered
// once globally.
//
// Companion code:
//   - supabase/functions/auth-login/index.ts    (server-side flag)
//   - designer/src/lib/auth-passcode.ts         (WELCOME_FLAG, setter)
//   - designer/src/assets/tegaki-fonts/*        (generated font bundles)

import { useEffect, useState } from 'react';

import type { TegakiBundle } from 'tegaki';
import { TegakiRenderer } from 'tegaki/react';
import { TegakiEngine } from 'tegaki/core';
import harfbuzzShaper from 'tegaki/shaper-harfbuzz';
import caveat from 'tegaki/fonts/caveat';
import tillana from 'tegaki/fonts/tillana';
import balooTamma2 from '../assets/tegaki-fonts/baloo-tamma-2/bundle';
import balooChettan2 from '../assets/tegaki-fonts/baloo-chettan-2/bundle';
import mandali from '../assets/tegaki-fonts/mandali/bundle';

import { WELCOME_FLAG } from '../lib/auth-passcode';

const HOLD_MS = 1500;
const FADE_MS = 350;

// All non-Latin greetings need harfbuzz so conjuncts (स्व / ಸ್ವ / സ്വ)
// render as joined glyphs instead of loose codepoints. Register once
// globally — the shaper is lazy-loaded behind a wasm boundary, so the
// first non-Latin word in the rotation may re-shape after the wasm
// resolves.
let shaperRegistered = false;
function ensureShaperRegistered() {
  if (shaperRegistered) return;
  TegakiEngine.registerShaper(harfbuzzShaper);
  shaperRegistered = true;
}

interface Greeting {
  text: string;
  font: TegakiBundle;
  lang: string;
}

// Tegaki's bundled font modules are exported with `as const`, which
// narrows them per-bundle and clashes with the wider TegakiBundle
// interface the renderer accepts. The cast is a one-time type-only
// widening — the runtime shape is what the renderer expects.
const asBundle = (b: unknown) => b as TegakiBundle;

const GREETINGS: Greeting[] = [
  { text: 'Welcome',  font: asBundle(caveat),         lang: 'en' },
  { text: 'ಸ್ವಾಗತ',    font: asBundle(balooTamma2),    lang: 'kn' },
  { text: 'സ്വാഗതം', font: asBundle(balooChettan2),  lang: 'ml' },
  { text: 'స్వాగతం', font: asBundle(mandali),        lang: 'te' },
  { text: 'स्वागत',    font: asBundle(tillana),        lang: 'hi' },
];

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const [fading, setFading] = useState(false);

  // Detect the first-login flag. Read once + clear immediately so a
  // refresh during the modal's lifetime doesn't replay it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(WELCOME_FLAG) !== '1') return;
    window.sessionStorage.removeItem(WELCOME_FLAG);
    ensureShaperRegistered();
    setOpen(true);
  }, []);

  // ESC to close.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // After draw completes: hold → fade → swap to next word. useEffect so
  // unmount / re-render cleans up the pending timers automatically.
  useEffect(() => {
    if (!open || !drawn) return undefined;
    const fadeT = window.setTimeout(() => setFading(true), HOLD_MS);
    const swapT = window.setTimeout(() => {
      setIndex((i) => (i + 1) % GREETINGS.length);
      setDrawn(false);
      setFading(false);
    }, HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(swapT);
    };
  }, [open, drawn]);

  if (!open) return null;

  const greeting = GREETINGS[index];

  return (
    <div
      className="welcome-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      onClick={() => setOpen(false)}
    >
      <div className="welcome-modal__card" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="welcome-modal__close"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ×
        </button>

        <div
          id="welcome-modal-title"
          className={`welcome-modal__handwriting${fading ? ' welcome-modal__handwriting--fading' : ''}`}
          aria-label={`Welcome (${greeting.lang})`}
        >
          <TegakiRenderer
            key={`${index}-${greeting.lang}`}
            font={greeting.font}
            text={greeting.text}
            onComplete={() => setDrawn(true)}
          />
        </div>

        <p className="welcome-modal__subtitle">
          As a Design Engineer, references are my foundation.{' '}
          <a href="https://mobbin.com" target="_blank" rel="noreferrer">Mobbin</a>{' '}
          doesn't cover every niche — so I built AgentUX Catalogue. A place for
          you and me to share references in Web3 Fintech.
        </p>

        <button
          type="button"
          className="welcome-modal__cta"
          onClick={() => setOpen(false)}
          autoFocus
        >
          Explore →
        </button>
      </div>
    </div>
  );
}
