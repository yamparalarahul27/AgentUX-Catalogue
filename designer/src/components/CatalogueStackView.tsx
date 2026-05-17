import { CheckSquare, Square } from 'lucide-react';

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
  // Click-to-edit on the stack card title. Gated per-family by the
  // caller (capability + ownership) via canEditFamily; the rename
  // handler is the same one used by the gallery view + card.
  onRenameFamily?: (familyId: string, name: string) => Promise<void>;
  canEditFamily?: (family: CatalogueFamilyView) => boolean;
}

export function CatalogueStackView({
  activeVariantKeys,
  groupedFamilies,
  selected,
  onOpenPreview,
  onToggleGroupSelect,
  onToggleSelect,
  onRenameFamily,
  canEditFamily,
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
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <CatalogueGroupLabel
                group={groupName}
                projectId={null}
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
                  onRenameFamily={onRenameFamily}
                  canEditTitle={canEditFamily ? canEditFamily(family) : true}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
