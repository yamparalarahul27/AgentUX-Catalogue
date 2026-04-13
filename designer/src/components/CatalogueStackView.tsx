import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { CatalogueStackCard } from './CatalogueStackCard';

interface CatalogueStackViewProps {
  activeVariantKeys: Record<string, string>;
  groupedFamilies: Record<string, CatalogueFamilyView[]>;
  selected: Set<string>;
  onOpenPreview: (familyId: string) => void;
  onToggleGroupSelect: (familyIds: string[]) => void;
  onToggleSelect: (familyId: string) => void;
}

export function CatalogueStackView({
  activeVariantKeys,
  groupedFamilies,
  selected,
  onOpenPreview,
  onToggleGroupSelect,
  onToggleSelect,
}: CatalogueStackViewProps) {
  return (
    <div className="catalogue-stack">
      {Object.entries(groupedFamilies).map(([groupName, families]) => {
        const familyIds = families.map((family) => family.id);
        const allSelected = familyIds.every((id) => selected.has(id));

        return (
          <section key={groupName} className="catalogue-stack__section">
            <h3 className="catalogue-section-title">
              <button
                type="button"
                className="catalogue-section-select"
                title={allSelected ? 'Deselect group' : 'Select group'}
                onClick={() => onToggleGroupSelect(familyIds)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {allSelected ? (
                    <>
                      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
                      <polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" />
                    </>
                  ) : (
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                  )}
                </svg>
              </button>
              <CatalogueGroupLabel
                group={groupName}
                projectId={families[0]?.project_id ?? null}
                fallback="Ungrouped"
                iconSize={28}
              />
              <span className="catalogue-section-count">{families.length}</span>
            </h3>

            <div className="catalogue-stack__list">
              {families.map((family) => (
                <CatalogueStackCard
                  key={family.id}
                  family={family}
                  activeVariantKey={activeVariantKeys[family.id] ?? null}
                  isSelected={selected.has(family.id)}
                  onOpenPreview={onOpenPreview}
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
