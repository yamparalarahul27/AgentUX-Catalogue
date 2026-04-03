import type { CatalogueFamilyView } from '../lib/catalogue-families';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueFamilyCard } from './CatalogueFamilyCard';
import { CatalogueGalleryView } from './CatalogueGalleryView';
import { CatalogueFamilyListView } from './CatalogueFamilyListView';

interface CatalogueContentProps {
  activeVariantKeys: Record<string, string>;
  filterFlow: string | null;
  filterGroup: string | null;
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  groupedFamilies: Record<string, CatalogueFamilyView[]>;
  loading: boolean;
  primaryGroup: string | null;
  searchQuery: string;
  selected: Set<string>;
  viewMode: CatalogueViewMode;
  filteredFamilies: CatalogueFamilyView[];
  vsGroups: string[];
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onOpenPreview: (familyId: string) => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onRemoveReference: (screenshotId: string) => Promise<boolean>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onSetFlowLabel: (familyId: string, flowLabel: string | null) => Promise<boolean>;
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
  activeVariantKeys,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterTheme,
  filterWebPreset,
  groupedFamilies,
  loading,
  primaryGroup,
  searchQuery,
  selected,
  viewMode,
  filteredFamilies,
  vsGroups,
  onActiveVariantChange,
  onChangeFamilyGroup,
  onDeleteFamily,
  onOpenDetails,
  onOpenPreview,
  onRenameFamily,
  onRemoveReference,
  onReplaceVariantImage,
  onSetFlowLabel,
  onToggleGroupSelect,
  onToggleSelect,
  onUpdateVariantDetails,
  webPresets,
}: CatalogueContentProps) {
  const hasActiveFilters = Boolean(
    searchQuery ||
    filterFlow ||
    filterGroup ||
    filterPlatform ||
    filterTheme ||
    filterWebPreset ||
    filterMobileOs,
  );

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" />
        <p>Loading catalogue...</p>
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
        <p>{hasActiveFilters ? 'Try adjusting your search or filters.' : 'Upload screenshots to get started.'}</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <CatalogueFamilyListView
        activeVariantKeys={activeVariantKeys}
        families={filteredFamilies}
        selected={selected}
        onActiveVariantChange={onActiveVariantChange}
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
        onActiveVariantChange={onActiveVariantChange}
        onChangeFamilyGroup={onChangeFamilyGroup}
        onDeleteFamily={onDeleteFamily}
        onOpenPreview={onOpenPreview}
        onRenameFamily={onRenameFamily}
        onRemoveReference={onRemoveReference}
        onReplaceVariantImage={onReplaceVariantImage}
        onSetFlowLabel={onSetFlowLabel}
        onUpdateVariantDetails={onUpdateVariantDetails}
        webPresets={webPresets}
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
                  flowName={family.flow_label}
                  isPrimary={Boolean(primaryGroup && family.group === primaryGroup)}
                  isSelected={selected.has(family.id)}
                  isVs={vsGroups.includes(family.group || '')}
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
