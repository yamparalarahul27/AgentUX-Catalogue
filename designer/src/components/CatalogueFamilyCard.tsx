import { useMemo, useRef } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { getGroupColor } from '../lib/naming';

interface CatalogueFamilyCardProps {
  family: CatalogueFamilyView;
  activeVariantKey: string | null;
  flowName: string | null;
  isPrimary: boolean;
  isSelected: boolean;
  isVs: boolean;
  projectName: string;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAssignFlow: (familyId: string) => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onOpenPreview: (familyId: string) => void;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onToggleSelect: (familyId: string) => void;
}

export function CatalogueFamilyCard({
  family,
  activeVariantKey,
  flowName,
  isPrimary,
  isSelected,
  isVs,
  projectName,
  onActiveVariantChange,
  onAssignFlow,
  onDeleteFamily,
  onOpenDetails,
  onOpenPreview,
  onReplaceVariantImage,
  onToggleSelect,
}: CatalogueFamilyCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey),
    [activeVariantKey, family],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const groupColor = getGroupColor(family.group);

  async function requestDelete() {
    const shouldDelete = window.confirm(`Delete "${family.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
  }

  return (
    <article className={`catalogue-card catalogue-family-card ${isSelected ? 'catalogue-card--selected is-selected' : ''}`}>
      <div className="catalogue-family-card__media">
        <button
          type="button"
          className={`catalogue-card-select ${isSelected ? 'catalogue-card-select--checked' : ''}`}
          onClick={() => onToggleSelect(family.id)}
          title="Select family"
        >
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        {(isPrimary || isVs) && (
          <span className={`catalogue-card-badge ${isPrimary ? 'catalogue-card-badge-primary' : 'catalogue-card-badge-vs'}`}>
            {isPrimary ? 'Primary' : 'Vs'}
          </span>
        )}

        <button type="button" className="catalogue-family-card__preview" onClick={() => onOpenPreview(family.id)}>
          <div className="catalogue-card-image">
            {screenshot?.image_url ? (
              <img src={screenshot.image_url} alt={`${family.name} ${activeVariant?.label || ''}`} draggable={false} />
            ) : (
              <div className="catalogue-card-placeholder">No image</div>
            )}
          </div>
        </button>

        {screenshot && (
          <div className="catalogue-card-indicators">
            {screenshot.reference_url && <span className="catalogue-card-ref-btn">Ref</span>}
            {(screenshot.comment_count ?? 0) > 0 && (
              <span className="catalogue-card-comment-btn">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {screenshot.comment_count}
              </span>
            )}
            {(screenshot.annotation_count ?? 0) > 0 && (
              <span className="catalogue-card-comment-btn">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                {screenshot.annotation_count}
              </span>
            )}
            {(screenshot.version_count ?? 0) > 0 && (
              <span className="catalogue-card-version-btn">v{(screenshot.version_count ?? 0) + 1}</span>
            )}
          </div>
        )}

        <div className="catalogue-card-actions catalogue-family-card__media-actions">
          <button
            type="button"
            className="catalogue-card-action"
            title="Edit details"
            aria-label="Edit details"
            onClick={() => onOpenDetails(family.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            className="catalogue-card-action"
            title="Reupload variant"
            aria-label="Reupload variant"
            onClick={() => fileRef.current?.click()}
            disabled={!screenshot}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button
            type="button"
            className="catalogue-card-action catalogue-card-action-danger"
            title="Delete family"
            aria-label="Delete family"
            onClick={() => void requestDelete()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && screenshot) {
              void onReplaceVariantImage(screenshot.id, file);
            }
            event.target.value = '';
          }}
        />
      </div>

      <div className="catalogue-card-info">
        <div className="catalogue-family-card__head">
          <button type="button" className="catalogue-family-card__name" onClick={() => onOpenPreview(family.id)}>
            {family.name}
          </button>
          <span className="catalogue-family-card__count">{family.variants.length} variants</span>
        </div>

        <div className="catalogue-card-meta">
          <div className="catalogue-card-group">
            <span className="catalogue-card-dot" style={{ background: groupColor }} />
            <span className="catalogue-family-card__group">{family.group || 'No group'}</span>
          </div>
          <button type="button" className="catalogue-card-flow-pill" onClick={() => onAssignFlow(family.id)}>
            {flowName || 'Unassigned'}
          </button>
        </div>

        <div className="catalogue-family-card__submeta">
          <span className="catalogue-card-project">{projectName}</span>
          {activeVariant && <span className="catalogue-family-card__variant-copy">{activeVariant.label}</span>}
        </div>

        <div className="catalogue-family-card__variants">
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
      </div>
    </article>
  );
}
