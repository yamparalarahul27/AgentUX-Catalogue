import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// 8×8 Bayer matrix for ordered dithering. Normalised to [0, 1] when
// compared against pixel brightness. Same pattern Mac Classic used for
// 1-bit gradient approximation. See https://en.wikipedia.org/wiki/Ordered_dithering.
const BAYER_8X8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// DitheredInteractive — Emil Kowalski's dithered-sphere pattern applied
// to text. Three steps:
//
//   1. **Sample**: render the glyphs to an offscreen canvas, walk every
//      cell in a grid, Bayer-threshold per cell against a vertical
//      brightness ramp. Each surviving cell becomes a dot with an
//      origin position.
//   2. **Simulate**: per frame, each dot gets a spring force toward its
//      origin + a cubic repulsion from the cursor (within hover radius)
//      + outward kicks from active shockwaves. Velocity is damped, then
//      integrated into position.
//   3. **Render**: clear canvas, draw every dot at its current position.
//
// Click anywhere on the canvas to drop a shockwave: a wavefront expands
// outward at constant speed, briefly displacing the dots it passes.
// Respects `prefers-reduced-motion` — falls back to a static render
// with no animation loop.
function DitheredInteractive({
  text,
  fontSize,
  fontWeight = 800,
  topBrightness = 1.0,
  bottomBrightness = 0.32,
  pixelSize = 2,
  color = '#fafafa',
  className,
  // Physics knobs — defaults tuned for the 404 surface.
  padding = 96,
  hoverRadius = 80,
  hoverStrength = 60,
  springK = 0.08,
  damping = 0.22,
  shockwaveSpeed = 360,         // px / second
  shockwaveWidth = 36,          // px — wavefront thickness
  shockwaveStrength = 28,
  shockwaveDurationMs = 900,
}: {
  text: string;
  fontSize: number;
  fontWeight?: number;
  topBrightness?: number;
  bottomBrightness?: number;
  pixelSize?: number;
  color?: string;
  className?: string;
  padding?: number;
  hoverRadius?: number;
  hoverStrength?: number;
  springK?: number;
  damping?: number;
  shockwaveSpeed?: number;
  shockwaveWidth?: number;
  shockwaveStrength?: number;
  shockwaveDurationMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const renderCtx = canvasEl.getContext('2d');
    if (!renderCtx) return;
    // Local non-null refs so closures below don't fight TS narrowing.
    const canvas = canvasEl;
    const ctx = renderCtx;

    const dpr = window.devicePixelRatio || 1;
    const font = `${fontWeight} ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;

    // Measure the text. Add padding so dots can travel outward (under
    // shockwave kick or hover push) without getting clipped.
    const measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return;
    measureCtx.font = font;
    const metrics = measureCtx.measureText(text);
    const textW = Math.ceil(metrics.width);
    const textH = Math.ceil(fontSize * 1.05);

    const width = textW + padding * 2;
    const height = textH + padding * 2;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Step 1: render glyphs offscreen, harvest the alpha mask.
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.font = font;
    offCtx.fillStyle = '#fff';
    offCtx.textBaseline = 'top';
    offCtx.fillText(text, padding, padding);
    const mask = offCtx.getImageData(0, 0, width, height).data;

    // Step 2: Bayer-sample → collect origin positions.
    const originsX: number[] = [];
    const originsY: number[] = [];
    const brightnessSpan = topBrightness - bottomBrightness;
    for (let y = padding; y < padding + textH; y += pixelSize) {
      const brightness = topBrightness - ((y - padding) / textH) * brightnessSpan;
      for (let x = padding; x < padding + textW; x += pixelSize) {
        const sampleX = Math.min(width - 1, x + Math.floor(pixelSize / 2));
        const sampleY = Math.min(height - 1, y + Math.floor(pixelSize / 2));
        const alpha = mask[(sampleY * width + sampleX) * 4 + 3];
        if (alpha < 128) continue;
        const tx = ((x - padding) / pixelSize) % 8 | 0;
        const ty = ((y - padding) / pixelSize) % 8 | 0;
        const threshold = BAYER_8X8[ty][tx] / 64;
        if (brightness > threshold) {
          originsX.push(x);
          originsY.push(y);
        }
      }
    }
    const count = originsX.length;

    // Step 3: typed-array physics state. Position seeds at origin —
    // entrance is a CSS fade on the canvas, not per-dot scatter.
    const ox = new Float32Array(originsX);
    const oy = new Float32Array(originsY);
    const px = new Float32Array(ox);
    const py = new Float32Array(oy);
    const vx = new Float32Array(count);
    const vy = new Float32Array(count);

    let mouseX = -9999;
    let mouseY = -9999;
    let mouseActive = false;
    interface Shockwave { x: number; y: number; start: number }
    const shockwaves: Shockwave[] = [];

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Static render (used for the no-animation fallback + as the
    // initial paint before rAF kicks in).
    function renderStatic() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        ctx.fillRect(ox[i], oy[i], pixelSize, pixelSize);
      }
    }

    if (reducedMotion) {
      renderStatic();
      return;
    }

    renderStatic();

    let rafId = 0;

    function frame(now: number) {
      // Cull expired shockwaves before the per-dot loop reads them.
      const cutoff = now - shockwaveDurationMs;
      while (shockwaves.length > 0 && shockwaves[0].start < cutoff) {
        shockwaves.shift();
      }

      const shockwaveCount = shockwaves.length;
      const hoverR2 = hoverRadius * hoverRadius;

      // Per-dot integrate.
      for (let i = 0; i < count; i++) {
        // Spring back to origin.
        let fx = (ox[i] - px[i]) * springK;
        let fy = (oy[i] - py[i]) * springK;

        // Cubic repulsion from the cursor when within hover radius.
        if (mouseActive) {
          const dx = px[i] - mouseX;
          const dy = py[i] - mouseY;
          const d2 = dx * dx + dy * dy;
          if (d2 < hoverR2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const norm = 1 - d / hoverRadius;
            const s = norm * norm * norm * hoverStrength;
            fx += (dx / d) * s;
            fy += (dy / d) * s;
          }
        }

        // Gaussian wavefront kicks. Each shockwave radius grows at a
        // fixed speed; dots within +/- shockwaveWidth of the front get
        // a brief outward impulse that fades with the wave's life.
        for (let s = 0; s < shockwaveCount; s++) {
          const sw = shockwaves[s];
          const age = (now - sw.start) / 1000;
          const radius = age * shockwaveSpeed;
          const dx = px[i] - sw.x;
          const dy = py[i] - sw.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 0.01) continue;
          const wfDist = Math.abs(d - radius);
          if (wfDist < shockwaveWidth) {
            const intensity = 1 - wfDist / shockwaveWidth;
            const life = 1 - (now - sw.start) / shockwaveDurationMs;
            const mag = intensity * intensity * life * shockwaveStrength;
            fx += (dx / d) * mag;
            fy += (dy / d) * mag;
          }
        }

        vx[i] = (vx[i] + fx) * (1 - damping);
        vy[i] = (vy[i] + fy) * (1 - damping);
        px[i] += vx[i];
        py[i] += vy[i];
      }

      // Render. Single batched draw via fillRect calls; for 5–15k dots
      // this is comfortably 60fps on modern hardware.
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        ctx.fillRect(px[i], py[i], pixelSize, pixelSize);
      }

      rafId = requestAnimationFrame(frame);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;
      mouseActive = true;
    }
    function onPointerLeave() {
      mouseActive = false;
    }
    function onPointerDown(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      shockwaves.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        start: performance.now(),
      });
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [
    text, fontSize, fontWeight, topBrightness, bottomBrightness, pixelSize, color, padding,
    hoverRadius, hoverStrength, springK, damping,
    shockwaveSpeed, shockwaveWidth, shockwaveStrength, shockwaveDurationMs,
  ]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import { CatalogueHeader } from './CatalogueHeader';

// Catch-all 404 surface — rendered when no other route in CatalogueApp
// matches. The auth gate sits above this in CatalogueApp, so we know the
// user is signed in. Pulls random group icons from the live appearance
// map so the suggestions look like part of the catalogue, not generic
// "did you mean…" copy. New random pick on every mount.

const SUGGESTION_COUNT = 7;
// Full arc-traversal duration. Each icon's CSS animationDelay is set to
// a negative slice of this so the icons appear pre-distributed along
// the path at mount. Must stay in sync with the `arcTravel` keyframe
// duration in catalogue-not-found.scss.
const ARC_DURATION_SEC = 22;

interface CatalogueNotFoundProps {
  user: User;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
}

interface SuggestionItem {
  key: string;
  label: string;
  iconUrl: string | null;
}

function pickRandomSuggestions(
  appearanceMap: ReturnType<typeof readCatalogueGroupAppearanceMap>,
  count: number,
): SuggestionItem[] {
  // Flatten every group key under GLOBAL_PROJECT_KEY (and any historical
  // scoped buckets) into a single pool of candidate suggestions.
  const seen = new Set<string>();
  const pool: { key: string; iconUrl: string | null; label: string }[] = [];
  for (const entries of Object.values(appearanceMap)) {
    for (const [key, entry] of Object.entries(entries)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (!entry.iconUrl) continue; // skip groups without an icon — looks bare
      pool.push({ key, iconUrl: entry.iconUrl, label: entry.label || key });
    }
  }
  // Fisher–Yates shuffle, take the first N. Fresh order on every mount.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function CatalogueNotFound({ user, onLogout, onLogoutEverywhere }: CatalogueNotFoundProps) {
  const navigate = useNavigate();
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);

  useEffect(() => {
    void ensureCatalogueGroupAppearanceLoaded(null);
    return subscribeCatalogueGroupAppearance(() => {
      setAppearanceMap(readCatalogueGroupAppearanceMap());
    });
  }, []);

  // Pick once on mount — re-shuffling on every render would jitter as the
  // appearance map subscription fires.
  const suggestions = useMemo(
    () => pickRandomSuggestions(appearanceMap, SUGGESTION_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="catalogue-page">
      <CatalogueHeader
        activeSection="catalogue"
        canAdmin={false}
        canLabelingStudio={false}
        onOpenSettings={() => { /* no-op on 404 */ }}
        onSectionChange={() => navigate('/')}
        userEmail={user.email ?? null}
        onSignIn={() => { /* signed in already */ }}
        onLogout={onLogout}
        onLogoutEverywhere={onLogoutEverywhere}
        myBookmarksActive={false}
        onToggleMyBookmarks={() => { /* no-op on 404 */ }}
      />

      <main className="catalogue-main catalogue-not-found">
        <div className="catalogue-not-found__number" aria-hidden="true">
          <DitheredInteractive
            text="404"
            fontSize={240}
            fontWeight={800}
            topBrightness={1.0}
            bottomBrightness={0.30}
            pixelSize={2}
            color="#fafafa"
            padding={48}
            hoverRadius={20}
            shockwaveStrength={12}
            shockwaveWidth={20}
            shockwaveDurationMs={550}
            className="catalogue-not-found__canvas"
          />
        </div>

        <button
          type="button"
          className="catalogue-not-found__back"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </button>

        <h1 className="catalogue-not-found__title">Not in the catalogue.</h1>
        <code className="catalogue-not-found__path">
          {typeof window !== 'undefined' ? window.location.pathname : ''}
        </code>

        {suggestions.length > 0 && (
          <div className="catalogue-not-found__suggestions">
            {suggestions.map((item, index) => {
              // Each icon traces a shared semi-circle via `offset-path`
              // (defined in CSS) and is staggered along it with
              // `animationDelay`. Delays are negative — that "pre-runs"
              // each icon's animation so they're already distributed
              // along the arc when the page mounts.
              const delaySeconds = -(index / suggestions.length) * ARC_DURATION_SEC;
              const appearance = resolveCatalogueGroupAppearance(appearanceMap, item.key, null);
              const label = appearance.label || item.label;
              return (
                <button
                  key={item.key}
                  type="button"
                  className="catalogue-not-found__suggestion"
                  style={{ animationDelay: `${delaySeconds}s` }}
                  title={label}
                  aria-label={label}
                  onClick={() => navigate(`/g/${encodeURIComponent(item.key.toLowerCase())}`)}
                >
                  <img src={appearance.iconUrl ?? ''} alt="" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
