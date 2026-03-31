interface CatalogueToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterProject: string | null;
  onFilterProjectChange: (p: string | null) => void;
  projects: { id: string; name: string }[];
  filterGroup: string | null;
  onFilterGroupChange: (g: string | null) => void;
  groups: string[];
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
  onUploadClick,
  screenshotCount,
}: CatalogueToolbarProps) {
  return (
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
      </div>

      <div className="catalogue-toolbar-right">
        <span className="catalogue-count">{screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''}</span>
        <button className="btn-primary" onClick={onUploadClick}>
          + Upload
        </button>
      </div>
    </div>
  );
}
