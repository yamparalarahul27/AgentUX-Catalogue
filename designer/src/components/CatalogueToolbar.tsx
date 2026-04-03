import { useState } from 'react';

import type { CatalogueViewBy } from '../lib/catalogue-activity';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueViewMode } from '../lib/catalogue-view';
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
  groups: string[];
  isSortLocked: boolean;
  onFilterGroupChange: (value: string | null) => void;
  onFilterFlowChange: (value: string | null) => void;
  onFilterMobileOsChange: (value: string | null) => void;
  onFilterPlatformChange: (value: string | null) => void;
  onFilterThemeChange: (value: string | null) => void;
  onFilterWebPresetChange: (value: string | null) => void;
  onPrimaryGroupChange: (value: string | null) => void;
  onQuickUploadClick: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: CatalogueSortOption) => void;
  onUploadClick: () => void;
  onViewByChange: (value: CatalogueViewBy) => void;
  onViewModeChange: (value: CatalogueViewMode) => void;
  onVsGroupsChange: (value: string[]) => void;
  primaryGroup: string | null;
  searchQuery: string;
  showGroupConfig: boolean;
  sortBy: CatalogueSortOption;
  viewBy: CatalogueViewBy;
  viewMode: CatalogueViewMode;
  vsGroups: string[];
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
  groups,
  isSortLocked,
  onFilterGroupChange,
  onFilterFlowChange,
  onFilterMobileOsChange,
  onFilterPlatformChange,
  onFilterThemeChange,
  onFilterWebPresetChange,
  onPrimaryGroupChange,
  onQuickUploadClick,
  onSearchChange,
  onSortByChange,
  onUploadClick,
  onViewByChange,
  onViewModeChange,
  onVsGroupsChange,
  primaryGroup,
  searchQuery,
  showGroupConfig,
  sortBy,
  viewBy,
  viewMode,
  vsGroups,
}: CatalogueToolbarProps) {
  const nonPrimaryGroups = groups.filter((group) => group !== primaryGroup);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const activeFilterCount = [
    filterGroup,
    filterFlow,
    filterPlatform,
    filterTheme,
    filterWebPreset,
    filterMobileOs,
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

  function toggleVsGroup(group: string) {
    if (vsGroups.includes(group)) {
      onVsGroupsChange(vsGroups.filter((value) => value !== group));
      return;
    }
    onVsGroupsChange([...vsGroups, group]);
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
            type="button"
            className="btn-secondary catalogue-filter-toggle"
            onClick={() => setFilterSheetOpen(true)}
          >
            Filter
            {activeFilterCount > 0 && (
              <span className="catalogue-filter-btn__badge">{activeFilterCount}</span>
            )}
          </button>

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
          <button className="btn-secondary" onClick={onQuickUploadClick}>
            Quick Upload
          </button>
          <button className="btn-primary" onClick={onUploadClick}>
            + Upload
          </button>
        </div>
      </div>

      {activePills.length > 0 && (
        <div className="catalogue-filter-pills">
          {activePills.map((pill) => (
            <button key={pill.key} type="button" className="catalogue-filter-pill" onClick={pill.onRemove}>
              <span>{pill.label}</span>
              <span className="catalogue-filter-pill__close"><CloseIcon /></span>
            </button>
          ))}
        </div>
      )}

      <div className="catalogue-floating-search">
        {activePills.length > 0 && (
          <div className="catalogue-filter-pills catalogue-filter-pills--floating">
            {activePills.map((pill) => (
              <button key={pill.key} type="button" className="catalogue-filter-pill" onClick={pill.onRemove}>
                <span>{pill.label}</span>
                <span className="catalogue-filter-pill__close"><CloseIcon /></span>
              </button>
            ))}
          </div>
        )}
        <div className="catalogue-search catalogue-search--floating">
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
      </div>

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
