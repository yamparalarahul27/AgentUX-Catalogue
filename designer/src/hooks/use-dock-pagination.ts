// useDockPagination — pagination state for the magnified dock with
// a responsive page size that adapts to viewport width.
//
// At wide viewports the user gets their preferred max page size;
// at narrower ones the page size shrinks to whatever fits without
// the dock overflowing. The active group's page is preserved across
// resize so the user doesn't get jumped to page 1.
//
// Companion code:
//   - components/CatalogueMagnifiedDock.tsx
//   - hooks/use-viewport-width.ts (existing — viewport listener)

import { useEffect, useMemo, useRef, useState } from 'react';

import { useViewportWidth } from './use-viewport-width';

// Reserved horizontal space inside the dock pill (padding + prev/next
// arrows + divider + sort control + small buffer). Used to compute
// how many chips can fit per page.
const DOCK_RESERVED_WIDTH = 28 + 30 + 30 + 13 + 30 + 24;
// Hard cap on dock width on very wide monitors so it doesn't sprawl.
const DOCK_HARD_MAX = 1400;
// Page swap settle window — magnification + tooltip suppressed.
// Bumped to 1500ms to cover the ~1200ms cascade animation.
export const DOCK_SWAP_SETTLE_MS = 1500;

export interface UseDockPaginationArgs<T> {
  items: T[];
  // Resolve the dom-friendly id for an item — used by activeItemId
  // tracking. The dock passes group keys.
  getItemId: (item: T) => string;
  // Active item to keep visible. When set, the hook computes which
  // page contains it and switches there.
  activeItemId: string | null;
  // User's preferred max chips per page. Actual page size is
  // min(maxPageSize, viewport-fit).
  maxPageSize: number;
  // Chip size in pixels — drives viewport-fit math.
  chipSizePx: number;
  // Chip gap in pixels — drives viewport-fit math.
  chipGapPx: number;
  // Viewport breakpoint below which the dock is hidden entirely
  // (the catalogue falls back to the mobile chip strip).
  mobileBreakpointPx: number;
}

export interface UseDockPaginationApi<T> {
  // True when viewport is below the mobile breakpoint. Parent should
  // render the chip strip instead of the dock.
  isMobileViewport: boolean;
  // Effective page size for current viewport.
  pageSize: number;
  // Total page count given items.length and pageSize.
  pageCount: number;
  // 0-based current page.
  currentPage: number;
  // Items in the current page slice.
  pageItems: T[];
  // Direction the last page swap moved in — null on first render
  // or after a resize/items change that wasn't a user navigation.
  // Used by the dock to drive the slide animation.
  lastSwapDirection: 'next' | 'prev' | null;
  // True during the settle window after a page swap. Parent should
  // suspend magnification + tooltip; clicks are still allowed.
  isPaging: boolean;
  // Navigate to a specific page.
  goToPage: (next: number, direction?: 'next' | 'prev') => void;
}

export function useDockPagination<T>({
  items,
  getItemId,
  activeItemId,
  maxPageSize,
  chipSizePx,
  chipGapPx,
  mobileBreakpointPx,
}: UseDockPaginationArgs<T>): UseDockPaginationApi<T> {
  const viewportWidth = useViewportWidth();
  const isMobileViewport = viewportWidth < mobileBreakpointPx;

  // Compute the page size that fits in the current viewport.
  const pageSize = useMemo(() => {
    if (isMobileViewport) return 0;
    const dockMax = Math.min(DOCK_HARD_MAX, viewportWidth - 48);
    const chipsArea = dockMax - DOCK_RESERVED_WIDTH;
    const perChip = chipSizePx + chipGapPx;
    const fits = Math.max(1, Math.floor(chipsArea / perChip));
    return Math.min(maxPageSize, fits);
  }, [chipGapPx, chipSizePx, isMobileViewport, maxPageSize, viewportWidth]);

  const pageCount = pageSize > 0
    ? Math.max(1, Math.ceil(items.length / pageSize))
    : 1;

  const [currentPage, setCurrentPage] = useState(0);
  const [lastSwapDirection, setLastSwapDirection] = useState<'next' | 'prev' | null>(null);
  const [isPaging, setIsPaging] = useState(false);

  // Track previous pageSize so we can preserve the user's place
  // across resize (anchor on the first visible item or the active item).
  const prevPageSizeRef = useRef(pageSize);
  useEffect(() => {
    const old = prevPageSizeRef.current;
    if (old === pageSize || pageSize === 0) {
      prevPageSizeRef.current = pageSize;
      return;
    }
    // Active item wins — if set, jump to whichever page contains it.
    if (activeItemId) {
      const idx = items.findIndex((item) => getItemId(item) === activeItemId);
      if (idx >= 0) {
        setCurrentPage(Math.floor(idx / pageSize));
        prevPageSizeRef.current = pageSize;
        return;
      }
    }
    // Otherwise anchor on the first item that was visible at the old
    // page size — keeps the user roughly where they were.
    const firstVisibleIdx = currentPage * old;
    setCurrentPage(Math.floor(firstVisibleIdx / pageSize));
    prevPageSizeRef.current = pageSize;
  }, [activeItemId, currentPage, getItemId, items, pageSize]);

  // If items length or page size shrinks below currentPage, snap back.
  useEffect(() => {
    if (currentPage >= pageCount) {
      setCurrentPage(Math.max(0, pageCount - 1));
    }
  }, [currentPage, pageCount]);

  // Auto-jump to the active item's page when it changes externally
  // (e.g., admin selects a group from elsewhere in the UI).
  useEffect(() => {
    if (!activeItemId || pageSize === 0) return;
    const idx = items.findIndex((item) => getItemId(item) === activeItemId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / pageSize);
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);

  const pageItems = useMemo(() => {
    if (pageSize === 0) return [];
    const start = currentPage * pageSize;
    return items.slice(start, start + pageSize);
  }, [currentPage, items, pageSize]);

  const settleTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
  }, []);

  function goToPage(next: number, direction?: 'next' | 'prev') {
    if (next < 0 || next >= pageCount) return;
    if (next === currentPage) return;
    setCurrentPage(next);
    setLastSwapDirection(direction ?? (next > currentPage ? 'next' : 'prev'));
    setIsPaging(true);
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setIsPaging(false);
    }, DOCK_SWAP_SETTLE_MS);
  }

  return {
    isMobileViewport,
    pageSize,
    pageCount,
    currentPage,
    pageItems,
    lastSwapDirection,
    isPaging,
    goToPage,
  };
}
