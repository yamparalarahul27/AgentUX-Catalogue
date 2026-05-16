import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { useDockMagnification } from '../hooks/use-dock-magnification';
import { useDockPagination } from '../hooks/use-dock-pagination';
import {
  resolveCatalogueGroupAppearance,
  type CatalogueGroupAppearanceMap,
} from '../lib/catalogue-group-appearance';
import {
  sortGroups,
  type CatalogueGroupSortMode,
  type CatalogueGroupStats,
} from '../lib/catalogue-group-stats';
import { CatalogueDockChip } from './CatalogueDockChip';

// CatalogueMagnifiedDock — bottom-fixed group picker with cursor
// proximity magnification (à la macOS dock), paginated for overflow.
//
// Replaces the top chip strip on desktop (≥768px). On mobile the
// parent renders the existing CatalogueGroupChipStrip instead.
//
// Companion mockup: docs/mockups/catalogue-magnified-dock-2026-05-16.html
// Companion hooks:
//   - hooks/use-dock-magnification.ts (cursor proximity scaling)
//   - hooks/use-dock-pagination.ts    (responsive page size + active-page tracking)
//
// Design constants — sized for a 32px chip on a 1512px viewport with
// 25 chips per page. Smaller viewports shrink the page automatically.
const CHIP_SIZE_PX = 32;
const CHIP_GAP_PX = 10;
const MAX_PAGE_SIZE = 25;
const MOBILE_BREAKPOINT_PX = 768;
// Stagger cap — total cascade ~1200ms regardless of chip count.
// Per-chip step capped at 80ms so small batches don't get huge gaps.
const STAGGER_TOTAL_CAP_MS = 1200;
const STAGGER_STEP_MAX_MS = 80;

interface CatalogueMagnifiedDockProps {
  stats: CatalogueGroupStats[];
  appearanceMap: CatalogueGroupAppearanceMap;
  projectId: string | null;
  activeGroupKey: string | null;
  sortMode: CatalogueGroupSortMode;
  onSelectGroup: (groupKey: string | null) => void;
}

export function CatalogueMagnifiedDock({
  stats,
  appearanceMap,
  projectId,
  activeGroupKey,
  sortMode,
  onSelectGroup,
}: CatalogueMagnifiedDockProps) {
  const ordered = useMemo(
    () => sortGroups(stats, sortMode, (key) => (
      resolveCatalogueGroupAppearance(appearanceMap, key, projectId).label || key
    )),
    [appearanceMap, projectId, sortMode, stats],
  );

  const {
    isMobileViewport,
    pageSize,
    pageCount,
    currentPage,
    pageItems,
    lastSwapDirection,
    isPaging,
    goToPage,
  } = useDockPagination({
    items: ordered,
    getItemId: (item) => item.groupKey,
    activeItemId: activeGroupKey,
    maxPageSize: MAX_PAGE_SIZE,
    chipSizePx: CHIP_SIZE_PX,
    chipGapPx: CHIP_GAP_PX,
    mobileBreakpointPx: MOBILE_BREAKPOINT_PX,
  });

  const { setDockRef, setChipsContainerRef, invalidate } = useDockMagnification({
    suspended: isPaging,
  });

  // Re-apply magnification after page swap (chips re-render).
  useEffect(() => { invalidate(); }, [pageItems, invalidate]);

  // Stagger step adapts so the total cascade stays ≤ STAGGER_TOTAL_CAP_MS
  // regardless of how many chips are in the new batch.
  const staggerStepMs = useMemo(() => {
    const n = Math.max(1, pageItems.length - 1);
    return Math.min(STAGGER_STEP_MAX_MS, Math.max(8, Math.floor(STAGGER_TOTAL_CAP_MS / n)));
  }, [pageItems.length]);

  // Keyboard nav — ← / → flip pages when the dock region has the
  // cursor. Listener attaches to document so the focus doesn't have
  // to be on a button.
  const dockHoveredRef = useRef(false);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!dockHoveredRef.current || pageSize === 0) return;
      if (event.key === 'ArrowLeft' && currentPage > 0) {
        event.preventDefault();
        goToPage(currentPage - 1, 'prev');
      } else if (event.key === 'ArrowRight' && currentPage < pageCount - 1) {
        event.preventDefault();
        goToPage(currentPage + 1, 'next');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentPage, goToPage, pageCount, pageSize]);

  if (isMobileViewport || pageSize === 0 || ordered.length === 0) {
    // Mobile (or no groups) — the parent renders the chip strip instead.
    return null;
  }

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <div
        className="catalogue-dock-region"
        ref={setDockRef}
        onMouseEnter={() => { dockHoveredRef.current = true; }}
        onMouseLeave={() => { dockHoveredRef.current = false; }}
      >
        <div
          className={`catalogue-dock${isPaging ? ' is-paging' : ''}`}
          style={{
            '--dock-chip-size': `${CHIP_SIZE_PX}px`,
            '--dock-chip-gap': `${CHIP_GAP_PX}px`,
            '--dock-stagger-step': `${staggerStepMs}ms`,
          } as CSSProperties}
        >
          {pageCount > 1 && (
            <button
              type="button"
              className="catalogue-dock-control"
              onClick={() => goToPage(currentPage - 1, 'prev')}
              disabled={currentPage === 0 || isPaging}
              aria-label="Previous group page"
              title="Previous page (←)"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          )}
          <div
            className="catalogue-dock-page"
            ref={setChipsContainerRef}
            data-swap={lastSwapDirection ?? undefined}
            key={currentPage /* force remount so CSS animation re-runs */}
          >
            {pageItems.map((group, idx) => {
              const staggerIdx = lastSwapDirection === 'prev'
                ? pageItems.length - 1 - idx
                : idx;
              return (
                <CatalogueDockChip
                  key={group.groupKey}
                  groupKey={group.groupKey}
                  projectId={projectId}
                  count={group.count}
                  isActive={group.groupKey === activeGroupKey}
                  staggerIndex={staggerIdx}
                  initialAppearanceMap={appearanceMap}
                  onClick={() => {
                    if (isPaging) return;
                    onSelectGroup(group.groupKey === activeGroupKey ? null : group.groupKey);
                  }}
                />
              );
            })}
          </div>
          {pageCount > 1 && (
            <button
              type="button"
              className="catalogue-dock-control"
              onClick={() => goToPage(currentPage + 1, 'next')}
              disabled={currentPage >= pageCount - 1 || isPaging}
              aria-label="Next group page"
              title="Next page (→)"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
