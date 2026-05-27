import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';

// Canvas Gallery view — demand-driven tile placement.
//
// Items are chunked into batches of 50. Each batch lives in a finite
// "tile" rectangle (8 cols × ceil(50/8) rows). Tiles are positioned in
// a 2D grid keyed by camera position: the first tile sits at (0, 0);
// every other tile is allocated the moment the camera enters its
// position. So:
//
//   - Pan right past tile 1's right edge → tile 2 spawns to the right
//     with items 51-100.
//   - Pan down from tile 2 → tile 3 spawns below with items 101-150.
//
// Items always flow in catalogue order; the user's pan history only
// determines spatial layout, not which screenshots appear next.
//
// Server pagination wires through `onLoadMore` + `hasMore`. When the
// user crosses a tile boundary into a position that needs more items
// than `families` currently has, the canvas calls `onLoadMore()` and
// allocates the new tile placement once items arrive.
//
// Spec mockup: docs/mockups/mockup-2026-05-26-canvas-gallery.html.

interface CatalogueCanvasGalleryViewProps {
  families: CatalogueFamilyView[];
  activeVariantKeys: Record<string, string>;
  onSelectFamily: (familyId: string) => void;
  onExit: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

type Density = 'atom' | 'molecule' | 'compound';
type LoaderState = 'enter' | 'exit' | 'idle';

interface DensityPreset {
  w: number;
  h: number;
}

// COLS is constant across all densities — density only changes cell
// SIZE (zoom). Keeps the marker at a consistent "8 cells from the
// start" regardless of which density is active.
//
// BATCH_SIZE is a multiple of COLS so every non-final tile has a
// completely filled bottom row — no ragged edge of empty slots above
// the "Placing more amazing references" marker.
const COLS = 8;
const TILE_ROWS = 7;
const BATCH_SIZE = COLS * TILE_ROWS; // 56
const DENSITY_PRESETS: Record<Density, DensityPreset> = {
  atom:     { w: 640, h: 400 },   // ~2 visible per row in a typical viewport
  molecule: { w: 320, h: 200 },   // ~4 visible per row (default)
  compound: { w: 170, h: 106 },   // ~8 visible per row
};
const GAP = 18;
const SEAM_GAP = 56;
const LOADER_HOLD_MS = 1400;
const REVEAL_FADE_MS = 600;
const STAGGER_PER_CELL_MS = 24;

interface TilePosition { x: number; y: number; }
interface VisibleCell {
  familyId: string;
  name: string;
  imageUrl: string;
  // Staggered animation delay applied via inline style on .is-fresh
  // cells. Lets each item in a freshly-revealed batch pop in
  // ~24 ms after the one before it.
  staggerMs: number;
  isFresh: boolean;
}
interface RenderedTile {
  position: TilePosition;
  batchIdx: number;
  cells: VisibleCell[];
}

function positionKey(p: TilePosition): string {
  return `${p.x},${p.y}`;
}

export function CatalogueCanvasGalleryView({
  families,
  activeVariantKeys,
  onSelectFamily,
  onExit,
  hasMore,
  loadingMore,
  onLoadMore,
}: CatalogueCanvasGalleryViewProps) {
  const [density, setDensity] = useState<Density>('molecule');
  const [batchPositions, setBatchPositions] = useState<TilePosition[]>(() => [{ x: 0, y: 0 }]);
  const [recentlyRevealedBatches, setRecentlyRevealedBatches] = useState<Set<number>>(() => new Set([0]));
  const [loaderState, setLoaderState] = useState<LoaderState>('enter');

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevFamiliesKeyRef = useRef<string>('');
  // Tracks the highest batch index we've actually populated with
  // items — so the reveal effect fires only on growth.
  const prevPopulatedBatchesRef = useRef(0);

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
  const tileContentW = COLS * cellW + (COLS - 1) * GAP;
  const tileContentH = TILE_ROWS * cellH + (TILE_ROWS - 1) * GAP;
  const tileW = tileContentW + SEAM_GAP;
  const tileH = tileContentH + SEAM_GAP;

  // ── Reset on filter change (NOT on server pagination) ──
  // Append (new ids extend the existing prefix) = pagination — keep
  // pan + batch positions. Anything else = filter / sort change → reset.
  const familyIdList = useMemo(() => families.map((f) => f.id), [families]);
  const familiesKey = familyIdList.join('|');
  useEffect(() => {
    if (familiesKey === prevFamiliesKeyRef.current) return;
    const prev = prevFamiliesKeyRef.current.split('|').filter(Boolean);
    const isAppend =
      familyIdList.length >= prev.length
      && prev.every((id, i) => familyIdList[i] === id);
    prevFamiliesKeyRef.current = familiesKey;
    if (isAppend) return;
    setBatchPositions([{ x: 0, y: 0 }]);
    setRecentlyRevealedBatches(new Set([0]));
    prevPopulatedBatchesRef.current = 0;
    panRef.current.panX = 0;
    panRef.current.panY = 0;
    panRef.current.velX = 0;
    panRef.current.velY = 0;
  }, [familiesKey, familyIdList]);

  // ── Build the rendered tile list ───────────────────
  // Each batchPosition produces one tile. The items for batch N are
  // `families[N*50 .. (N+1)*50]` — if fewer than 50 are available,
  // the tile renders a partial grid (no padding cells).
  const renderedTiles = useMemo<RenderedTile[]>(() => {
    const tiles: RenderedTile[] = [];
    for (let batchIdx = 0; batchIdx < batchPositions.length; batchIdx++) {
      const start = batchIdx * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, families.length);
      if (end <= start) continue; // no items yet for this batch
      const cells: VisibleCell[] = [];
      const isFreshBatch = recentlyRevealedBatches.has(batchIdx);
      let cellOrder = 0;
      for (let i = start; i < end; i++) {
        const family = families[i];
        const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
        const url = variant?.screenshot?.image_url;
        if (!url) continue;
        cells.push({
          familyId: family.id,
          name: family.name,
          imageUrl: url,
          // Stagger only fires for freshly-revealed batches.
          staggerMs: isFreshBatch ? cellOrder * STAGGER_PER_CELL_MS : 0,
          isFresh: isFreshBatch,
        });
        cellOrder += 1;
      }
      tiles.push({
        position: batchPositions[batchIdx],
        batchIdx,
        cells,
      });
    }
    return tiles;
  }, [batchPositions, families, activeVariantKeys, recentlyRevealedBatches]);

  // ── Detect "newly populated" batches (cells arrive) ─
  // A batch is "populated" when its slice of families becomes non-empty.
  // When a batch flips from empty to populated, mark it for fresh fade-in.
  useEffect(() => {
    const populatedCount = renderedTiles.length;
    if (populatedCount > prevPopulatedBatchesRef.current) {
      const newBatchIdxs: number[] = [];
      for (let i = prevPopulatedBatchesRef.current; i < populatedCount; i++) {
        newBatchIdxs.push(renderedTiles[i].batchIdx);
      }
      if (newBatchIdxs.length > 0) {
        setRecentlyRevealedBatches((current) => {
          const next = new Set(current);
          for (const idx of newBatchIdxs) next.add(idx);
          return next;
        });
        const lastBatchSize = renderedTiles[renderedTiles.length - 1].cells.length;
        const clearAfter = REVEAL_FADE_MS + lastBatchSize * STAGGER_PER_CELL_MS;
        const timer = window.setTimeout(() => {
          setRecentlyRevealedBatches((current) => {
            const next = new Set(current);
            for (const idx of newBatchIdxs) next.delete(idx);
            return next;
          });
        }, clearAfter);
        prevPopulatedBatchesRef.current = populatedCount;
        return () => window.clearTimeout(timer);
      }
    }
    prevPopulatedBatchesRef.current = populatedCount;
  }, [renderedTiles]);

  // ── Pan transform ──────────────────────────────────
  // Single transform on the canvas — every tile is positioned inside
  // canvas-space at (batchPos.x * tileW, batchPos.y * tileH).
  const applyTransforms = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY } = panRef.current;
    canvas.style.transform = `translate3d(${-panX}px, ${-panY}px, 0)`;
  }, []);

  // ── Camera-into-new-tile detection ────────────────
  // The camera is at (panX, panY) in canvas space. The tile that
  // contains the camera centre is (floor((panX + tileW/2) / tileW),
  // floor((panY + tileH/2) / tileH))... but our tiles are centred on
  // grid positions (a tile at (1, 0) covers canvas x ∈ [tileW/2, 3·tileW/2]).
  // Simpler: round the camera position to the nearest tile centre.
  const cameraTilePosition = useCallback((): TilePosition => {
    const { panX, panY } = panRef.current;
    return {
      x: Math.round(panX / tileW),
      y: Math.round(panY / tileH),
    };
  }, [tileW, tileH]);

  const maybeAllocateTile = useCallback(() => {
    const cam = cameraTilePosition();
    const key = positionKey(cam);
    const existing = batchPositions.some((p) => positionKey(p) === key);
    if (existing) return;
    const nextBatchIdx = batchPositions.length;
    const itemsNeededTotal = (nextBatchIdx + 1) * BATCH_SIZE;
    if (families.length >= nextBatchIdx * BATCH_SIZE + 1) {
      // At least one item available for this batch — allocate now.
      startTransition(() => {
        setBatchPositions((prev) => {
          if (prev.some((p) => positionKey(p) === key)) return prev;
          return [...prev, cam];
        });
      });
    }
    // If we'll need more items than we have, ask the server.
    if (families.length < itemsNeededTotal && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [batchPositions, cameraTilePosition, families.length, hasMore, loadingMore, onLoadMore]);

  // After paginated items arrive, allocate any pending position
  // automatically. (Camera might still be in the same un-tiled spot.)
  useEffect(() => {
    maybeAllocateTile();
  }, [maybeAllocateTile]);

  // Initial paint + reapply on geometry change.
  useEffect(() => {
    applyTransforms();
  }, [applyTransforms, tileW, tileH]);

  // Inertia rAF — runs only while a drag-fling is decaying. The loop
  // cancels itself once velocity falls below the 0.05 threshold so an
  // idle Canvas tab doesn't burn 60 fps forever. Re-armed from the
  // pointer / wheel handlers when the user kicks fresh motion in.
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    tickRef.current = () => {
      const state = panRef.current;
      const hasMotion = Math.abs(state.velX) > 0.05 || Math.abs(state.velY) > 0.05;
      if (!state.isPointerDown && hasMotion) {
        state.panX += state.velX;
        state.panY += state.velY;
        state.velX *= 0.92;
        state.velY *= 0.92;
        applyTransforms();
        maybeAllocateTile();
        rafRef.current = requestAnimationFrame(tickRef.current);
      } else {
        // Drop the velocity to a clean zero so the next interaction
        // starts from rest, and let the loop stop.
        if (!state.isPointerDown) {
          state.velX = 0;
          state.velY = 0;
        }
        rafRef.current = null;
      }
    };
  }, [applyTransforms, maybeAllocateTile]);

  const startInertia = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Pointer + wheel handlers.
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
        maybeAllocateTile();
      }
    }
    function onPointerEnd() {
      const state = panRef.current;
      if (!state.isPointerDown) return;
      state.isPointerDown = false;
      stage?.classList.remove('is-dragging');
      // Kick the inertia rAF loop so the fling decays. The loop
      // self-cancels once velocity drops below the threshold.
      startInertia();
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey) return;
      const state = panRef.current;
      state.velX = 0;
      state.velY = 0;
      state.panX += event.deltaX;
      state.panY += event.deltaY;
      applyTransforms();
      maybeAllocateTile();
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
  }, [applyTransforms, maybeAllocateTile, startInertia]);

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

  return (
    <>
      <div
        ref={stageRef}
        className="canvas-gallery canvas-gallery-stage"
        style={stageStyle}
        onClick={handleCanvasClick}
      >
        <div ref={canvasRef} className="canvas-gallery-canvas">
          {renderedTiles.map((tile) => {
            const left = tile.position.x * tileW;
            const top = tile.position.y * tileH;
            return (
              <div
                key={`${tile.position.x},${tile.position.y}`}
                className="canvas-gallery-tile"
                style={{
                  width: tileW,
                  height: tileH,
                  transform: `translate3d(${left}px, ${top}px, 0)`,
                  marginLeft: -tileW / 2,
                  marginTop: -tileH / 2,
                }}
              >
                <div
                  className="canvas-gallery-grid"
                  style={{ width: tileContentW, height: tileContentH }}
                >
                  {tile.cells.map((cell) => (
                    <div
                      key={cell.familyId}
                      className={`canvas-gallery-cell${cell.isFresh ? ' is-fresh' : ''}`}
                      data-family-id={cell.familyId}
                      style={cell.isFresh ? ({ '--reveal-delay': `${cell.staggerMs}ms` } as React.CSSProperties) : undefined}
                    >
                      <img src={cell.imageUrl} alt={cell.name} loading="lazy" draggable={false} />
                    </div>
                  ))}
                </div>
                {/* Trailing-edge marker text on right + bottom of every
                    tile. Text only — no visible line under it. Tells
                    the user "more is being placed" if they keep panning
                    in that direction. */}
                <div className="canvas-gallery-tile__marker canvas-gallery-tile__marker--v">
                  <span>Placing more amazing references</span>
                </div>
                <div className="canvas-gallery-tile__marker canvas-gallery-tile__marker--h">
                  <span>Placing more amazing references</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="canvas-gallery-exit"
          aria-label="Exit Canvas view"
          title="Exit Canvas view"
          onClick={handleExitClick}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Exit</span>
        </button>

        <div className="canvas-gallery-bottom-row">
          <div className="canvas-gallery-density" role="radiogroup" aria-label="Cell zoom">
            {(['atom', 'molecule', 'compound'] as const).map((level) => {
              const visibleApprox = level === 'atom' ? 2 : level === 'molecule' ? 4 : 8;
              const labelName = `${level[0].toUpperCase()}${level.slice(1)}`;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={density === level}
                  className={density === level ? 'is-active' : ''}
                  title={`${labelName} · ~${visibleApprox} visible per row`}
                  aria-label={`${labelName} — about ${visibleApprox} visible per row`}
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
