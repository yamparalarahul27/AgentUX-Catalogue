import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useNavigate } from 'react-router-dom';

import { IconTooltip } from './IconTooltip';

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

// Shrunken-pill mode (active when isGroupView=true and not expanded).
// The pill shows a curated, fixed ordered list of group keys (case-
// insensitive match against the data). Missing groups are silently
// skipped so the pill stays consistent if a curated group is renamed
// or removed.
const SHRUNKEN_PILL_CURATED_KEYS = [
  'binance',
  'bybit',
  'weex',
  'hyperliquid',
  'aster',
  'bullpen',
  'sushi',
  'social',
] as const;
const SHRUNKEN_SCROLL_THRESHOLD_PX = 80;

interface CatalogueMagnifiedDockProps {
  stats: CatalogueGroupStats[];
  appearanceMap: CatalogueGroupAppearanceMap;
  projectId: string | null;
  activeGroupKey: string | null;
  sortMode: CatalogueGroupSortMode;
  onSelectGroup: (groupKey: string | null) => void;
  // When true, the dock collapses to a small overlapping-icon pill until
  // clicked. Activated by sortBy === 'name-asc' (Group View) on the
  // catalogue page. The "browse all groups" overview makes the full dock
  // redundant; the pill keeps a quick-jump affordance available without
  // competing for attention.
  isGroupView: boolean;
}

export function CatalogueMagnifiedDock({
  stats,
  appearanceMap,
  projectId,
  activeGroupKey,
  sortMode,
  onSelectGroup,
  isGroupView,
}: CatalogueMagnifiedDockProps) {
  const ordered = useMemo(
    () => sortGroups(stats, sortMode, (key) => (
      resolveCatalogueGroupAppearance(appearanceMap, key, projectId).label || key
    )),
    [appearanceMap, projectId, sortMode, stats],
  );

  const navigate = useNavigate();

  // Shrunken-pill state machine (only relevant while isGroupView=true).
  // Default to shrunken on entering Group View; click → expanded; scroll
  // past threshold / Esc / click-outside → back to shrunken.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    // Reset when leaving Group View so re-entry starts shrunken.
    if (!isGroupView) setIsExpanded(false);
  }, [isGroupView]);

  const dockRegionRef = useRef<HTMLDivElement | null>(null);

  // Collapse triggers while expanded — scroll past threshold, Esc key,
  // and click-outside.
  useEffect(() => {
    if (!isGroupView || !isExpanded) return;
    let lastScroll = window.scrollY;
    function onScroll() {
      if (Math.abs(window.scrollY - lastScroll) >= SHRUNKEN_SCROLL_THRESHOLD_PX) {
        setIsExpanded(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsExpanded(false);
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || !dockRegionRef.current?.contains(target)) {
        setIsExpanded(false);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isGroupView, isExpanded]);

  // Shrunken-pill icons — pull each curated key out of stats by case-
  // insensitive match. Order is the curated list order; missing groups
  // (renamed / removed) are silently dropped rather than padding with a
  // fallback, so the pill stays honest about what actually exists.
  const shrunkenIcons = useMemo(() => {
    if (!isGroupView || isExpanded) return [];
    const byKey = new Map<string, CatalogueGroupStats>();
    for (const item of stats) {
      byKey.set(item.groupKey.toLowerCase(), item);
    }
    return SHRUNKEN_PILL_CURATED_KEYS
      .map((key) => byKey.get(key))
      .filter((item): item is CatalogueGroupStats => Boolean(item));
  }, [isExpanded, isGroupView, stats]);

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

  // Shrunken-pill render path: takes the Group-View bottom slot and is
  // visually compact so it doesn't compete with the card grid. Clicking
  // expands to the full dock JSX below.
  if (isGroupView && !isExpanded) {
    return (
      <div className="catalogue-dock-region" ref={dockRegionRef}>
        <button
          type="button"
          className="catalogue-dock-shrunken"
          onClick={() => setIsExpanded(true)}
          aria-label="Expand group dock"
          aria-expanded={false}
        >
          {shrunkenIcons.map((group) => {
            const appearance = resolveCatalogueGroupAppearance(appearanceMap, group.groupKey, projectId);
            const label = appearance.label || group.groupKey;
            const firstLetter = (label?.trim()?.[0] || '?').toUpperCase();
            return (
              <span
                key={group.groupKey}
                className="catalogue-dock-shrunken__icon"
                aria-hidden="true"
              >
                {appearance.iconUrl ? (
                  <img src={appearance.iconUrl} alt="" draggable={false} />
                ) : (
                  <span className="catalogue-dock-shrunken__letter">{firstLetter}</span>
                )}
              </span>
            );
          })}
        </button>
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <div
        className="catalogue-dock-region"
        ref={(node) => {
          dockRegionRef.current = node;
          setDockRef(node);
        }}
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
            <IconTooltip label="Previous page (←)">
            <button
              type="button"
              className="catalogue-dock-control"
              onClick={() => goToPage(currentPage - 1, 'prev')}
              disabled={currentPage === 0 || isPaging}
              aria-label="Previous group page"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            </IconTooltip>
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
                    // In Group View mode the dock is a quick-jump affordance
                    // to the group detail page — applying a filter wouldn't
                    // do anything (Group View grid ignores the group filter).
                    if (isGroupView) {
                      navigate(`/g/${encodeURIComponent(group.groupKey)}`);
                      return;
                    }
                    onSelectGroup(group.groupKey === activeGroupKey ? null : group.groupKey);
                  }}
                />
              );
            })}
          </div>
          {pageCount > 1 && (
            <IconTooltip label="Next page (→)">
            <button
              type="button"
              className="catalogue-dock-control"
              onClick={() => goToPage(currentPage + 1, 'next')}
              disabled={currentPage >= pageCount - 1 || isPaging}
              aria-label="Next group page"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            </IconTooltip>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
