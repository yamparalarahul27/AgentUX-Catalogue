import { Dropdown } from './Dropdown';

interface CatalogueToolbarProps {
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
  primaryGroup: string | null;
  vsGroups: string[];
  onPrimaryGroupChange: (g: string | null) => void;
  onVsGroupsChange: (gs: string[]) => void;
  showGroupConfig: boolean;
  onUploadClick: () => void;
  screenshotCount: number;
}

export function CatalogueToolbar({
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
  primaryGroup,
  vsGroups,
  onPrimaryGroupChange,
  onVsGroupsChange,
  showGroupConfig,
  onUploadClick,
  screenshotCount,
}: CatalogueToolbarProps) {
  const nonPrimaryGroups = groups.filter((g) => g !== primaryGroup);

  function toggleVsGroup(g: string) {
    if (vsGroups.includes(g)) {
      onVsGroupsChange(vsGroups.filter((v) => v !== g));
    } else {
      onVsGroupsChange([...vsGroups, g]);
    }
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

          <Dropdown
            value={filterProject}
            placeholder="All Projects"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            onChange={onFilterProjectChange}
          />

          <Dropdown
            value={filterGroup}
            placeholder="All Groups"
            options={groups.map((g) => ({ value: g, label: g, badge: g === primaryGroup ? 'Primary' : undefined }))}
            onChange={onFilterGroupChange}
          />

          <Dropdown
            value={filterPlatform}
            placeholder="All Platforms"
            options={[
              { value: 'mobile', label: 'Mobile' },
              { value: 'web', label: 'Web' },
            ]}
            onChange={onFilterPlatformChange}
          />
        </div>

        <div className="catalogue-toolbar-right">
          <span className="catalogue-count">{screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''}</span>
          <button className="btn-primary" onClick={onUploadClick}>
            + Upload
          </button>
        </div>
      </div>

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
