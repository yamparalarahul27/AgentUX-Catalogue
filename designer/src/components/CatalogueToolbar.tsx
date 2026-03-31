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

          <select
            className="catalogue-filter"
            value={filterProject || ''}
            onChange={(e) => onFilterProjectChange(e.target.value || null)}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            className="catalogue-filter"
            value={filterGroup || ''}
            onChange={(e) => onFilterGroupChange(e.target.value || null)}
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            className="catalogue-filter"
            value={filterPlatform || ''}
            onChange={(e) => onFilterPlatformChange(e.target.value || null)}
          >
            <option value="">All Platforms</option>
            <option value="mobile">Mobile</option>
            <option value="web">Web</option>
          </select>
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
            <select
              className="catalogue-filter"
              value={primaryGroup || ''}
              onChange={(e) => onPrimaryGroupChange(e.target.value || null)}
            >
              <option value="">Select primary group...</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
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
