import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueViewToggle } from './CatalogueViewToggle';
import { Dropdown } from './Dropdown';

type ToolbarFilterKey =
  | 'project'
  | 'group'
  | 'screenFamily'
  | 'platform'
  | 'theme'
  | 'webPreset'
  | 'mobileOs'
  | 'view';

const TOOLBAR_FILTER_KEY = 'catalogue:toolbar-visible-filters';
const DEFAULT_VISIBLE_FILTERS: ToolbarFilterKey[] = ['project', 'group', 'screenFamily', 'platform', 'theme', 'view'];

const FILTER_OPTIONS: Array<{ key: ToolbarFilterKey; label: string }> = [
  { key: 'project', label: 'Projects' },
  { key: 'group', label: 'Groups' },
  { key: 'screenFamily', label: 'Screen families' },
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

interface CatalogueToolbarProps {
  activeFlowCount: number;
  activeFlowLabel: string;
  allMobileOs: { id: string; label: string }[];
  allScreenFamilies: { id: string; name: string }[];
  allWebPresets: { id: string; label: string }[];
  filterGroup: string | null;
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterProject: string | null;
  filterScreenFamily: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  groups: string[];
  isSortLocked: boolean;
  onFilterGroupChange: (value: string | null) => void;
  onFilterMobileOsChange: (value: string | null) => void;
  onFilterPlatformChange: (value: string | null) => void;
  onFilterProjectChange: (value: string | null) => void;
  onFilterScreenFamilyChange: (value: string | null) => void;
  onFilterThemeChange: (value: string | null) => void;
  onFilterWebPresetChange: (value: string | null) => void;
  onPrimaryGroupChange: (value: string | null) => void;
  onQuickUploadClick: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: CatalogueSortOption) => void;
  onToggleFlowSheet: () => void;
  onUploadClick: () => void;
  onViewByChange: (value: CatalogueViewBy) => void;
  onViewModeChange: (value: CatalogueViewMode) => void;
  onVsGroupsChange: (value: string[]) => void;
  primaryGroup: string | null;
  projects: { id: string; name: string }[];
  searchQuery: string;
  showGroupConfig: boolean;
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
  viewMode: CatalogueViewMode;
  vsGroups: string[];
}

export function CatalogueToolbar({
  activeFlowCount,
  activeFlowLabel,
  allMobileOs,
  allScreenFamilies,
  allWebPresets,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterProject,
  filterScreenFamily,
  filterTheme,
  filterWebPreset,
  groups,
  isSortLocked,
  onFilterGroupChange,
  onFilterMobileOsChange,
  onFilterPlatformChange,
  onFilterProjectChange,
  onFilterScreenFamilyChange,
  onFilterThemeChange,
  onFilterWebPresetChange,
  onPrimaryGroupChange,
  onQuickUploadClick,
  onSearchChange,
  onSortByChange,
  onToggleFlowSheet,
  onUploadClick,
  onViewByChange,
  onViewModeChange,
  onVsGroupsChange,
  primaryGroup,
  projects,
  searchQuery,
  showGroupConfig,
  sortBy,
  viewBy,
  viewMode,
  vsGroups,
}: CatalogueToolbarProps) {
  const nonPrimaryGroups = groups.filter((group) => group !== primaryGroup);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState<Set<ToolbarFilterKey>>(() => {
    try {
      return parseVisibleFilters(window.localStorage.getItem(TOOLBAR_FILTER_KEY));
    } catch {
      return new Set(DEFAULT_VISIBLE_FILTERS);
    }
  });
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  function toggleVsGroup(group: string) {
    if (vsGroups.includes(group)) {
      onVsGroupsChange(vsGroups.filter((value) => value !== group));
      return;
    }
    onVsGroupsChange([...vsGroups, group]);
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

  function toggleVisibleFilter(key: ToolbarFilterKey) {
    const isVisible = visibleFilters.has(key);

    if (isVisible) {
      if (key === 'project') onFilterProjectChange(null);
      if (key === 'group') onFilterGroupChange(null);
      if (key === 'screenFamily') onFilterScreenFamilyChange(null);
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
          <div className="catalogue-search">
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
            className={`btn-secondary catalogue-filter-toggle ${filterMenuOpen ? 'is-open' : ''}`}
            aria-expanded={filterMenuOpen}
            aria-controls="catalogue-filter-menu"
            onClick={() => setFilterMenuOpen((previous) => !previous)}
          >
            + Filter
          </button>

          {isFilterVisible('project') && (
            <Dropdown
              value={filterProject}
              placeholder="Project"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={onFilterProjectChange}
            />
          )}

          {isFilterVisible('group') && (
            <Dropdown
              value={filterGroup}
              placeholder="Group"
              options={groups.map((group) => ({ value: group, label: group, badge: group === primaryGroup ? 'Primary' : undefined }))}
              onChange={onFilterGroupChange}
            />
          )}

          {isFilterVisible('screenFamily') && (
            <Dropdown
              value={filterScreenFamily}
              placeholder="Screen family"
              options={allScreenFamilies.map((family) => ({ value: family.id, label: family.name }))}
              onChange={onFilterScreenFamilyChange}
            />
          )}

          {isFilterVisible('platform') && (
            <Dropdown
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
              value={filterWebPreset}
              placeholder="Web preset"
              options={allWebPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
              onChange={onFilterWebPresetChange}
            />
          )}

          {isFilterVisible('mobileOs') && filterPlatform === 'mobile' && (
            <Dropdown
              value={filterMobileOs}
              placeholder="Mobile OS"
              options={allMobileOs.map((item) => ({ value: item.id, label: item.label }))}
              onChange={onFilterMobileOsChange}
            />
          )}

          {isFilterVisible('view') && (
            <Dropdown
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

          <Dropdown
            value={sortBy}
            placeholder={isSortLocked ? 'Sort (auto)' : 'Sort'}
            options={[
              { value: 'date-desc', label: 'Date: Latest' },
              { value: 'date-asc', label: 'Date: Oldest' },
              { value: 'name-asc', label: 'Name: A-Z' },
            ]}
            onChange={(value) => onSortByChange((value || 'date-desc') as CatalogueSortOption)}
            disabled={isSortLocked}
          />

          <CatalogueViewToggle value={viewMode} onChange={onViewModeChange} />
        </div>

        <div className="catalogue-toolbar-right">
          <button type="button" className="btn-secondary catalogue-flow-sheet-trigger" onClick={onToggleFlowSheet}>
            <span className="catalogue-flow-sheet-trigger__copy">
              <span className="catalogue-flow-sheet-trigger__label">Flow filter</span>
              <span className="catalogue-flow-sheet-trigger__value">{activeFlowLabel}</span>
            </span>
            <span className="catalogue-flow-sheet-trigger__count">{activeFlowCount}</span>
          </button>
          <button className="btn-secondary" onClick={onQuickUploadClick}>
            Quick Upload
          </button>
          <button className="btn-primary" onClick={onUploadClick}>
            + Upload
          </button>
        </div>
      </div>

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

      {showGroupConfig && (
        <div className="catalogue-group-config">
          <div className="catalogue-group-config-row">
            <label className="catalogue-group-config-label">Primary</label>
            <Dropdown
              value={primaryGroup}
              placeholder="Select primary group..."
              options={groups.map((group) => ({ value: group, label: group }))}
              onChange={onPrimaryGroupChange}
            />
          </div>

          {primaryGroup && nonPrimaryGroups.length > 0 && (
            <div className="catalogue-group-config-row">
              <label className="catalogue-group-config-label">Vs</label>
              <div className="catalogue-vs-chips">
                {nonPrimaryGroups.map((group) => (
                  <button
                    key={group}
                    className={`catalogue-vs-chip ${vsGroups.includes(group) ? 'active' : ''}`}
                    onClick={() => toggleVsGroup(group)}
                  >
                    {group}
                    {vsGroups.includes(group) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
