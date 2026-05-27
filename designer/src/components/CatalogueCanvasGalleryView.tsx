import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';
import {
  getCachedAspect,
  getScreenshotAspectDefault,
  layoutJustifiedRows,
  probeImageAspect,
  useAspectCacheVersion,
} from '../lib/canvas-masonry';

// Canvas Gallery view — vertical justified-rows masonry.
//
// Every screenshot keeps its natural aspect (no letterboxing). Rows are
// packed greedily to fill the viewport width, then scaled so each row's
// items add up to exactly the container width — Flickr / Google Photos
// style. The screen mix is wild (mobile 9:19.5, desktop 16:9, square
// heroes…) so this layout breathes much better than a fixed cell grid.
//
// Aspects are sourced via a hybrid strategy:
//   1. Initial paint uses a platform default (mobile = 9:19.5, web = 16:10).
//   2. Each visible image is probed via `new Image()` to read its true
//      `naturalWidth/Height`; once that lands the layout re-justifies.
//
// Pagination is vertical-only. When the camera approaches the bottom of
// the placed content we allocate the next batch (and ask the server
// for more rows if needed).
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

const BATCH_SIZE = 56;
const ROW_TARGET_BY_DENSITY: Record<Density, number> = {
  atom: 360,
  molecule: 200,
  compound: 110,
};
const GAP = 14;
const BATCH_GAP = 56;
const HORIZONTAL_PADDING = 32;
const LOADER_HOLD_MS = 1400;
const REVEAL_FADE_MS = 600;
const STAGGER_PER_CELL_MS = 24;
// Trigger next-batch allocation when the camera comes within this many
// pixels of the bottom of placed content.
const BOTTOM_PREFETCH_PX = 600;

interface CellData {
  familyId: string;
  name: string;
  imageUrl: string;
  aspect: number;
  batchIdx: number;
}

interface PositionedCell extends CellData {
  width: number;
  height: number;
  staggerMs: number;
  isFresh: boolean;
}

interface PositionedRow {
  items: PositionedCell[];
  height: number;
}

interface PositionedBatch {
  batchIdx: number;
  y: number;
  height: number;
  rows: PositionedRow[];
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
  const [stageWidth, setStageWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );
  const [loaderState, setLoaderState] = useState<LoaderState>('enter');
  const [recentlyRevealedBatches, setRecentlyRevealedBatches] = useState<Set<number>>(
    () => new Set([0]),
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevFamiliesKeyRef = useRef<string>('');
  const prevPopulatedBatchesRef = useRef(0);
  const cacheVersion = useAspectCacheVersion();

  const panRef = useRef({
    panY: 0,
    velY: 0,
    isPointerDown: false,
    dragMoved: false,
    startPointerY: 0,
    startPanY: 0,
  });

  // ── Probe aspects for every screenshot that has a URL. The cache is
  // module-level so re-mounts don't refetch. Calls are idempotent.
  useEffect(() => {
    for (const family of families) {
      const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
      const url = variant?.screenshot?.image_url;
      if (url) probeImageAspect(url);
    }
  }, [families, activeVariantKeys]);

  // ── Track stage width so masonry re-justifies on resize. ───────
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const update = () => setStageWidth(stage.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ── Build flat list of cells with current best-known aspect. ───
  const cells = useMemo<CellData[]>(() => {
    void cacheVersion; // re-evaluate when probes land
    const out: CellData[] = [];
    for (let i = 0; i < families.length; i++) {
      const family = families[i];
      const variant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
      const screenshot = variant?.screenshot;
      const url = screenshot?.image_url;
      if (!url) continue;
      const aspect = getCachedAspect(url) ?? getScreenshotAspectDefault(screenshot);
      out.push({
        familyId: family.id,
        name: family.name,
        imageUrl: url,
        aspect,
        batchIdx: Math.floor(i / BATCH_SIZE),
      });
    }
    return out;
  }, [families, activeVariantKeys, cacheVersion]);

  // ── Lay out each batch as N justified rows, stacked vertically.
  const layoutData = useMemo<{ batches: PositionedBatch[]; totalHeight: number }>(() => {
    const innerWidth = Math.max(0, stageWidth - HORIZONTAL_PADDING * 2);
    if (innerWidth <= 0 || cells.length === 0) return { batches: [], totalHeight: 0 };
    const targetRowHeight = ROW_TARGET_BY_DENSITY[density];

    const byBatch = new Map<number, CellData[]>();
    for (const cell of cells) {
      let arr = byBatch.get(cell.batchIdx);
      if (!arr) {
        arr = [];
        byBatch.set(cell.batchIdx, arr);
      }
      arr.push(cell);
    }

    const batches: PositionedBatch[] = [];
    let yCursor = 0;
    const sortedBatchIdxs = Array.from(byBatch.keys()).sort((a, b) => a - b);
    for (const batchIdx of sortedBatchIdxs) {
      const items = byBatch.get(batchIdx) ?? [];
      const isFreshBatch = recentlyRevealedBatches.has(batchIdx);
      const rawRows = layoutJustifiedRows(items, innerWidth, targetRowHeight, GAP);
      let cellOrder = 0;
      const rows: PositionedRow[] = rawRows.map((row) => ({
        height: row.height,
        items: row.items.map((it) => {
          const positioned: PositionedCell = {
            ...it,
            width: it.aspect * row.height,
            height: row.height,
            staggerMs: isFreshBatch ? cellOrder * STAGGER_PER_CELL_MS : 0,
            isFresh: isFreshBatch,
          };
          cellOrder += 1;
          return positioned;
        }),
      }));
      const batchHeight = rows.reduce((sum, r) => sum + r.height, 0) + GAP * Math.max(0, rows.length - 1);
      batches.push({ batchIdx, y: yCursor, height: batchHeight, rows });
      yCursor += batchHeight + BATCH_GAP;
    }
    return { batches, totalHeight: Math.max(0, yCursor - BATCH_GAP) };
  }, [cells, density, stageWidth, recentlyRevealedBatches]);

  // ── Reset pan + reveal markers when the data set is replaced (filter
  // change). Pagination (prefix-extension append) keeps the existing pan.
  const familyIdList = useMemo(() => families.map((f) => f.id), [families]);
  const familiesKey = familyIdList.join('|');
  useEffect(() => {
    if (familiesKey === prevFamiliesKeyRef.current) return;
    const prev = prevFamiliesKeyRef.current.split('|').filter(Boolean);
    const isAppend =
      familyIdList.length >= prev.length && prev.every((id, i) => familyIdList[i] === id);
    prevFamiliesKeyRef.current = familiesKey;
    if (isAppend) return;
    panRef.current.panY = 0;
    panRef.current.velY = 0;
    setRecentlyRevealedBatches(new Set([0]));
    prevPopulatedBatchesRef.current = 0;
  }, [familiesKey, familyIdList]);

  // ── Mark newly-populated batches for the fresh fade-in animation.
  useEffect(() => {
    const populatedCount = layoutData.batches.length;
    if (populatedCount <= prevPopulatedBatchesRef.current) {
      prevPopulatedBatchesRef.current = populatedCount;
      return;
    }
    const newBatchIdxs: number[] = [];
    for (let i = prevPopulatedBatchesRef.current; i < populatedCount; i++) {
      newBatchIdxs.push(layoutData.batches[i].batchIdx);
    }
    if (newBatchIdxs.length === 0) {
      prevPopulatedBatchesRef.current = populatedCount;
      return;
    }
    setRecentlyRevealedBatches((current) => {
      const next = new Set(current);
      for (const idx of newBatchIdxs) next.add(idx);
      return next;
    });
    const lastBatch = layoutData.batches[layoutData.batches.length - 1];
    const lastBatchCellCount = lastBatch.rows.reduce((sum, r) => sum + r.items.length, 0);
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
  }, [layoutData.batches]);

  // ── Apply pan transform (vertical only). ───────────────────────
  const applyTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = `translate3d(0, ${-panRef.current.panY}px, 0)`;
  }, []);

  // Clamp pan so the user can't drag past the top or below the bottom
  // of the placed content (plus a small overshoot allowance).
  const clampPan = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const maxPanY = Math.max(0, layoutData.totalHeight - stage.clientHeight + 240);
    if (panRef.current.panY < -120) panRef.current.panY = -120;
    if (panRef.current.panY > maxPanY) panRef.current.panY = maxPanY;
  }, [layoutData.totalHeight]);

  // ── Trigger next batch / fetch more when nearing the bottom. ───
  const maybeFetchMore = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const cameraBottom = panRef.current.panY + stage.clientHeight;
    if (cameraBottom + BOTTOM_PREFETCH_PX < layoutData.totalHeight) return;
    if (hasMore && !loadingMore) onLoadMore();
  }, [hasMore, loadingMore, onLoadMore, layoutData.totalHeight]);

  useEffect(() => {
    applyTransform();
  }, [applyTransform, layoutData.totalHeight, stageWidth]);

  // ── Inertia rAF for drag-fling. ────────────────────────────────
  useEffect(() => {
    let raf = 0;
    function tick() {
      const state = panRef.current;
      if (!state.isPointerDown && Math.abs(state.velY) > 0.05) {
        state.panY += state.velY;
        state.velY *= 0.92;
        clampPan();
        applyTransform();
        maybeFetchMore();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyTransform, clampPan, maybeFetchMore]);

  // ── Pointer + wheel handlers. Vertical-only. ───────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    function onPointerDown(event: PointerEvent) {
      const state = panRef.current;
      state.isPointerDown = true;
      state.dragMoved = false;
      state.startPointerY = event.clientY;
      state.startPanY = state.panY;
      state.velY = 0;
    }
    function onPointerMove(event: PointerEvent) {
      const state = panRef.current;
      if (!state.isPointerDown) return;
      const dy = event.clientY - state.startPointerY;
      if (!state.dragMoved && Math.abs(dy) > 4) {
        state.dragMoved = true;
        stage?.classList.add('is-dragging');
      }
      if (state.dragMoved) {
        const prevPanY = state.panY;
        state.panY = state.startPanY - dy;
        state.velY = state.panY - prevPanY;
        clampPan();
        applyTransform();
        maybeFetchMore();
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
      state.velY = 0;
      // Trackpad two-finger and mouse wheel both come through deltaY.
      state.panY += event.deltaY;
      clampPan();
      applyTransform();
      maybeFetchMore();
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
  }, [applyTransform, clampPan, maybeFetchMore]);

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

  // ── Enter / exit transitions. ──────────────────────────────────
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
        className="canvas-gallery canvas-gallery-stage canvas-gallery-stage--masonry"
        onClick={handleCanvasClick}
      >
        <div ref={canvasRef} className="canvas-gallery-canvas canvas-gallery-canvas--masonry">
          {layoutData.batches.map((batch) => (
            <div
              key={batch.batchIdx}
              className="canvas-gallery-batch"
              style={{ top: batch.y, height: batch.height }}
            >
              {batch.rows.map((row, rowIdx) => (
                <div key={rowIdx} className="canvas-gallery-row" style={{ height: row.height }}>
                  {row.items.map((cell) => (
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
          ))}
          {loadingMore && (
            <div
              className="canvas-gallery-bottom-marker"
              style={{ top: layoutData.totalHeight + 16 }}
            >
              <span>Placing more amazing references</span>
            </div>
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
          <div className="canvas-gallery-density" role="radiogroup" aria-label="Row height">
            {(['atom', 'molecule', 'compound'] as const).map((level) => {
              const labelName = `${level[0].toUpperCase()}${level.slice(1)}`;
              const targetH = ROW_TARGET_BY_DENSITY[level];
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={density === level}
                  className={density === level ? 'is-active' : ''}
                  title={`${labelName} · ${targetH}px row height`}
                  aria-label={`${labelName} — ${targetH}px row height`}
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
