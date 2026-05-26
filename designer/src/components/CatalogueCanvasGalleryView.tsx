import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';

// Canvas Gallery view — DOM-based pannable canvas with two phases:
//
//   Phase 1 · STREAMING
//     A single finite grid. Cols are density-driven (2 / 4 / 8). Rows
//     auto-grow as items are revealed in batches of 50. As the user
//     pans within ~1 viewport of the bottom edge of the loaded items,
//     the next 50 reveal in place with a blur-to-sharp fade-in.
//
//   Phase 2 · WALLPAPER  (after every filtered item has been revealed)
//     The fully-populated grid becomes a tile. 9 copies render in a
//     3×3 block that re-anchors to the camera, so the canvas repeats
//     infinitely in both directions. Seam markers appear at every
//     tile boundary — vertical on X axis, horizontal on Y axis.
//
// Spec discussion lives in conversation; mockup preserved at
// `docs/mockups/mockup-2026-05-26-canvas-gallery.html`.

interface CatalogueCanvasGalleryViewProps {
  families: CatalogueFamilyView[];
  activeVariantKeys: Record<string, string>;
  onSelectFamily: (familyId: string) => void;
  onExit: () => void;
}

type Density = 'atom' | 'molecule' | 'compound';
type LoaderState = 'enter' | 'exit' | 'idle';
type Phase = 'streaming' | 'wallpaper';

interface DensityPreset {
  w: number;
  h: number;
  cols: number;
}

// At density C (Compound) the user sees ~8 per row in viewport.
// First batch of 50 = ~7 rows. Trigger next batch when camera is one
// viewport away from the bottom edge of currently-loaded items.
const DENSITY_PRESETS: Record<Density, DensityPreset> = {
  atom:     { w: 640, h: 400, cols: 2 },
  molecule: { w: 320, h: 200, cols: 4 },
  compound: { w: 170, h: 106, cols: 8 },
};

const GAP = 18;
const SEAM_GAP = 56;
const LOADER_HOLD_MS = 1400;
const REVEAL_FADE_MS = 420;     // matches CSS animation duration + slack
const INITIAL_BATCH = 50;
const STREAM_INCREMENT = 50;

interface VisibleItem {
  familyId: string;
  name: string;
  imageUrl: string;
}

export function CatalogueCanvasGalleryView({
  families,
  activeVariantKeys,
  onSelectFamily,
  onExit,
}: CatalogueCanvasGalleryViewProps) {
  const [density, setDensity] = useState<Density>('compound');
  const [loadedCount, setLoadedCount] = useState<number>(INITIAL_BATCH);
  const [recentlyRevealed, setRecentlyRevealed] = useState<Set<string>>(() => new Set());
  const [loaderState, setLoaderState] = useState<LoaderState>('enter');

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const streamGridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevLoadedCountRef = useRef(INITIAL_BATCH);
  const prevFamiliesKeyRef = useRef<string>('');

  // Pan state in a ref so the inertia rAF tick can mutate it without
  // forcing a re-render every frame.
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

  const preset = DENSITY_PRESETS[density];
  const cellW = preset.w;
  const cellH = preset.h;
  const COLS = preset.cols;

  // Build the visible items list — first `loadedCount` families that
  // have a usable image url. We filter for url here because a family
  // without an active screenshot would render a broken empty cell.
  const visibleItems = useMemo<VisibleItem[]>(() => {
    const items: VisibleItem[] = [];
    const limit = Math.min(loadedCount, families.length);
    for (let i = 0; i < limit; i++) {
      const family = families[i];
      const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
      const url = variant?.screenshot?.image_url;
      if (!url) continue;
      items.push({ familyId: family.id, name: family.name, imageUrl: url });
    }
    return items;
  }, [families, loadedCount, activeVariantKeys]);

  const totalCount = families.length;
  const phase: Phase = loadedCount >= totalCount ? 'wallpaper' : 'streaming';

  // Grid geometry (the streaming grid, or one wallpaper tile's content).
  const rows = Math.max(1, Math.ceil(visibleItems.length / COLS));
  const gridContentW = COLS * cellW + (COLS - 1) * GAP;
  const gridContentH = rows * cellH + (rows - 1) * GAP;
  const tileW = gridContentW + SEAM_GAP;
  const tileH = gridContentH + SEAM_GAP;

  // ── Reset on filter / family-list change ─────────────
  // We key on family-id concatenation, NOT array identity, because
  // Catalogue.tsx rebuilds the families array on most state changes
  // even when the underlying ids are the same.
  const familiesKey = useMemo(
    () => families.map((f) => f.id).join('|'),
    [families],
  );
  useEffect(() => {
    if (familiesKey === prevFamiliesKeyRef.current) return;
    prevFamiliesKeyRef.current = familiesKey;
    setLoadedCount(INITIAL_BATCH);
    setRecentlyRevealed(new Set());
    prevLoadedCountRef.current = INITIAL_BATCH;
    // Snap back to origin so the user lands on the freshly-filtered
    // top of the grid, not stranded in empty space.
    panRef.current.panX = 0;
    panRef.current.panY = 0;
    panRef.current.velX = 0;
    panRef.current.velY = 0;
  }, [familiesKey]);

  // ── Blur-fade-in for newly revealed batches ─────────
  useEffect(() => {
    const prev = prevLoadedCountRef.current;
    if (loadedCount > prev) {
      const newIds = families
        .slice(prev, loadedCount)
        .map((f) => f.id);
      if (newIds.length > 0) {
        setRecentlyRevealed((current) => {
          const next = new Set(current);
          for (const id of newIds) next.add(id);
          return next;
        });
        const timer = window.setTimeout(() => {
          setRecentlyRevealed((current) => {
            const next = new Set(current);
            for (const id of newIds) next.delete(id);
            return next;
          });
        }, REVEAL_FADE_MS);
        prevLoadedCountRef.current = loadedCount;
        return () => window.clearTimeout(timer);
      }
    }
    prevLoadedCountRef.current = loadedCount;
  }, [loadedCount, families]);

  // ── Apply pan transforms (called on every state mutation) ─
  // Streaming phase: just one grid, anchored at origin (its centre at
  //                 (0, 0) in canvas coords).
  // Wallpaper phase: 9 tile copies in a 3×3 block re-anchored each
  //                 frame to the tile the camera is currently inside.
  const applyTransforms = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY } = panRef.current;
    canvas.style.transform = `translate3d(${-panX}px, ${-panY}px, 0)`;

    if (phase === 'wallpaper') {
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
    }
  }, [phase, tileW, tileH]);

  // ── Edge-load detection during streaming phase ──────
  // Grid is centred at (0, 0). Bottom edge of loaded items is at
  // `gridContentH / 2`. When the camera's bottom-of-viewport approaches
  // that line by less than one viewport height, reveal the next batch.
  const maybeLoadMore = useCallback(() => {
    if (phase !== 'streaming') return;
    if (loadedCount >= totalCount) return;
    const stage = stageRef.current;
    if (!stage) return;
    const viewportH = stage.clientHeight;
    if (viewportH === 0) return;
    const bottomEdge = gridContentH / 2;
    const cameraBottom = panRef.current.panY + viewportH / 2;
    if (cameraBottom > bottomEdge - viewportH) {
      setLoadedCount((current) => Math.min(current + STREAM_INCREMENT, totalCount));
    }
  }, [phase, loadedCount, totalCount, gridContentH]);

  // Initial paint + reapply on geometry / phase change.
  useEffect(() => {
    applyTransforms();
  }, [applyTransforms]);

  // Inertia rAF. Also probes the edge-load condition each frame so
  // streaming reveals trigger smoothly during momentum scroll.
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
        maybeLoadMore();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyTransforms, maybeLoadMore]);

  // Pointer + wheel handlers (no pointer capture so `click` still
  // synthesises on cells).
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
        maybeLoadMore();
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
      if (event.ctrlKey) return; // pinch-zoom — ignore
      const state = panRef.current;
      state.velX = 0;
      state.velY = 0;
      state.panX += event.deltaX;
      state.panY += event.deltaY;
      applyTransforms();
      maybeLoadMore();
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
  }, [applyTransforms, maybeLoadMore]);

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

  const stageStyle = {
    '--canvas-cell-w': `${cellW}px`,
    '--canvas-cell-h': `${cellH}px`,
    '--canvas-cols': String(COLS),
  } as React.CSSProperties;

  // ── Render the grid inner content ──────────────────
  // Shared by both streaming (one instance) and wallpaper (9 copies).
  function renderGrid() {
    return visibleItems.map((cell) => {
      const isFresh = recentlyRevealed.has(cell.familyId);
      return (
        <div
          key={cell.familyId}
          className={`canvas-gallery-cell${isFresh ? ' is-fresh' : ''}`}
          data-family-id={cell.familyId}
        >
          <img src={cell.imageUrl} alt={cell.name} loading="lazy" draggable={false} />
        </div>
      );
    });
  }

  return (
    <>
      <div
        ref={stageRef}
        className={`canvas-gallery canvas-gallery-stage canvas-gallery-stage--${phase}`}
        style={stageStyle}
        onClick={handleCanvasClick}
      >
        <div ref={canvasRef} className="canvas-gallery-canvas">
          {phase === 'streaming' ? (
            // Single grid, anchored at the canvas origin (its centre at
            // (0, 0)). Negative margins centre the grid box on the
            // anchor point so the user lands on the middle of the
            // loaded items rather than a corner.
            <div
              ref={streamGridRef}
              className="canvas-gallery-grid"
              style={{
                width: gridContentW,
                height: gridContentH,
                marginTop: -gridContentH / 2,
                marginLeft: -gridContentW / 2,
              }}
            >
              {renderGrid()}
            </div>
          ) : (
            // 9 tile copies. Each tile carries its own pair of seam
            // markers (right + bottom edges) — combined with the
            // adjacent tile's neighbouring markers, every tile boundary
            // ends up with both a vertical and horizontal seam line.
            Array.from({ length: 9 }).map((_, t) => (
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
                <div className="canvas-gallery-tile__seam canvas-gallery-tile__seam--v">
                  <span>Approaching end · hereafter it loops</span>
                </div>
                <div className="canvas-gallery-tile__seam canvas-gallery-tile__seam--h">
                  <span>Approaching end · hereafter it loops</span>
                </div>
                <div
                  className="canvas-gallery-grid"
                  style={{ width: gridContentW, height: gridContentH }}
                >
                  {renderGrid()}
                </div>
              </div>
            ))
          )}
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
            {(['atom', 'molecule', 'compound'] as const).map((level) => {
              const perRow = DENSITY_PRESETS[level].cols;
              const labelName = `${level[0].toUpperCase()}${level.slice(1)}`;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={density === level}
                  className={density === level ? 'is-active' : ''}
                  title={`${labelName} · ${perRow} per row`}
                  aria-label={`${labelName} — ${perRow} per row`}
                  onClick={() => setDensity(level)}
                >
                  {level[0].toUpperCase()}
                </button>
              );
            })}
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
