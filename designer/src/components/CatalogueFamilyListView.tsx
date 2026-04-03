import { useMemo, useRef, useState } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';

interface CatalogueFamilyListViewProps {
  activeVariantKeys: Record<string, string>;
  families: CatalogueFamilyView[];
  flowMap: Record<string, string>;
  projectMap: Record<string, string>;
  selected: Set<string>;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAssignFlow: (familyId: string) => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onOpenPreview: (familyId: string) => void;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onToggleSelect: (familyId: string) => void;
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function CatalogueFamilyListView({
  activeVariantKeys,
  families,
  flowMap,
  projectMap,
  selected,
  onActiveVariantChange,
  onAssignFlow,
  onDeleteFamily,
  onOpenDetails,
  onOpenPreview,
  onReplaceVariantImage,
  onToggleSelect,
}: CatalogueFamilyListViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const familyLookup = useMemo(
    () => Object.fromEntries(families.map((family) => [family.id, family])),
    [families],
  );

  async function requestDelete(family: CatalogueFamilyView) {
    const shouldDelete = window.confirm(`Delete "${family.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
  }

  return (
    <div className="catalogue-list-view">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTargetId) {
            void onReplaceVariantImage(replaceTargetId, file);
          }
          setReplaceTargetId(null);
          event.target.value = '';
        }}
      />

      <div className="catalogue-list-header catalogue-list-header--family">
        <span />
        <span>Preview</span>
        <span>Screen family</span>
        <span>Group</span>
        <span>Flow</span>
        <span>Variant</span>
        <span>Project</span>
        <span>Created</span>
        <span>Actions</span>
      </div>

      <div className="catalogue-list-body">
        {families.map((family) => {
          const activeVariant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
          const activeScreenshot = activeVariant?.screenshot ?? null;

          return (
            <div key={family.id} className={`catalogue-list-row catalogue-list-row--family ${selected.has(family.id) ? 'is-selected' : ''}`}>
              <button
                type="button"
                className={`catalogue-list-check ${selected.has(family.id) ? 'is-selected' : ''}`}
                onClick={() => onToggleSelect(family.id)}
                title="Select family"
              >
                {selected.has(family.id) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>

              <button type="button" className="catalogue-list-thumb" onClick={() => onOpenPreview(family.id)}>
                {activeScreenshot?.image_url ? (
                  <img src={activeScreenshot.image_url} alt={family.name} />
                ) : (
                  <span className="catalogue-list-thumb-placeholder">No image</span>
                )}
              </button>

              <div className="catalogue-list-name">
                <button type="button" className="catalogue-list-name-btn" onClick={() => onOpenPreview(family.id)}>
                  {family.name}
                </button>
              </div>

              <span className="catalogue-list-group">{family.group || 'No group'}</span>
              <button type="button" className="catalogue-list-flow" onClick={() => onAssignFlow(family.id)}>
                {family.flow_id ? flowMap[family.flow_id] || 'Assigned' : 'Unassigned'}
              </button>

              <div className="catalogue-family-list__variants">
                {family.variants.map((variant) => (
                  <button
                    key={variant.key}
                    type="button"
                    className={`catalogue-family-card__variant ${activeVariant?.key === variant.key ? 'is-active' : ''}`}
                    onClick={() => onActiveVariantChange(family.id, variant.key)}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>

              <span className="catalogue-list-project">{projectMap[family.project_id] || 'Unknown'}</span>
              <span className="catalogue-list-created">{formatCreatedAt(activeScreenshot?.created_at || family.created_at)}</span>

              <div className="catalogue-list-actions">
                <button type="button" className="catalogue-list-action" onClick={() => onOpenPreview(family.id)}>
                  Preview
                </button>
                <button type="button" className="catalogue-list-action" onClick={() => onOpenDetails(family.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="catalogue-list-action"
                  onClick={() => {
                    const screenshot = familyLookup[family.id]
                      ? getActiveFamilyVariant(familyLookup[family.id], activeVariantKeys[family.id])?.screenshot
                      : null;
                    if (!screenshot) return;
                    setReplaceTargetId(screenshot.id);
                    fileRef.current?.click();
                  }}
                >
                  Reupload
                </button>
                <button type="button" className="catalogue-list-action is-danger" onClick={() => void requestDelete(family)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
