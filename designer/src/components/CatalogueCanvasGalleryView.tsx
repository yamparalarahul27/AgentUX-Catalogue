import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';
import {
  getCachedAspect,
  getScreenshotAspectDefault,
  layoutJustifiedRows,
  probeImageAspect,
  useAspectCacheVersion,
} from '../lib/canvas-masonry';

// Canvas Gallery view — 2D pannable canvas with masonry-packed tiles.
//
// The pan/allocation model is identical to the original fixed-grid
// canvas: items are chunked into batches of 56, each batch lives in a
// fixed-size tile rectangle, and tiles are positioned in an integer
// grid keyed by camera pan (pan right → tile to the right, pan down →
// tile below). Items always flow in catalogue order.
//
// What changed: inside each tile, the layout is now justified-rows
// masonry instead of a uniform CSS grid. Every cell preserves its
// natural aspect (no letterboxing). Aspects come from a hybrid source:
// platform default on first paint (mobile = 9:19.5, web = 16:10),
// refined async via `new Image()` natural-dim probing — the layout
// re-justifies when real aspects land.
//
// Spec mockup: docs/mockups/mockup-2026-05-27-canvas-masonry.html.

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
  // Inner dimensions of the masonry area inside one tile.
  contentW: number;
  contentH: number;
  // Target row height fed to the justified-rows packer.
  rowH: number;
}

const BATCH_SIZE = 56;
// Cell-to-cell gap inside a row + between rows inside a tile.
const GAP = 20;
// Tile-to-tile gap on the 2D canvas (the "seam" between batches).
const SEAM_GAP = 96;
const LOADER_HOLD_MS = 1400;
const REVEAL_FADE_MS = 600;
const STAGGER_PER_CELL_MS = 24;

const DENSITY_PRESETS: Record<Density, DensityPreset> = {
  atom:     { contentW: 5000, contentH: 1700, rowH: 360 },
  molecule: { contentW: 2700, contentH: 1000, rowH: 200 },
  compound: { contentW: 1500, contentH: 600,  rowH: 110 },
};

interface TilePosition { x: number; y: number; }
interface VisibleCell {
  familyId: string;
  name: string;
  imageUrl: string;
  aspect: number;
  width: number;
  height: number;
  staggerMs: number;
  isFresh: boolean;
}
interface VisibleRow {
  height: number;
  cells: VisibleCell[];
}
interface RenderedTile {
  position: TilePosition;
  batchIdx: number;
  rows: VisibleRow[];
  // Total height of the masonry content; used to vertically center
  // inside the fixed contentH for breathing room.
  contentHeight: number;
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
  const prevPopulatedBatchesRef = useRef(0);
  const cacheVersion = useAspectCacheVersion();

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
  const tileW = preset.contentW + SEAM_GAP;
  const tileH = preset.contentH + SEAM_GAP;

  // ── Probe aspects for every screenshot that has a URL. Calls are
  // idempotent — the module-level cache short-circuits repeats.
  useEffect(() => {
    for (const family of families) {
      const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
      const url = variant?.screenshot?.image_url;
      if (url) probeImageAspect(url);
    }
  }, [families, activeVariantKeys]);

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

  // ── Build the rendered tile list (masonry packing per batch). ──
  const renderedTiles = useMemo<RenderedTile[]>(() => {
    void cacheVersion; // re-evaluate when aspect probes land
    const tiles: RenderedTile[] = [];
    for (let batchIdx = 0; batchIdx < batchPositions.length; batchIdx++) {
      const start = batchIdx * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, families.length);
      if (end <= start) continue;

      const items: { familyId: string; name: string; imageUrl: string; aspect: number }[] = [];
      for (let i = start; i < end; i++) {
        const family = families[i];
        const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
        const screenshot = variant?.screenshot;
        const url = screenshot?.image_url;
        if (!url) continue;
        items.push({
          familyId: family.id,
          name: family.name,
          imageUrl: url,
          aspect: getCachedAspect(url) ?? getScreenshotAspectDefault(screenshot),
        });
      }
      if (items.length === 0) continue;

      const rawRows = layoutJustifiedRows(items, preset.contentW, preset.rowH, GAP);
      const isFreshBatch = recentlyRevealedBatches.has(batchIdx);
      let cellOrder = 0;
      const rows: VisibleRow[] = rawRows.map((row) => ({
        height: row.height,
        cells: row.items.map((it) => {
          const visible: VisibleCell = {
            familyId: it.familyId,
            name: it.name,
            imageUrl: it.imageUrl,
            aspect: it.aspect,
            width: it.aspect * row.height,
            height: row.height,
            staggerMs: isFreshBatch ? cellOrder * STAGGER_PER_CELL_MS : 0,
            isFresh: isFreshBatch,
          };
          cellOrder += 1;
          return visible;
        }),
      }));
      const contentHeight = rows.reduce((s, r) => s + r.height, 0) + GAP * Math.max(0, rows.length - 1);

      tiles.push({
        position: batchPositions[batchIdx],
        batchIdx,
        rows,
        contentHeight,
      });
    }
    return tiles;
  }, [batchPositions, families, activeVariantKeys, recentlyRevealedBatches, preset.contentW, preset.rowH, cacheVersion]);

  // ── Detect "newly populated" batches (cells arrive) ─
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
        const lastBatch = renderedTiles[renderedTiles.length - 1];
        const lastBatchCellCount = lastBatch.rows.reduce((s, r) => s + r.cells.length, 0);
        const clearAfter = REVEAL_FADE_MS + lastBatchCellCount * STAGGER_PER_CELL_MS;
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

  // ── Pan transform (2D). ────────────────────────────
  const applyTransforms = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY } = panRef.current;
    canvas.style.transform = `translate3d(${-panX}px, ${-panY}px, 0)`;
  }, []);

  // ── Camera-into-new-tile detection (same math as original). ────
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
      startTransition(() => {
        setBatchPositions((prev) => {
          if (prev.some((p) => positionKey(p) === key)) return prev;
          return [...prev, cam];
        });
      });
    }
    if (families.length < itemsNeededTotal && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [batchPositions, cameraTilePosition, families.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    maybeAllocateTile();
  }, [maybeAllocateTile]);

  useEffect(() => {
    applyTransforms();
  }, [applyTransforms, tileW, tileH]);

  // ── Inertia rAF. ───────────────────────────────────
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
        maybeAllocateTile();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyTransforms, maybeAllocateTile]);

  // ── Pointer + wheel handlers (2D pan). ─────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

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
  }, [applyTransforms, maybeAllocateTile]);

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

  // ── Enter / exit transitions. ──────────────────────
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
        onClick={handleCanvasClick}
      >
        <div ref={canvasRef} className="canvas-gallery-canvas">
          {renderedTiles.map((tile) => {
            const left = tile.position.x * tileW;
            const top = tile.position.y * tileH;
            // Vertical centering inside the fixed contentH gives the
            // masonry breathing room when it under-fills the tile.
            const verticalSlack = Math.max(0, preset.contentH - tile.contentHeight);
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
                  className="canvas-gallery-tile-content"
                  style={{
                    width: preset.contentW,
                    height: preset.contentH,
                    paddingTop: verticalSlack / 2,
                  }}
                >
                  {tile.rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="canvas-gallery-row" style={{ height: row.height }}>
                      {row.cells.map((cell) => (
                        <div
                          key={cell.familyId}
                          className={`canvas-gallery-cell${cell.isFresh ? ' is-fresh' : ''}`}
                          data-family-id={cell.familyId}
                          style={
                            {
                              width: cell.width,
                              height: cell.height,
                              ...(cell.isFresh
                                ? ({ ['--reveal-delay' as string]: `${cell.staggerMs}ms` } as React.CSSProperties)
                                : null),
                            } as React.CSSProperties
                          }
                        >
                          <img src={cell.imageUrl} alt={cell.name} loading="lazy" decoding="async" draggable={false} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {/* Trailing-edge markers — pure text, no visible line. */}
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

        <div className="canvas-gallery-bottom-row">
          <button
            type="button"
            className="canvas-gallery-exit"
            aria-label="Exit Canvas view"
            title="Exit Canvas view"
            onClick={handleExitClick}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <div className="canvas-gallery-density" role="radiogroup" aria-label="Cell zoom">
            {(['atom', 'molecule', 'compound'] as const).map((level) => {
              const labelName = `${level[0].toUpperCase()}${level.slice(1)}`;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={density === level}
                  className={density === level ? 'is-active' : ''}
                  title={`${labelName} · ${DENSITY_PRESETS[level].rowH}px row height`}
                  aria-label={`${labelName} — ${DENSITY_PRESETS[level].rowH}px row height`}
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
