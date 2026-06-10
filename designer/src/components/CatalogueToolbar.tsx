import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Check, ChevronDown, Clock, Eye, LayoutGrid, Palette, Plus, Rows3, Save, Search, Share2, SlidersHorizontal, Smartphone, Tag, Workflow, X } from 'lucide-react';

import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import type { ToolbarHideableKey, ToolbarPinnableKey } from '../types';
import {
  resolveCatalogueGroupAppearance,
  type CatalogueGroupAppearanceMap,
} from '../lib/catalogue-group-appearance';
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
  // Label-derived chip pools (Phase 4). Empty arrays hide the chip section.
  allPageTypes?: string[];
  allUiElements?: string[];
  allUxPatterns?: string[];
  allScreenStates?: string[];
  filterAnnotation: string[];
  filterFlow: string[];
  filterGroup: string[];
  filterMobileOs: string | null;
  filterPageType?: string[];
  filterPlatform: string | null;
  filterScreenState?: string | null;
  filterTheme: string | null;
  filterUiElement?: string[];
  filterUxPattern?: string[];
  filterWebPreset: string | null;
  gridDensity: GridDensity;
  groups: string[];
  // Appearance map used to render group icons inside the Group filter
  // dropdown options. The toolbar doesn't need to subscribe — when
  // appearance changes the parent re-renders and a new map flows in.
  groupAppearanceMap: CatalogueGroupAppearanceMap;
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
  onOpenShare?: () => void;
  onOpenSearch?: () => void;
  onFilterAnnotationChange: (value: string[]) => void;
  onFilterGroupChange: (value: string[]) => void;
  onFilterFlowChange: (value: string[]) => void;
  onGridDensityChange: (value: GridDensity) => void;
  onFilterMobileOsChange: (value: string | null) => void;
  onFilterPageTypeChange?: (value: string[]) => void;
  onFilterPlatformChange: (value: string | null) => void;
  onFilterScreenStateChange?: (value: string | null) => void;
  onFilterThemeChange: (value: string | null) => void;
  onFilterUiElementChange?: (value: string[]) => void;
  onFilterUxPatternChange?: (value: string[]) => void;
  onFilterWebPresetChange: (value: string | null) => void;
  onQuickUploadAll?: () => void;
  onQuickUploadClick?: () => void;
  // Resets every filter + search + sort back to defaults. The "Clear all"
  // pill at the bottom of the toolbar fires this. Defined upstream in
  // `use-catalogue-filter-state.ts` so the toolbar can't drift from
  // the canonical wipe list.
  onClearAllFilters: () => void;
  onSortByChange: (value: CatalogueSortOption) => void;
  onViewByChange: (value: CatalogueViewBy) => void;
  onViewModeChange: (value: CatalogueViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
  viewMode: CatalogueViewMode;
  // Owns where the Flow filter renders (dropdown vs strip). Lifted to
  // the parent so Catalogue.tsx can render the strip below the toolbar
  // when 'strip' is selected.
  flowPresentation: FlowPresentation;
  onFlowPresentationChange: (value: FlowPresentation) => void;
  // Fired whenever the user toggles a filter row in the Filters ▾
  // menu — Catalogue mirrors the Flow bit so it knows whether to
  // render the chip strip. Toolbar still owns the persistence.
  onVisibleFiltersChange?: (filters: ToolbarFilterKey[]) => void;
  // Per-user toolbar customization sourced from catalogue_settings.
  // Empty defaults match the pre-customization behaviour: nothing
  // hidden, nothing pinned.
  toolbarHiddenKeys?: ToolbarHideableKey[];
  toolbarPinnedKeys?: ToolbarPinnableKey[];
}

export type { ToolbarFilterKey };

type ToolbarFilterKey =
  | 'flow'
  | 'group'
  | 'annotation'
  | 'uiElement'
  | 'platform'
  | 'theme'
  | 'view';

const TOOLBAR_FILTER_KEY = 'catalogue:toolbar-visible-filters';
// First-time users see Group and Flow filters out of the box — these
// are the two most-used dimensions and a fresh teammate landing on a
// filtered-empty state with no visible filters had no idea why. Users
// who've explicitly toggled either off keep their localStorage choice;
// the default only applies when nothing is stored yet.
const DEFAULT_VISIBLE_FILTERS: ToolbarFilterKey[] = ['group', 'flow'];

// Where the Flow filter renders when it's enabled — either a compact
// dropdown in the toolbar or an expanded chip strip below it. Mutually
// exclusive (one or the other, never both). Default is 'dropdown' to
// match the original behaviour; users opt into 'strip' via a toggle
// next to the Flow row in the Filters ▾ menu.
export type FlowPresentation = 'dropdown' | 'strip';
export const FLOW_PRESENTATION_KEY = 'catalogue:flow-presentation';
export const DEFAULT_FLOW_PRESENTATION: FlowPresentation = 'dropdown';

export function parseFlowPresentation(value: string | null): FlowPresentation {
  return value === 'strip' || value === 'dropdown' ? value : DEFAULT_FLOW_PRESENTATION;
}

const FILTER_OPTIONS: Array<{ key: ToolbarFilterKey; label: string; icon: React.ReactNode }> = [
  { key: 'flow', label: 'Flows', icon: <Workflow size={13} /> },
  { key: 'group', label: 'Groups', icon: <LayoutGrid size={13} /> },
  { key: 'annotation', label: 'Annotations', icon: <Tag size={13} /> },
  { key: 'uiElement', label: 'UI Elements', icon: <Boxes size={13} /> },
  { key: 'platform', label: 'Platforms', icon: <Smartphone size={13} /> },
  { key: 'theme', label: 'Themes', icon: <Palette size={13} /> },
  { key: 'view', label: 'View', icon: <Eye size={13} /> },
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
  allPageTypes = [],
  allUiElements = [],
  allUxPatterns = [],
  allScreenStates = [],
  filterAnnotation,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPageType = [],
  filterPlatform,
  filterScreenState = null,
  filterTheme,
  filterUiElement = [],
  filterUxPattern = [],
  filterWebPreset,
  gridDensity,
  groups,
  groupAppearanceMap,
  isSortLocked,
  onFilterAnnotationChange,
  onFilterGroupChange,
  onFilterFlowChange,
  onGridDensityChange,
  onFilterMobileOsChange,
  onFilterPageTypeChange,
  onFilterPlatformChange,
  onFilterScreenStateChange,
  onFilterThemeChange,
  onFilterUiElementChange,
  onFilterUxPatternChange,
  onFilterWebPresetChange,
  onQuickUploadClick,
  onClearAllFilters,
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
  onOpenShare,
  onOpenSearch,
  searchQuery,
  onSearchQueryChange,
  sortBy,
  viewBy,
  viewMode,
  flowPresentation,
  onFlowPresentationChange,
  onVisibleFiltersChange,
  toolbarHiddenKeys = [],
  toolbarPinnedKeys = [],
}: CatalogueToolbarProps) {
  const isHidden = (key: ToolbarHideableKey) => toolbarHiddenKeys.includes(key);
  const isPinned = (key: ToolbarPinnableKey) => toolbarPinnedKeys.includes(key);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // savedFilterButtonRef stays for layout/positioning needs; the save
  // animation no longer flies to it (it now uses the floppy +
  // screenshot crumple choreography anchored at the source rect).
  const savedFilterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [visibleFilters, setVisibleFilters] = useState<Set<ToolbarFilterKey>>(() => {
    try {
      return parseVisibleFilters(window.localStorage.getItem(TOOLBAR_FILTER_KEY));
    } catch {
      return new Set(DEFAULT_VISIBLE_FILTERS);
    }
  });
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  // Sticky-stuck detection: a 1px sentinel sits immediately before the
  // toolbar wrapper. When the sentinel scrolls out of view, the wrapper
  // is pinned at top:0 — we apply `.is-stuck` so iOS PWA standalone mode
  // can add `padding-top: env(safe-area-inset-top)` and keep the
  // black-translucent status bar from overlapping the toolbar icons.
  // useLayoutEffect + a synchronous bounding-rect check seeds the
  // initial state before paint so reloading the PWA while scrolled past
  // the toolbar doesn't flash an un-stuck frame.
  const stickySentinelRef = useRef<HTMLDivElement | null>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);

  useLayoutEffect(() => {
    const sentinel = stickySentinelRef.current;
    if (!sentinel) return undefined;
    setToolbarStuck(sentinel.getBoundingClientRect().bottom <= 0);
    const observer = new IntersectionObserver(
      ([entry]) => setToolbarStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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
    onVisibleFiltersChange?.(Array.from(visibleFilters));
  }, [visibleFilters, onVisibleFiltersChange]);

  const activeFilterCount =
    filterGroup.length +
    filterFlow.length +
    filterAnnotation.length +
    filterUiElement.length +
    (filterPlatform ? 1 : 0) +
    (filterTheme ? 1 : 0) +
    (viewBy !== 'all' ? 1 : 0);

  const activePills: Array<{ key: string; label: string; onRemove: () => void }> = [];
  // Surface the active search query as a removable pill — otherwise it
  // sits invisibly (a search-result click sets searchQuery to the
  // screenshot's full name) and the user has no affordance to escape
  // the scoped catalogue except Clear all.
  if (searchQuery.trim().length > 0) {
    activePills.push({
      key: 'search',
      label: `Search: ${searchQuery}`,
      onRemove: () => onSearchQueryChange(''),
    });
  }
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
  filterUiElement.forEach((value) => activePills.push({
    key: `ui:${value}`,
    label: `UI Element: ${value}`,
    onRemove: () => onFilterUiElementChange?.(filterUiElement.filter((current) => current !== value)),
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
    pageType: string[];
    platform: string | null;
    screenState: string | null;
    theme: string | null;
    uiElement: string[];
    uxPattern: string[];
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
    onFilterPageTypeChange?.(filters.pageType);
    onFilterUiElementChange?.(filters.uiElement);
    onFilterUxPatternChange?.(filters.uxPattern);
    onFilterScreenStateChange?.(filters.screenState);
    onViewByChange(filters.viewBy);
  }

  function toggleVisibleFilter(key: ToolbarFilterKey) {
    const isVisible = visibleFilters.has(key);

    if (isVisible) {
      if (key === 'flow') onFilterFlowChange([]);
      if (key === 'group') onFilterGroupChange([]);
      if (key === 'annotation') onFilterAnnotationChange([]);
      if (key === 'uiElement') onFilterUiElementChange?.([]);
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
    <>
      <div
        ref={stickySentinelRef}
        aria-hidden="true"
        className="catalogue-toolbar-sticky-sentinel"
      />
    <div className={`catalogue-toolbar-wrapper${toolbarStuck ? ' is-stuck' : ''}`}>
      <div className="catalogue-toolbar">
        <div className="catalogue-toolbar-left">
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
                leadingIcon={<LayoutGrid size={13} />}
                options={groups.map((group) => {
                  const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, group, null);
                  return {
                    value: group,
                    label: group,
                    icon: appearance.iconUrl ? (
                      <img
                        src={appearance.iconUrl}
                        alt=""
                        aria-hidden="true"
                        className="dropdown__item-icon-img"
                      />
                    ) : (
                      <LayoutGrid size={13} />
                    ),
                  };
                })}
                onMultiChange={onFilterGroupChange}
              />
            )}
            {isFilterVisible('flow') && flowPresentation === 'dropdown' && (
              <Dropdown
                multiple
                searchable
                variant="chips"
                values={filterFlow}
                placeholder="Flow"
                searchPlaceholder="Search flows…"
                leadingIcon={<Workflow size={13} />}
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
                leadingIcon={<Tag size={13} />}
                options={annotationLabels.map((label) => ({ value: label, label }))}
                onMultiChange={onFilterAnnotationChange}
              />
            )}
            {isFilterVisible('uiElement') && allUiElements.length > 0 && (
              <Dropdown
                multiple
                searchable
                values={filterUiElement}
                placeholder="UI Element"
                searchPlaceholder="Search UI elements…"
                leadingIcon={<Boxes size={13} />}
                options={allUiElements.map((value) => ({ value, label: value }))}
                onMultiChange={(values) => onFilterUiElementChange?.(values)}
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
                leadingIcon={<Palette size={13} />}
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
                leadingIcon={<Eye size={13} />}
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
            {!isHidden('sort') && (
              <Dropdown
                value={sortBy}
                placeholder={isSortLocked ? 'Sort (auto)' : 'Sort'}
                options={[
                  { value: 'date-desc-global', label: 'Latest', icon: <Clock size={13} /> },
                  { value: 'name-asc', label: 'Group View', icon: <LayoutGrid size={13} /> },
                ]}
                onChange={(value) => onSortByChange((value || 'date-desc-global') as CatalogueSortOption)}
                disabled={isSortLocked}
                className="catalogue-sort-dropdown"
              />
            )}

            <CatalogueViewToggle
              value={viewMode}
              onChange={onViewModeChange}
              hideStack={isHidden('density_stack')}
              hideGallery={isHidden('density_gallery')}
            />

            {viewMode === 'grid' && (
              <CatalogueGridDensity value={gridDensity} onChange={onGridDensityChange} />
            )}
          </>

        </div>

        <div className="catalogue-toolbar-right">
          {onOpenSearch && (
            <button
              type="button"
              className="catalogue-toolbar-search catalogue-toolbar--desktop-only"
              onClick={onOpenSearch}
              title="Search catalogue (press / )"
              aria-label="Search catalogue"
            >
              <Search size={16} />
            </button>
          )}
          {onOpenShare && !isHidden('share') && (
            <button
              type="button"
              className="catalogue-toolbar-bookmark catalogue-toolbar--desktop-only"
              onClick={onOpenShare}
              title="Share this view"
              aria-label="Share this view"
            >
              <Share2 size={16} />
            </button>
          )}
          {onBookmarkFilterToggle && !isHidden('save') && (
            <button
              type="button"
              ref={savedFilterButtonRef}
              className={`catalogue-toolbar-bookmark catalogue-toolbar--desktop-only ${bookmarkFilterOn ? 'is-active' : ''}`}
              onClick={onBookmarkFilterToggle}
              title={
                bookmarkFilterOn
                  ? 'Show all screenshots'
                  : `Show only Saved${bookmarkCount > 0 ? ` (${bookmarkCount})` : ''}`
              }
              aria-label={bookmarkFilterOn ? 'Show all screenshots' : 'Show only Saved'}
              aria-pressed={bookmarkFilterOn}
            >
              <Save size={16} />
            </button>
          )}

          {/* Pinned filters — when the user pins Platform / Theme via
              Settings → Toolbar, the filter moves out of the Filters
              dropdown and surfaces as an inline tab switch right here.
              The Filters dropdown hides the matching row so the same
              filter isn't reachable from two places. */}
          {isPinned('platform') && (
            <div
              className="catalogue-toolbar-pinned-switch catalogue-toolbar--desktop-only"
              role="group"
              aria-label="Platform filter"
            >
              {[
                { value: null, label: 'All' },
                { value: 'mobile', label: 'Mobile' },
                { value: 'web', label: 'Web' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={`catalogue-toolbar-pinned-switch__btn ${filterPlatform === opt.value ? 'is-active' : ''}`}
                  onClick={() => onFilterPlatformChange(opt.value)}
                  aria-pressed={filterPlatform === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {isPinned('theme') && (
            <div
              className="catalogue-toolbar-pinned-switch catalogue-toolbar--desktop-only"
              role="group"
              aria-label="Theme filter"
            >
              {[
                { value: null, label: 'All' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={`catalogue-toolbar-pinned-switch__btn ${filterTheme === opt.value ? 'is-active' : ''}`}
                  onClick={() => onFilterThemeChange(opt.value)}
                  aria-pressed={filterTheme === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Desktop button — flips between "Quick Upload" → "Upload All (N)"
              → "Uploading…" as the Quick Upload flow progresses. The labels
              cross-fade in place over an invisible sizer that holds the
              widest possible width (matches the 200-file drag-drop cap),
              so the button never snaps width between states. */}
          {onQuickUploadClick && (() => {
            const isOpen = quickUploadOpen;
            const isUploading = quickUploadIsUploading;
            const queueCount = quickUploadQueueCount;
            const activeKey: 'idle' | 'ready' | 'uploading' = isOpen
              ? (isUploading ? 'uploading' : 'ready')
              : 'idle';
            const readyLabel = `Upload All${queueCount > 0 ? ` (${queueCount})` : ''}`;
            return (
              <button
                type="button"
                className="btn-primary catalogue-toolbar--desktop-only catalogue-toolbar-quick-upload"
                onClick={isOpen ? onQuickUploadAll : onQuickUploadClick}
                disabled={isOpen && (isUploading || queueCount === 0)}
              >
                <span className="catalogue-toolbar-quick-upload__sizer" aria-hidden="true">
                  Upload All (200)
                </span>
                <span
                  className={`catalogue-toolbar-quick-upload__label${activeKey === 'idle' ? ' is-active' : ''}`}
                  aria-hidden={activeKey !== 'idle' || undefined}
                >
                  Quick Upload
                </span>
                <span
                  className={`catalogue-toolbar-quick-upload__label${activeKey === 'ready' ? ' is-active' : ''}`}
                  aria-hidden={activeKey !== 'ready' || undefined}
                >
                  {readyLabel}
                </span>
                <span
                  className={`catalogue-toolbar-quick-upload__label${activeKey === 'uploading' ? ' is-active' : ''}`}
                  aria-hidden={activeKey !== 'uploading' || undefined}
                >
                  Uploading…
                </span>
              </button>
            );
          })()}

          {/* Mobile pills - hidden on desktop */}
          <button
            type="button"
            className="catalogue-toolbar-pill catalogue-toolbar--mobile-only"
            onClick={onOpenSearch}
            disabled={!onOpenSearch}
            aria-label="Search catalogue"
          >
            <Search size={16} strokeWidth={2.5} />
            {searchQuery && <span className="catalogue-toolbar-pill__dot" />}
          </button>
          {onQuickUploadClick && (
            <button
              type="button"
              className="catalogue-toolbar-pill catalogue-toolbar-pill--accent catalogue-toolbar--mobile-only"
              onClick={onQuickUploadClick}
              title="Quick upload"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>


      {filterMenuOpen && createPortal(
        <div ref={menuRef} id="catalogue-filter-menu" className="catalogue-filter-menu" style={menuStyle}>
          <div className="catalogue-filter-menu__title">Visible filters</div>
          <div className="catalogue-filter-menu__list">
            {FILTER_OPTIONS
              .filter((option) => {
                // Pinned filters live inline as tab switches in the
                // toolbar — hide them from the Filters dropdown so the
                // same filter isn't reachable from two places.
                if (option.key === 'platform' && isPinned('platform')) return false;
                if (option.key === 'theme' && isPinned('theme')) return false;
                return true;
              })
              .map((option) => {
              const selected = visibleFilters.has(option.key);
              // Flow gets an extra inline toggle when it's enabled —
              // switches between toolbar dropdown and below-toolbar
              // chip strip. The presentation choice persists alongside
              // the visibility choice.
              const isFlowRow = option.key === 'flow';
              return (
                <div key={option.key} className="catalogue-filter-menu__row">
                  <button
                    type="button"
                    className={`catalogue-filter-menu__item ${selected ? 'is-selected' : ''}`}
                    onClick={() => toggleVisibleFilter(option.key)}
                  >
                    <span className="catalogue-filter-menu__icon" aria-hidden="true">{option.icon}</span>
                    <span className="catalogue-filter-menu__label">{option.label}</span>
                    <span className="catalogue-filter-menu__check">{selected ? <Check size={12} /> : null}</span>
                  </button>
                  {isFlowRow && selected && (
                    <div className="catalogue-filter-menu__presentation" role="radiogroup" aria-label="Flow presentation">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={flowPresentation === 'dropdown'}
                        title="Dropdown in toolbar"
                        className={`catalogue-filter-menu__presentation-btn ${flowPresentation === 'dropdown' ? 'is-active' : ''}`}
                        onClick={() => onFlowPresentationChange('dropdown')}
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={flowPresentation === 'strip'}
                        title="Chip strip below toolbar"
                        className={`catalogue-filter-menu__presentation-btn ${flowPresentation === 'strip' ? 'is-active' : ''}`}
                        onClick={() => onFlowPresentationChange('strip')}
                      >
                        <Rows3 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}

      {activePills.length > 0 && (
        <div className="catalogue-filter-pills">
          {activePills.map((pill) => (
            <button key={pill.key} type="button" className="catalogue-filter-pill" onClick={pill.onRemove}>
              <span>{pill.label}</span>
              <span className="catalogue-filter-pill__close"><CloseIcon /></span>
            </button>
          ))}
          {activePills.length > 1 && (
            <button
              type="button"
              className="catalogue-filter-pills__clear-all"
              onClick={onClearAllFilters}
            >
              Clear all
            </button>
          )}
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
        filterPageType={filterPageType}
        filterUiElement={filterUiElement}
        filterUxPattern={filterUxPattern}
        filterScreenState={filterScreenState}
        viewBy={viewBy}
        groups={groups}
        allFlows={allFlows}
        allWebPresets={allWebPresets}
        allMobileOs={allMobileOs}
        annotationLabels={annotationLabels}
        allPageTypes={allPageTypes}
        allUiElements={allUiElements}
        allUxPatterns={allUxPatterns}
        allScreenStates={allScreenStates}
        onApply={handleApplyFilters}
      />

    </div>
    </>
  );
}
