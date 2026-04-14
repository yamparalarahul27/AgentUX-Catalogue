import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueGridDensity } from './CatalogueGridDensity';
import { CatalogueFilterSheet } from './CatalogueFilterSheet';
import { CatalogueViewToggle } from './CatalogueViewToggle';
import { Dropdown } from './Dropdown';

interface CatalogueToolbarProps {
  allFlows: string[];
  allMobileOs: { id: string; label: string }[];
  allWebPresets: { id: string; label: string }[];
  filterFlow: string | null;
  filterGroup: string | null;
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  gridDensity: GridDensity;
  groups: string[];
  isSortLocked: boolean;
  onFilterGroupChange: (value: string | null) => void;
  onFilterFlowChange: (value: string | null) => void;
  onGridDensityChange: (value: GridDensity) => void;
  onFilterMobileOsChange: (value: string | null) => void;
  onFilterPlatformChange: (value: string | null) => void;
  onFilterThemeChange: (value: string | null) => void;
  onFilterWebPresetChange: (value: string | null) => void;
  onQuickUploadClick: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: CatalogueSortOption) => void;
  onViewByChange: (value: CatalogueViewBy) => void;
  onViewModeChange: (value: CatalogueViewMode) => void;
  searchQuery: string;
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
  viewMode: CatalogueViewMode;
}

type ToolbarFilterKey =
  | 'flow'
  | 'group'
  | 'platform'
  | 'theme'
  | 'webPreset'
  | 'mobileOs'
  | 'view';

const TOOLBAR_FILTER_KEY = 'catalogue:toolbar-visible-filters';
const DEFAULT_VISIBLE_FILTERS: ToolbarFilterKey[] = ['flow', 'group', 'platform', 'theme', 'view'];

const FILTER_OPTIONS: Array<{ key: ToolbarFilterKey; label: string }> = [
  { key: 'flow', label: 'Flows' },
  { key: 'group', label: 'Groups' },
  { key: 'platform', label: 'Platforms' },
  { key: 'theme', label: 'Themes' },
  { key: 'webPreset', label: 'Web presets' },
  { key: 'mobileOs', label: 'Mobile OS' },
  { key: 'view', label: 'View' },
];

function parseVisibleFilters(value: string | null): Set<ToolbarFilterKey> {
  if (!value) return new Set(DEFAULT_VISIBLE_FILTERS);

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE_FILTERS);
    const next = parsed.filter(
      (item): item is ToolbarFilterKey => FILTER_OPTIONS.some((option) => option.key === item),
    );
    return new Set(next);
  } catch {
    return new Set(DEFAULT_VISIBLE_FILTERS);
  }
}

const VIEW_BY_LABELS: Record<CatalogueViewBy, string> = {
  'all': 'All screen families',
  'comments-added': 'Comments added',
  'annotations-added': 'Annotations added',
};

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CatalogueToolbar({
  allFlows,
  allMobileOs,
  allWebPresets,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterTheme,
  filterWebPreset,
  gridDensity,
  groups,
  isSortLocked,
  onFilterGroupChange,
  onFilterFlowChange,
  onGridDensityChange,
  onFilterMobileOsChange,
  onFilterPlatformChange,
  onFilterThemeChange,
  onFilterWebPresetChange,
  onQuickUploadClick,
  onSearchChange,
  onSortByChange,
  onViewByChange,
  onViewModeChange,
  searchQuery,
  sortBy,
  viewBy,
  viewMode,
}: CatalogueToolbarProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState<Set<ToolbarFilterKey>>(() => {
    try {
      return parseVisibleFilters(window.localStorage.getItem(TOOLBAR_FILTER_KEY));
    } catch {
      return new Set(DEFAULT_VISIBLE_FILTERS);
    }
  });
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  function openMobileSearch() {
    setMobileSearchOpen(true);
    requestAnimationFrame(() => mobileSearchRef.current?.focus());
  }

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    onSearchChange('');
    mobileSearchRef.current?.blur();
  }

  useEffect(() => {
    if (!filterMenuOpen) return undefined;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setFilterMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterMenuOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [filterMenuOpen]);

  useLayoutEffect(() => {
    if (!filterMenuOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const preferredWidth = 220;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - preferredWidth - 12));
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: preferredWidth,
    });
  }, [filterMenuOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOOLBAR_FILTER_KEY, JSON.stringify(Array.from(visibleFilters)));
    } catch {
      // ignore persistence failures
    }
  }, [visibleFilters]);

  const activeFilterCount = [
    filterGroup, filterFlow, filterPlatform, filterTheme, filterWebPreset, filterMobileOs,
  ].filter(Boolean).length + (viewBy !== 'all' ? 1 : 0);

  const activePills: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filterGroup) activePills.push({ key: 'group', label: `Group: ${filterGroup}`, onRemove: () => onFilterGroupChange(null) });
  if (filterFlow) activePills.push({ key: 'flow', label: `Flow: ${filterFlow}`, onRemove: () => onFilterFlowChange(null) });
  if (filterPlatform) activePills.push({ key: 'platform', label: `Platform: ${filterPlatform}`, onRemove: () => onFilterPlatformChange(null) });
  if (filterTheme) activePills.push({ key: 'theme', label: `Theme: ${filterTheme}`, onRemove: () => onFilterThemeChange(null) });
  if (filterWebPreset) activePills.push({ key: 'webPreset', label: `Preset: ${filterWebPreset}`, onRemove: () => onFilterWebPresetChange(null) });
  if (filterMobileOs) activePills.push({ key: 'mobileOs', label: `OS: ${filterMobileOs}`, onRemove: () => onFilterMobileOsChange(null) });
  if (viewBy !== 'all') activePills.push({ key: 'viewBy', label: `View: ${VIEW_BY_LABELS[viewBy]}`, onRemove: () => onViewByChange('all') });

  function handleApplyFilters(filters: {
    flow: string | null;
    group: string | null;
    mobileOs: string | null;
    platform: string | null;
    theme: string | null;
    viewBy: CatalogueViewBy;
    webPreset: string | null;
  }) {
    onFilterGroupChange(filters.group);
    onFilterFlowChange(filters.flow);
    onFilterPlatformChange(filters.platform);
    onFilterThemeChange(filters.theme);
    onFilterWebPresetChange(filters.webPreset);
    onFilterMobileOsChange(filters.mobileOs);
    onViewByChange(filters.viewBy);
  }

  function toggleVisibleFilter(key: ToolbarFilterKey) {
    const isVisible = visibleFilters.has(key);

    if (isVisible) {
      if (key === 'flow') onFilterFlowChange(null);
      if (key === 'group') onFilterGroupChange(null);
      if (key === 'platform') onFilterPlatformChange(null);
      if (key === 'theme') onFilterThemeChange(null);
      if (key === 'webPreset') onFilterWebPresetChange(null);
      if (key === 'mobileOs') onFilterMobileOsChange(null);
      if (key === 'view') onViewByChange('all');
    }

    setVisibleFilters((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isFilterVisible(key: ToolbarFilterKey) {
    return visibleFilters.has(key);
  }

  return (
    <div className="catalogue-toolbar-wrapper">
      <div className="catalogue-toolbar">
        <div className="catalogue-toolbar-left">
          <div className="catalogue-search catalogue-search--desktop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search screen families..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          <button
            ref={triggerRef}
            type="button"
            className="btn-secondary catalogue-filter-toggle catalogue-toolbar--desktop-only"
            aria-expanded={filterMenuOpen}
            aria-controls="catalogue-filter-menu"
            onClick={() => setFilterMenuOpen((previous) => !previous)}
          >
            + Filter
          </button>

          {isFilterVisible('group') && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterGroup}
              placeholder="Group"
              options={groups.map((group) => ({ value: group, label: group }))}
              onChange={onFilterGroupChange}
            />
          )}
          {isFilterVisible('flow') && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterFlow}
              placeholder="Flow"
              options={allFlows.map((flow) => ({ value: flow, label: flow }))}
              onChange={onFilterFlowChange}
            />
          )}
          {isFilterVisible('platform') && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterPlatform}
              placeholder="Platform"
              options={[
                { value: 'mobile', label: 'Mobile' },
                { value: 'web', label: 'Web' },
              ]}
              onChange={onFilterPlatformChange}
            />
          )}
          {isFilterVisible('theme') && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterTheme}
              placeholder="Theme"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={onFilterThemeChange}
            />
          )}
          {isFilterVisible('webPreset') && filterPlatform === 'web' && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterWebPreset}
              placeholder="Web preset"
              options={allWebPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
              onChange={onFilterWebPresetChange}
            />
          )}
          {isFilterVisible('mobileOs') && filterPlatform === 'mobile' && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={filterMobileOs}
              placeholder="Mobile OS"
              options={allMobileOs.map((item) => ({ value: item.id, label: item.label }))}
              onChange={onFilterMobileOsChange}
            />
          )}
          {isFilterVisible('view') && (
            <Dropdown
              className="catalogue-toolbar--desktop-only"
              value={viewBy}
              placeholder="View by"
              options={[
                { value: 'all', label: 'All screen families' },
                { value: 'comments-added', label: 'Comments added' },
                { value: 'annotations-added', label: 'Annotations added' },
              ]}
              onChange={(value) => onViewByChange((value || 'all') as CatalogueViewBy)}
            />
          )}

          <>
            {/* Mobile: filter icon pill — hidden on desktop */}
            <button
              type="button"
              className="catalogue-toolbar-pill catalogue-toolbar--mobile-only"
              onClick={() => setFilterSheetOpen(true)}
              title="Filter"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="8" cy="6" r="2" fill="currentColor" />
                <circle cx="16" cy="12" r="2" fill="currentColor" />
                <circle cx="10" cy="18" r="2" fill="currentColor" />
              </svg>
              {activeFilterCount > 0 && <span className="catalogue-toolbar-pill__badge">{activeFilterCount}</span>}
            </button>

            {/* Sort dropdown — desktop shows text, mobile styled as icon pill via CSS */}
            <Dropdown
              value={sortBy}
              placeholder={isSortLocked ? 'Sort (auto)' : 'Sort'}
              options={[
                { value: 'date-desc', label: 'Date: Latest' },
                { value: 'date-desc-global', label: 'Date: Latest (All groups)' },
                { value: 'date-asc', label: 'Date: Oldest' },
                { value: 'name-asc', label: 'Name: A-Z' },
              ]}
              onChange={(value) => onSortByChange((value || 'date-desc') as CatalogueSortOption)}
              disabled={isSortLocked}
              className="catalogue-sort-dropdown"
            />

            <CatalogueViewToggle value={viewMode} onChange={onViewModeChange} />

            {viewMode === 'grid' && (
              <CatalogueGridDensity value={gridDensity} onChange={onGridDensityChange} />
            )}
          </>

        </div>

        <div className="catalogue-toolbar-right">
          {/* Desktop buttons - hidden on mobile */}
          <button className="btn-primary catalogue-toolbar--desktop-only" onClick={onQuickUploadClick}>
            Quick Upload
          </button>

          {/* Mobile pills - hidden on desktop */}
          <button type="button" className="catalogue-toolbar-pill catalogue-toolbar--mobile-only" onClick={openMobileSearch}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchQuery && <span className="catalogue-toolbar-pill__dot" />}
          </button>
          <button
            type="button"
            className="catalogue-toolbar-pill catalogue-toolbar-pill--accent catalogue-toolbar--mobile-only"
            onClick={onQuickUploadClick}
            title="Quick upload"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile expandable search row - below toolbar */}
      {mobileSearchOpen && (
        <div className="catalogue-mobile-search-row">
          <div className="catalogue-mobile-search-input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={mobileSearchRef}
              type="text"
              placeholder="Search screen families..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <button type="button" className="catalogue-mobile-search-cancel" onClick={closeMobileSearch}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {filterMenuOpen && createPortal(
        <div ref={menuRef} id="catalogue-filter-menu" className="catalogue-filter-menu" style={menuStyle}>
          <div className="catalogue-filter-menu__title">Visible filters</div>
          <div className="catalogue-filter-menu__list">
            {FILTER_OPTIONS.map((option) => {
              const selected = visibleFilters.has(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`catalogue-filter-menu__item ${selected ? 'is-selected' : ''}`}
                  onClick={() => toggleVisibleFilter(option.key)}
                >
                  <span>{option.label}</span>
                  <span className="catalogue-filter-menu__check">{selected ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}

      {activePills.length > 0 && (
        <div className="catalogue-filter-pills catalogue-filter-pills--mobile">
          {activePills.map((pill) => (
            <button key={pill.key} type="button" className="catalogue-filter-pill" onClick={pill.onRemove}>
              <span>{pill.label}</span>
              <span className="catalogue-filter-pill__close"><CloseIcon /></span>
            </button>
          ))}
        </div>
      )}

      <CatalogueFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filterGroup={filterGroup}
        filterFlow={filterFlow}
        filterPlatform={filterPlatform}
        filterTheme={filterTheme}
        filterWebPreset={filterWebPreset}
        filterMobileOs={filterMobileOs}
        viewBy={viewBy}
        groups={groups}
        allFlows={allFlows}
        allWebPresets={allWebPresets}
        allMobileOs={allMobileOs}
        onApply={handleApplyFilters}
      />

    </div>
  );
}
