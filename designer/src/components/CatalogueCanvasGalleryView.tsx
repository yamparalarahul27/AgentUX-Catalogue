import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';

// Canvas Gallery view — DOM-based infinite pan over a tiled wallpaper
// of screenshot thumbnails. Mockup spec preserved at
// `docs/mockups/mockup-2026-05-26-canvas-gallery.html`.
//
// Behaviour:
//   - Pan with drag (mouse) or 2-finger trackpad swipe (wheel).
//     Browser pinch-zoom is suppressed; this is a pan-only canvas.
//   - 9 tiles render at any moment in a 3×3 block re-anchored to the
//     camera so the grid feels infinite without virtualisation.
//   - Density A / M / C resizes cells live (2 / 4 / 8 per viewport row).
//   - Click a cell → onSelectFamily(familyId); parent opens the
//     existing lightbox.
//   - Enter loader plays on mount; exit loader plays before
//     onExit fires (~1.4 s hold while the canvas tears down).

interface CatalogueCanvasGalleryViewProps {
  families: CatalogueFamilyView[];
  activeVariantKeys: Record<string, string>;
  onSelectFamily: (familyId: string) => void;
  onExit: () => void;
}

type Density = 'atom' | 'molecule' | 'compound';

const DENSITY_PRESETS: Record<Density, { w: number; h: number }> = {
  atom: { w: 640, h: 400 },
  molecule: { w: 320, h: 200 },
  compound: { w: 170, h: 106 },
};

const GAP = 18;
const SEAM_GAP = 56;
const COLS = 5;
const ROWS = 4;
const LOADER_HOLD_MS = 1400;
// Cap items per tile so an account with thousands of screen families
// doesn't put thousands of <img> elements per tile (× 9 tiles). The
// pan/loop trick already gives the illusion of more — this is a perf
// floor, not a content limit.
const MAX_ITEMS_PER_TILE = 60;

type LoaderState = 'enter' | 'exit' | 'idle';

export function CatalogueCanvasGalleryView({
  families,
  activeVariantKeys,
  onSelectFamily,
  onExit,
}: CatalogueCanvasGalleryViewProps) {
  const [density, setDensity] = useState<Density>('compound');
  const [loaderState, setLoaderState] = useState<LoaderState>('enter');

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Pan state lives in a ref — rAF inertia tick mutates it 60×/s; using
  // useState would trigger a re-render per frame.
  const panRef = useRef({
    panX: 0,
    panY: 0,
    velX: 0,
    velY: 0,
    isPointerDown: false,
    dragMoved: false,
    startPointerX: 0,
    startPointerY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const { w: cellW, h: cellH } = DENSITY_PRESETS[density];
  const tileContentW = cellW * COLS + GAP * (COLS - 1);
  const tileContentH = cellH * ROWS + GAP * (ROWS - 1);
  const tileW = tileContentW + SEAM_GAP;
  const tileH = tileContentH;

  // Items rendered per tile. Always the same set so the wallpaper
  // loops cleanly across tile copies.
  const tileItems = useMemo(() => {
    const cells: { familyId: string; name: string; imageUrl: string }[] = [];
    for (const family of families) {
      if (cells.length >= MAX_ITEMS_PER_TILE) break;
      const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
      const url = variant?.screenshot?.image_url;
      if (!url) continue;
      cells.push({ familyId: family.id, name: family.name, imageUrl: url });
    }
    return cells;
  }, [families, activeVariantKeys]);

  // Apply pan transforms to the canvas + reposition the 9 tiles around
  // the camera. Centre tile index = round(pan / tile). Each tile's
  // world position = (centre + offset) × tile dimensions.
  const applyTransforms = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY } = panRef.current;
    const cx = Math.round(panX / tileW);
    const cy = Math.round(panY / tileH);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const idx = j * 3 + i;
        const tile = tileRefs.current[idx];
        if (!tile) continue;
        const tx = (cx + i - 1) * tileW;
        const ty = (cy + j - 1) * tileH;
        tile.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      }
    }
    canvas.style.transform = `translate3d(${-panX}px, ${-panY}px, 0)`;
  }, [tileW, tileH]);

  // Apply once whenever geometry changes (density swap).
  useEffect(() => {
    applyTransforms();
  }, [applyTransforms]);

  // Inertia tick — runs every frame; only does work when there's
  // residual velocity from a drag-end. Wheel pan doesn't add velocity
  // (the OS already emits decaying wheel events for momentum).
  useEffect(() => {
    let raf = 0;
    function tick() {
      const state = panRef.current;
      if (!state.isPointerDown && (Math.abs(state.velX) > 0.05 || Math.abs(state.velY) > 0.05)) {
        state.panX += state.velX;
        state.panY += state.velY;
        state.velX *= 0.92;
        state.velY *= 0.92;
        applyTransforms();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyTransforms]);

  // Pointer handlers — pointer capture intentionally avoided so the
  // browser still synthesises `click` on the cell. We track drag-vs-
  // click via a 4 px movement threshold.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onPointerDown(event: PointerEvent) {
      const state = panRef.current;
      state.isPointerDown = true;
      state.dragMoved = false;
      state.startPointerX = event.clientX;
      state.startPointerY = event.clientY;
      state.startPanX = state.panX;
      state.startPanY = state.panY;
      state.velX = 0;
      state.velY = 0;
    }
    function onPointerMove(event: PointerEvent) {
      const state = panRef.current;
      if (!state.isPointerDown) return;
      const dx = event.clientX - state.startPointerX;
      const dy = event.clientY - state.startPointerY;
      if (!state.dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        state.dragMoved = true;
        stage?.classList.add('is-dragging');
      }
      if (state.dragMoved) {
        const prevPanX = state.panX;
        const prevPanY = state.panY;
        state.panX = state.startPanX - dx;
        state.panY = state.startPanY - dy;
        state.velX = state.panX - prevPanX;
        state.velY = state.panY - prevPanY;
        applyTransforms();
      }
    }
    function onPointerEnd() {
      const state = panRef.current;
      if (!state.isPointerDown) return;
      state.isPointerDown = false;
      stage?.classList.remove('is-dragging');
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey) return; // pinch-zoom gesture — ignore
      const state = panRef.current;
      state.velX = 0;
      state.velY = 0;
      state.panX += event.deltaX;
      state.panY += event.deltaY;
      applyTransforms();
    }

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerEnd);
    stage.addEventListener('pointercancel', onPointerEnd);
    stage.addEventListener('pointerleave', onPointerEnd);
    stage.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerEnd);
      stage.removeEventListener('pointercancel', onPointerEnd);
      stage.removeEventListener('pointerleave', onPointerEnd);
      stage.removeEventListener('wheel', onWheel);
    };
  }, [applyTransforms]);

  // Cell click — delegated on the canvas. Skip if the press also moved
  // (treat as drag instead). `event.target.closest` walks up from the
  // <img> to the cell wrapper for the data attribute.
  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (panRef.current.dragMoved) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest('.canvas-gallery-cell');
    if (!cell) return;
    const familyId = (cell as HTMLElement).dataset.familyId;
    if (!familyId) return;
    cell.classList.add('is-flying');
    setTimeout(() => cell.classList.remove('is-flying'), 280);
    onSelectFamily(familyId);
  }

  // Enter loader on mount.
  useEffect(() => {
    setLoaderState('enter');
    const t = window.setTimeout(() => setLoaderState('idle'), LOADER_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  function handleExitClick() {
    setLoaderState('exit');
    window.setTimeout(() => onExit(), LOADER_HOLD_MS);
  }

  return (
    <>
      <div
        ref={stageRef}
        className="canvas-gallery canvas-gallery-stage"
        style={{
          // Inline CSS vars consumed by the tile grid — overrides the
          // base values declared in the stylesheet so density flips
          // are atomic + don't fight the cascade.
          '--canvas-cell-w': `${cellW}px`,
          '--canvas-cell-h': `${cellH}px`,
        } as React.CSSProperties}
        onClick={handleCanvasClick}
      >
        <div ref={canvasRef} className="canvas-gallery-canvas">
          {Array.from({ length: 9 }).map((_, t) => (
            <div
              key={t}
              ref={(el) => { tileRefs.current[t] = el; }}
              className="canvas-gallery-tile"
              style={{
                width: tileW,
                height: tileH,
                marginTop: -tileH / 2,
                marginLeft: -tileW / 2,
              }}
            >
              <div className="canvas-gallery-tile__seam">
                <span>Approaching end · hereafter it loops</span>
              </div>
              <div className="canvas-gallery-tile__inner">
                {tileItems.map((cell) => (
                  <div
                    key={cell.familyId}
                    className="canvas-gallery-cell"
                    data-family-id={cell.familyId}
                  >
                    <img src={cell.imageUrl} alt={cell.name} loading="lazy" draggable={false} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="canvas-gallery-bottom-row">
          <button
            type="button"
            className="canvas-gallery-exit"
            aria-label="Exit Canvas view"
            title="Exit Canvas view"
            onClick={handleExitClick}
          >
            ←
          </button>
          <div className="canvas-gallery-density" role="radiogroup" aria-label="Cell density">
            {(['atom', 'molecule', 'compound'] as const).map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={density === level}
                className={density === level ? 'is-active' : ''}
                title={`${level[0].toUpperCase()}${level.slice(1)} · ${level === 'atom' ? 2 : level === 'molecule' ? 4 : 8} per row`}
                aria-label={`${level[0].toUpperCase()}${level.slice(1)} — ${level === 'atom' ? 2 : level === 'molecule' ? 4 : 8} per row`}
                onClick={() => setDensity(level)}
              >
                {level[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loaderState !== 'idle' && (
        <div className="canvas-gallery-loader is-active" aria-hidden="true">
          <div className="canvas-gallery-loader__tiles">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="canvas-gallery-loader__tile" />
            ))}
          </div>
          <div className="canvas-gallery-loader__label">
            {loaderState === 'enter' ? 'Entering Gallery' : 'Exiting Gallery'}
          </div>
          <div className="canvas-gallery-loader__direction">
            {loaderState === 'enter' ? 'Preparing canvas …' : 'Restoring previous view …'}
          </div>
        </div>
      )}
    </>
  );
}
