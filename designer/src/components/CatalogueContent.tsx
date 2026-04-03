import type { CatalogueFlowFilter } from '../hooks/use-catalogue-filters';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { FLOW_FILTER_ALL } from '../hooks/use-catalogue-filters';
import { CatalogueFamilyCard } from './CatalogueFamilyCard';
import { CatalogueGalleryView } from './CatalogueGalleryView';
import { CatalogueFamilyListView } from './CatalogueFamilyListView';

interface CatalogueContentProps {
  activeFlowFilter: CatalogueFlowFilter;
  activeVariantKeys: Record<string, string>;
  filterGroup: string | null;
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterProject: string | null;
  filterScreenFamily: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  flowMap: Record<string, string>;
  groupedFamilies: Record<string, CatalogueFamilyView[]>;
  loading: boolean;
  primaryGroup: string | null;
  projectMap: Record<string, string>;
  projectsCount: number;
  searchQuery: string;
  selected: Set<string>;
  viewMode: CatalogueViewMode;
  filteredFamilies: CatalogueFamilyView[];
  vsGroups: string[];
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAssignFlow: (familyId: string) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onOpenPreview: (familyId: string) => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onToggleGroupSelect: (familyIds: string[]) => void;
  onToggleSelect: (familyId: string) => void;
  onUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: 'ios' | 'android' | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
  webPresets: { key: string; label: string; width: number }[];
}

export function CatalogueContent({
  activeFlowFilter,
  activeVariantKeys,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterProject,
  filterScreenFamily,
  filterTheme,
  filterWebPreset,
  flowMap,
  groupedFamilies,
  loading,
  primaryGroup,
  projectMap,
  projectsCount,
  searchQuery,
  selected,
  viewMode,
  filteredFamilies,
  vsGroups,
  onActiveVariantChange,
  onAssignFlow,
  onChangeFamilyGroup,
  onDeleteFamily,
  onOpenDetails,
  onOpenPreview,
  onRenameFamily,
  onReplaceVariantImage,
  onToggleGroupSelect,
  onToggleSelect,
  onUpdateVariantDetails,
  webPresets,
}: CatalogueContentProps) {
  const hasActiveFilters = Boolean(
    searchQuery ||
    filterProject ||
    filterGroup ||
    filterScreenFamily ||
    filterPlatform ||
    filterTheme ||
    filterWebPreset ||
    filterMobileOs ||
    activeFlowFilter !== FLOW_FILTER_ALL,
  );

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" />
        <p>Loading catalogue...</p>
      </div>
    );
  }

  if (projectsCount === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <h2>No projects yet</h2>
        <p>Create a project first to start uploading screenshots.</p>
        <button className="btn-primary" onClick={() => { window.location.href = '/designer/'; }}>Go to Projects</button>
      </div>
    );
  }

  if (filteredFamilies.length === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <h2>{hasActiveFilters ? 'No matching screen families' : 'No screenshots yet'}</h2>
        <p>{hasActiveFilters ? 'Try adjusting your search, filters, or selected flow.' : 'Upload screenshots to get started.'}</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <CatalogueFamilyListView
        activeVariantKeys={activeVariantKeys}
        families={filteredFamilies}
        flowMap={flowMap}
        projectMap={projectMap}
        selected={selected}
        onActiveVariantChange={onActiveVariantChange}
        onAssignFlow={onAssignFlow}
        onChangeFamilyGroup={onChangeFamilyGroup}
        onDeleteFamily={onDeleteFamily}
        onOpenPreview={onOpenPreview}
        onRenameFamily={onRenameFamily}
        onReplaceVariantImage={onReplaceVariantImage}
        onToggleSelect={onToggleSelect}
        onUpdateVariantDetails={onUpdateVariantDetails}
        webPresets={webPresets}
      />
    );
  }

  if (viewMode === 'gallery') {
    return (
      <CatalogueGalleryView
        activeVariantKeys={activeVariantKeys}
        families={filteredFamilies}
        flowMap={flowMap}
        projectMap={projectMap}
        onActiveVariantChange={onActiveVariantChange}
        onAssignFlow={onAssignFlow}
        onDeleteFamily={onDeleteFamily}
        onOpenDetails={onOpenDetails}
        onOpenPreview={onOpenPreview}
        onReplaceVariantImage={onReplaceVariantImage}
      />
    );
  }

  return (
    <div className="catalogue-content">
      {Object.entries(groupedFamilies).map(([groupName, families]) => {
        const familyIds = families.map((family) => family.id);
        const allSelected = familyIds.every((id) => selected.has(id));

        return (
          <section key={groupName} className="catalogue-section">
            <h3 className="catalogue-section-title">
              <button
                type="button"
                className="catalogue-section-select"
                title={allSelected ? 'Deselect group' : 'Select group'}
                onClick={() => onToggleGroupSelect(familyIds)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {allSelected
                    ? <><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /><polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" /></>
                    : <rect x="3" y="3" width="18" height="18" rx="2" />}
                </svg>
              </button>
              {groupName}
              <span className="catalogue-section-count">{families.length}</span>
              {primaryGroup === groupName && <span className="catalogue-badge catalogue-badge-primary">Primary</span>}
              {vsGroups.includes(groupName) && <span className="catalogue-badge catalogue-badge-vs">Vs</span>}
            </h3>

            <div className="catalogue-grid catalogue-grid--families">
              {families.map((family) => (
                <CatalogueFamilyCard
                  key={family.id}
                  family={family}
                  activeVariantKey={activeVariantKeys[family.id] ?? null}
                  flowName={family.flow_id ? (flowMap[family.flow_id] || null) : null}
                  isPrimary={Boolean(primaryGroup && family.group === primaryGroup)}
                  isSelected={selected.has(family.id)}
                  isVs={vsGroups.includes(family.group || '')}
                  projectName={projectMap[family.project_id] || 'Unknown'}
                  onActiveVariantChange={onActiveVariantChange}
                  onAssignFlow={onAssignFlow}
                  onDeleteFamily={onDeleteFamily}
                  onOpenDetails={onOpenDetails}
                  onOpenPreview={onOpenPreview}
                  onReplaceVariantImage={onReplaceVariantImage}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
