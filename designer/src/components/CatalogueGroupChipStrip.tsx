import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

import {
  resolveCatalogueGroupAppearance,
  type CatalogueGroupAppearanceMap,
} from '../lib/catalogue-group-appearance';
import {
  sortGroups,
  type CatalogueGroupSortMode,
  type CatalogueGroupStats,
} from '../lib/catalogue-group-stats';
import { CatalogueGroupChip } from './CatalogueGroupChip';

interface CatalogueGroupChipStripProps {
  stats: CatalogueGroupStats[];
  appearanceMap: CatalogueGroupAppearanceMap;
  projectId: string | null;
  activeGroupKey: string | null;
  sortMode: CatalogueGroupSortMode;
  recencyHours: number;
  onSelectGroup: (groupKey: string | null) => void;
  onChangeSort: (mode: CatalogueGroupSortMode) => void;
}

const SORT_LABEL: Record<CatalogueGroupSortMode, string> = {
  recent: 'Recent',
  alpha: 'A–Z',
  count: 'Count',
};

// Full ticker loop duration in seconds. Fixed regardless of chip count.
const TICKER_DURATION_SECONDS = 200;

export function CatalogueGroupChipStrip({
  stats,
  appearanceMap,
  projectId,
  activeGroupKey,
  sortMode,
  recencyHours,
  onSelectGroup,
  onChangeSort,
}: CatalogueGroupChipStripProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortStyle, setSortStyle] = useState<CSSProperties>({});
  const [hoverPaused, setHoverPaused] = useState(false);
  // Default to paused so the strip is scannable on first paint. Users opt
  // into motion via the Resume option in the sort menu.
  const [manualPaused, setManualPaused] = useState(true);
  const isPaused = hoverPaused || manualPaused;

  const ordered = useMemo(
    () => sortGroups(stats, sortMode, (key) => resolveCatalogueGroupAppearance(appearanceMap, key, projectId).label || key),
    [appearanceMap, projectId, sortMode, stats],
  );

  useEffect(() => {
    if (!sortOpen) return undefined;
    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      if (sortTriggerRef.current?.contains(target)) return;
      const menu = document.getElementById('catalogue-chip-sort-menu');
      if (menu?.contains(target)) return;
      setSortOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSortOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen]);

  function positionFromTrigger(trigger: HTMLElement, width: number): CSSProperties {
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 200 && rect.top > spaceBelow) {
      return {
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 6,
        left,
        width,
        maxHeight: Math.min(360, rect.top - 16),
      };
    }
    return {
      position: 'fixed',
      top: rect.bottom + 6,
      left,
      width,
      maxHeight: Math.min(360, spaceBelow - 16),
    };
  }

  function toggleSort() {
    if (sortOpen) {
      setSortOpen(false);
      return;
    }
    if (!sortTriggerRef.current) return;
    setSortStyle(positionFromTrigger(sortTriggerRef.current, 220));
    setSortOpen(true);
  }

  const trackStyle: CSSProperties = {
    animationDuration: `${TICKER_DURATION_SECONDS}s`,
    animationPlayState: isPaused ? 'paused' : 'running',
  };

  return (
    <div className="catalogue-chip-strip">
      <div className="catalogue-chip-strip__row">
        <button
          type="button"
          className={`catalogue-chip catalogue-chip--all${activeGroupKey === null ? ' catalogue-chip--active' : ''}`}
          onClick={() => onSelectGroup(null)}
          aria-pressed={activeGroupKey === null}
        >
          <span className="catalogue-chip__label">All</span>
        </button>

        <div
          className={`catalogue-chip-strip__ticker${manualPaused ? ' catalogue-chip-strip__ticker--scroll' : ''}`}
          onMouseEnter={() => setHoverPaused(true)}
          onMouseLeave={() => setHoverPaused(false)}
          onFocusCapture={() => setHoverPaused(true)}
          onBlurCapture={() => setHoverPaused(false)}
        >
          <div ref={trackRef} className="catalogue-chip-strip__track" style={trackStyle}>
            {[0, 1].map((copyIndex) => (
              <div key={copyIndex} className="catalogue-chip-strip__copy" aria-hidden={copyIndex === 1}>
                {ordered.map((item) => (
                  <CatalogueGroupChip
                    key={`${copyIndex}:${item.groupKey}`}
                    groupKey={item.groupKey}
                    count={item.count}
                    lastAddedAt={item.lastAddedAt}
                    appearance={resolveCatalogueGroupAppearance(appearanceMap, item.displayKey, projectId)}
                    active={item.groupKey === activeGroupKey}
                    recencyHours={recencyHours}
                    // Click-to-toggle: re-tapping the active chip clears
                    // the filter, so the strip can be the sole affordance
                    // for group filter state. (Pairs with hiding the
                    // duplicate `Group: X` pill from the active-filters
                    // row when the strip is visible.)
                    onSelect={() => onSelectGroup(item.groupKey === activeGroupKey ? null : item.groupKey)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          ref={sortTriggerRef}
          className="catalogue-chip-strip__sort"
          aria-expanded={sortOpen}
          onClick={toggleSort}
          title="Sort groups"
        >
          <span style={{ marginRight: 4 }}>{SORT_LABEL[sortMode]}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </div>

      {sortOpen && createPortal(
        <div id="catalogue-chip-sort-menu" className="catalogue-chip-sort-menu" style={sortStyle}>
          <div className="catalogue-chip-sort-menu__title">Sort groups by</div>
          {(['recent', 'alpha', 'count'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`catalogue-chip-sort-menu__item${mode === sortMode ? ' is-active' : ''}`}
              onClick={() => {
                onChangeSort(mode);
                setSortOpen(false);
              }}
            >
              {mode === 'recent' && 'Recently added'}
              {mode === 'alpha' && 'Alphabetical'}
              {mode === 'count' && 'Most screenshots'}
              {mode === sortMode && <span className="catalogue-chip-sort-menu__check"><Check size={12} /></span>}
            </button>
          ))}
          <div className="catalogue-chip-sort-menu__divider" role="separator" />
          <button
            type="button"
            className="catalogue-chip-sort-menu__item"
            onClick={() => {
              setManualPaused((prev) => !prev);
              setSortOpen(false);
            }}
          >
            {manualPaused ? 'Resume ticker' : 'Pause ticker'}
            {manualPaused && <span className="catalogue-chip-sort-menu__check"><Check size={12} /></span>}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
