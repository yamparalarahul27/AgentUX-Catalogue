import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, ChevronDown, Plus, Search, SlidersHorizontal, X } from 'lucide-react';

import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueGridDensity } from './CatalogueGridDensity';
import { CatalogueFilterSheet } from './CatalogueFilterSheet';
import { CataloguePlatformDropdown } from './CataloguePlatformDropdown';
import { CatalogueViewToggle } from './CatalogueViewToggle';
import { Dropdown } from './Dropdown';

interface CatalogueToolbarProps {
  allFlows: string[];
  allMobileOs: { id: string; label: string }[];
  allWebPresets: { id: string; label: string }[];
  annotationLabels: string[];
  filterAnnotation: string[];
  filterFlow: string[];
  filterGroup: string[];
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  gridDensity: GridDensity;
  groups: string[];
  isSortLocked: boolean;
  // When the Quick Upload modal is open, the toolbar's primary button
  // doubles as "Upload All". Lets the user kick off the upload without
  // scrolling to the bottom of the modal.
  quickUploadOpen?: boolean;
  quickUploadQueueCount?: number;
  quickUploadIsUploading?: boolean;
  bookmarkFilterOn?: boolean;
  bookmarkCount?: number;
  onBookmarkFilterToggle?: () => void;
  onFilterAnnotationChange: (value: string[]) => void;
  onFilterGroupChange: (value: string[]) => void;
  onFilterFlowChange: (value: string[]) => void;
  onGridDensityChange: (value: GridDensity) => void;
  onFilterMobileOsChange: (value: string | null) => void;
  onFilterPlatformChange: (value: string | null) => void;
  onFilterThemeChange: (value: string | null) => void;
  onFilterWebPresetChange: (value: string | null) => void;
  onQuickUploadAll?: () => void;
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
  | 'annotation'
  | 'platform'
  | 'theme'
  | 'view';

const TOOLBAR_FILTER_KEY = 'catalogue:toolbar-visible-filters';
// First-time users see a clean toolbar — they opt filters in via Filters ▾.
// Existing users keep their localStorage selections.
const DEFAULT_VISIBLE_FILTERS: ToolbarFilterKey[] = [];

const FILTER_OPTIONS: Array<{ key: ToolbarFilterKey; label: string }> = [
  { key: 'flow', label: 'Flows' },
  { key: 'group', label: 'Groups' },
  { key: 'annotation', label: 'Annotations' },
  { key: 'platform', label: 'Platforms' },
  { key: 'theme', label: 'Themes' },
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
  // 'annotations-added' is intentionally not surfaced any more — the annotation
  // multi-select filter replaces it. The value is still parsed for backwards
  // compatibility (e.g. saved URLs) but no longer offered as a UI option.
  'annotations-added': 'Annotations added',
};

const VIEW_BY_VISIBLE_OPTIONS: CatalogueViewBy[] = ['all', 'comments-added'];

function CloseIcon() {
  return <X size={10} strokeWidth={3} />;
}

export function CatalogueToolbar({
  allFlows,
  allMobileOs,
  allWebPresets,
  annotationLabels,
  filterAnnotation,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterTheme,
  filterWebPreset,
  gridDensity,
  groups,
  isSortLocked,
  onFilterAnnotationChange,
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
  quickUploadOpen = false,
  quickUploadQueueCount = 0,
  quickUploadIsUploading = false,
  onQuickUploadAll,
  bookmarkFilterOn = false,
  bookmarkCount = 0,
  onBookmarkFilterToggle,
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

  const activeFilterCount =
    filterGroup.length +
    filterFlow.length +
    filterAnnotation.length +
    (filterPlatform ? 1 : 0) +
    (filterTheme ? 1 : 0) +
    (viewBy !== 'all' ? 1 : 0);

  const activePills: Array<{ key: string; label: string; onRemove: () => void }> = [];
  filterGroup.forEach((group) => activePills.push({
    key: `group:${group}`,
    label: `Group: ${group}`,
    onRemove: () => onFilterGroupChange(filterGroup.filter((g) => g !== group)),
  }));
  filterFlow.forEach((flow) => activePills.push({
    key: `flow:${flow}`,
    label: `Flow: ${flow}`,
    onRemove: () => onFilterFlowChange(filterFlow.filter((f) => f !== flow)),
  }));
  filterAnnotation.forEach((label) => activePills.push({
    key: `annotation:${label}`,
    label: `Annotation: ${label}`,
    onRemove: () => onFilterAnnotationChange(filterAnnotation.filter((value) => value !== label)),
  }));
  if (filterPlatform) {
    const presetLabel = allWebPresets.find((preset) => preset.id === filterWebPreset)?.label;
    const osLabel = allMobileOs.find((item) => item.id === filterMobileOs)?.label;
    const platformPillLabel = filterPlatform === 'web'
      ? presetLabel ? `Platform: Web · ${presetLabel}` : 'Platform: Web'
      : osLabel ? `Platform: Mobile · ${osLabel}` : 'Platform: Mobile';
    activePills.push({
      key: 'platform',
      label: platformPillLabel,
      onRemove: () => {
        onFilterPlatformChange(null);
        onFilterWebPresetChange(null);
        onFilterMobileOsChange(null);
      },
    });
  }
  if (filterTheme) activePills.push({ key: 'theme', label: `Theme: ${filterTheme}`, onRemove: () => onFilterThemeChange(null) });
  if (viewBy !== 'all') activePills.push({ key: 'viewBy', label: `View: ${VIEW_BY_LABELS[viewBy]}`, onRemove: () => onViewByChange('all') });

  function handleApplyFilters(filters: {
    annotation: string[];
    flow: string[];
    group: string[];
    mobileOs: string | null;
    platform: string | null;
    theme: string | null;
    viewBy: CatalogueViewBy;
    webPreset: string | null;
  }) {
    onFilterGroupChange(filters.group);
    onFilterFlowChange(filters.flow);
    onFilterAnnotationChange(filters.annotation);
    onFilterPlatformChange(filters.platform);
    onFilterThemeChange(filters.theme);
    onFilterWebPresetChange(filters.webPreset);
    onFilterMobileOsChange(filters.mobileOs);
    onViewByChange(filters.viewBy);
  }

  function toggleVisibleFilter(key: ToolbarFilterKey) {
    const isVisible = visibleFilters.has(key);

    if (isVisible) {
      if (key === 'flow') onFilterFlowChange([]);
      if (key === 'group') onFilterGroupChange([]);
      if (key === 'annotation') onFilterAnnotationChange([]);
      if (key === 'platform') {
        onFilterPlatformChange(null);
        onFilterWebPresetChange(null);
        onFilterMobileOsChange(null);
      }
      if (key === 'theme') onFilterThemeChange(null);
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
            <Search size={16} />
            <input
              type="text"
              placeholder="Search"
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Filters <ChevronDown size={14} /></span>
          </button>

          <div className="catalogue-filter-row catalogue-toolbar--desktop-only">
            {isFilterVisible('group') && (
              <Dropdown
                multiple
                searchable
                values={filterGroup}
                placeholder="Group"
                searchPlaceholder="Search groups…"
                options={groups.map((group) => ({ value: group, label: group }))}
                onMultiChange={onFilterGroupChange}
              />
            )}
            {isFilterVisible('flow') && (
              <Dropdown
                multiple
                searchable
                values={filterFlow}
                placeholder="Flow"
                searchPlaceholder="Search flows…"
                options={allFlows.map((flow) => ({ value: flow, label: flow }))}
                onMultiChange={onFilterFlowChange}
              />
            )}
            {isFilterVisible('annotation') && (
              <Dropdown
                multiple
                searchable
                values={filterAnnotation}
                placeholder="Annotation"
                searchPlaceholder="Search annotations…"
                options={annotationLabels.map((label) => ({ value: label, label }))}
                onMultiChange={onFilterAnnotationChange}
              />
            )}
            {isFilterVisible('platform') && (
              <CataloguePlatformDropdown
                platform={filterPlatform as 'web' | 'mobile' | null}
                webPreset={filterWebPreset}
                mobileOs={filterMobileOs}
                webPresets={allWebPresets}
                mobileOsList={allMobileOs}
                onChange={(next) => {
                  onFilterPlatformChange(next.platform);
                  onFilterWebPresetChange(next.webPreset);
                  onFilterMobileOsChange(next.mobileOs);
                }}
              />
            )}
            {isFilterVisible('theme') && (
              <Dropdown
                value={filterTheme}
                placeholder="Theme"
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={onFilterThemeChange}
              />
            )}
            {isFilterVisible('view') && (
              <Dropdown
                value={viewBy}
                placeholder="View by"
                options={VIEW_BY_VISIBLE_OPTIONS.map((option) => ({ value: option, label: VIEW_BY_LABELS[option] }))}
                onChange={(value) => onViewByChange((value || 'all') as CatalogueViewBy)}
              />
            )}
          </div>

          <>
            {/* Mobile: filter icon pill — hidden on desktop */}
            <button
              type="button"
              className="catalogue-toolbar-pill catalogue-toolbar--mobile-only"
              onClick={() => setFilterSheetOpen(true)}
              title="Filter"
            >
              <SlidersHorizontal size={16} />
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
          {onBookmarkFilterToggle && (
            <button
              type="button"
              className={`catalogue-toolbar-bookmark catalogue-toolbar--desktop-only ${bookmarkFilterOn ? 'is-active' : ''}`}
              onClick={onBookmarkFilterToggle}
              title={bookmarkFilterOn ? 'Show all screenshots' : 'Show only your bookmarks'}
              aria-pressed={bookmarkFilterOn}
            >
              <Bookmark size={14} fill={bookmarkFilterOn ? 'currentColor' : 'none'} />
              <span>Bookmarked{bookmarkFilterOn && bookmarkCount > 0 ? ` (${bookmarkCount})` : ''}</span>
            </button>
          )}
          {/* Desktop button — flips to "Upload All (N)" while the Quick
              Upload modal is open so the user can trigger the upload from
              the same spot. Disabled while uploading or when queue empty. */}
          {quickUploadOpen ? (
            <button
              className="btn-primary catalogue-toolbar--desktop-only"
              onClick={onQuickUploadAll}
              disabled={quickUploadIsUploading || quickUploadQueueCount === 0}
            >
              {quickUploadIsUploading
                ? 'Uploading…'
                : `Upload All${quickUploadQueueCount > 0 ? ` (${quickUploadQueueCount})` : ''}`}
            </button>
          ) : (
            <button className="btn-primary catalogue-toolbar--desktop-only" onClick={onQuickUploadClick}>
              Quick Upload
            </button>
          )}

          {/* Mobile pills - hidden on desktop */}
          <button type="button" className="catalogue-toolbar-pill catalogue-toolbar--mobile-only" onClick={openMobileSearch}>
            <Search size={16} strokeWidth={2.5} />
            {searchQuery && <span className="catalogue-toolbar-pill__dot" />}
          </button>
          <button
            type="button"
            className="catalogue-toolbar-pill catalogue-toolbar-pill--accent catalogue-toolbar--mobile-only"
            onClick={onQuickUploadClick}
            title="Quick upload"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Mobile expandable search row - below toolbar */}
      {mobileSearchOpen && (
        <div className="catalogue-mobile-search-row">
          <div className="catalogue-mobile-search-input">
            <Search size={16} />
            <input
              ref={mobileSearchRef}
              type="text"
              placeholder="Search"
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
                  <span className="catalogue-filter-menu__check">{selected ? <Check size={12} /> : null}</span>
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
        filterAnnotation={filterAnnotation}
        filterPlatform={filterPlatform}
        filterTheme={filterTheme}
        filterWebPreset={filterWebPreset}
        filterMobileOs={filterMobileOs}
        viewBy={viewBy}
        groups={groups}
        allFlows={allFlows}
        allWebPresets={allWebPresets}
        allMobileOs={allMobileOs}
        annotationLabels={annotationLabels}
        onApply={handleApplyFilters}
      />

    </div>
  );
}
