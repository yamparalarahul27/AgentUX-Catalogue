import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from './Dropdown';
import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueViewToggle } from './CatalogueViewToggle';

type ToolbarFilterKey = 'project' | 'group' | 'platform' | 'theme' | 'view';

const TOOLBAR_FILTER_KEY = 'catalogue:toolbar-visible-filters';
const DEFAULT_VISIBLE_FILTERS: ToolbarFilterKey[] = ['project', 'group', 'platform', 'theme', 'view'];

const FILTER_OPTIONS: Array<{ key: ToolbarFilterKey; label: string }> = [
  { key: 'project', label: 'Projects' },
  { key: 'group', label: 'Groups' },
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

interface CatalogueToolbarProps {
  activeFlowCount: number;
  activeFlowLabel: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterProject: string | null;
  onFilterProjectChange: (p: string | null) => void;
  projects: { id: string; name: string }[];
  filterGroup: string | null;
  onFilterGroupChange: (g: string | null) => void;
  groups: string[];
  filterPlatform: string | null;
  onFilterPlatformChange: (p: string | null) => void;
  filterTheme: string | null;
  onFilterThemeChange: (t: string | null) => void;
  viewBy: CatalogueViewBy;
  onViewByChange: (mode: CatalogueViewBy) => void;
  sortBy: CatalogueSortOption;
  onSortByChange: (sort: CatalogueSortOption) => void;
  isSortLocked: boolean;
  viewMode: CatalogueViewMode;
  onViewModeChange: (view: CatalogueViewMode) => void;
  primaryGroup: string | null;
  vsGroups: string[];
  onPrimaryGroupChange: (g: string | null) => void;
  onVsGroupsChange: (gs: string[]) => void;
  showGroupConfig: boolean;
  onUploadClick: () => void;
  onQuickUploadClick: () => void;
  onToggleFlowSheet: () => void;
}

export function CatalogueToolbar({
  activeFlowCount,
  activeFlowLabel,
  searchQuery,
  onSearchChange,
  filterProject,
  onFilterProjectChange,
  projects,
  filterGroup,
  onFilterGroupChange,
  groups,
  filterPlatform,
  onFilterPlatformChange,
  filterTheme,
  onFilterThemeChange,
  viewBy,
  onViewByChange,
  sortBy,
  onSortByChange,
  isSortLocked,
  viewMode,
  onViewModeChange,
  primaryGroup,
  vsGroups,
  onPrimaryGroupChange,
  onVsGroupsChange,
  showGroupConfig,
  onUploadClick,
  onQuickUploadClick,
  onToggleFlowSheet,
}: CatalogueToolbarProps) {
  const nonPrimaryGroups = groups.filter((g) => g !== primaryGroup);
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

  function toggleVsGroup(g: string) {
    if (vsGroups.includes(g)) {
      onVsGroupsChange(vsGroups.filter((v) => v !== g));
    } else {
      onVsGroupsChange([...vsGroups, g]);
    }
  }

  useEffect(() => {
    if (!filterMenuOpen) return;

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
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, viewportWidth - preferredWidth - 12),
    );
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
      if (key === 'platform') onFilterPlatformChange(null);
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
          <div className="catalogue-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search screenshots..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <button
            ref={triggerRef}
            type="button"
            className={`btn-secondary catalogue-filter-toggle ${filterMenuOpen ? 'is-open' : ''}`}
            onClick={() => setFilterMenuOpen((previous) => !previous)}
          >
            + Filter
          </button>

          {isFilterVisible('project') && (
            <Dropdown
              value={filterProject}
              placeholder="Project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={onFilterProjectChange}
            />
          )}

          {isFilterVisible('group') && (
            <Dropdown
              value={filterGroup}
              placeholder="Group"
              options={groups.map((g) => ({ value: g, label: g, badge: g === primaryGroup ? 'Primary' : undefined }))}
              onChange={onFilterGroupChange}
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

          {isFilterVisible('view') && (
            <Dropdown
              value={viewBy}
              placeholder="View by"
              options={[
                { value: 'all', label: 'All screenshots' },
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
        <div ref={menuRef} className="catalogue-filter-menu" style={menuStyle}>
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
              options={groups.map((g) => ({ value: g, label: g }))}
              onChange={onPrimaryGroupChange}
            />
          </div>

          {primaryGroup && nonPrimaryGroups.length > 0 && (
            <div className="catalogue-group-config-row">
              <label className="catalogue-group-config-label">Vs</label>
              <div className="catalogue-vs-chips">
                {nonPrimaryGroups.map((g) => (
                  <button
                    key={g}
                    className={`catalogue-vs-chip ${vsGroups.includes(g) ? 'active' : ''}`}
                    onClick={() => toggleVsGroup(g)}
                  >
                    {g}
                    {vsGroups.includes(g) && (
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
