import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { getGroupColor } from '../lib/naming';
import { ConfirmModal } from './ConfirmModal';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { ThumbHashImage } from './ThumbHashImage';

interface CatalogueFamilyCardProps {
  family: CatalogueFamilyView;
  activeVariantKey: string | null;
  flowName: string | null;
  isPrimary: boolean;
  isSelected: boolean;
  isVs: boolean;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenPreview: (familyId: string) => void;
  onOpenPreviewAndEdit: (familyId: string) => void;
  onRenameFamily: (familyId: string, newName: string) => Promise<void>;
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
  onDeleteFamily,
  onOpenPreview,
  onOpenPreviewAndEdit,
  onRenameFamily,
  onReplaceVariantImage,
  onToggleSelect,
}: CatalogueFamilyCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(family.name);
  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey),
    [activeVariantKey, family],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const imageUrl = screenshot?.image_url ?? '';
  const groupColor = getGroupColor(family.group);
  const platform = screenshot?.platform;
  const [isImageLoading, setIsImageLoading] = useState(Boolean(imageUrl));
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setIsImageLoading(false);
      setHasImageError(false);
      return;
    }

    setIsImageLoading(true);
    setHasImageError(false);
  }, [imageUrl, screenshot?.id]);

  async function confirmDelete() {
    setIsDeleting(true);
    try {
      await onDeleteFamily(family.id);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <article className={`catalogue-card catalogue-family-card ${isSelected ? 'catalogue-card--selected is-selected' : ''}`} data-family-id={family.id}>
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
              {imageUrl && !hasImageError ? (
                <>
                  {isImageLoading && (
                    <span
                      className="catalogue-card-image-progress"
                      role="progressbar"
                      aria-label="Loading screenshot preview"
                      aria-valuetext="Loading"
                    >
                      <span className="catalogue-card-image-progress__bar" />
                    </span>
                  )}
                  <ThumbHashImage
                    src={imageUrl}
                    thumbHash={screenshot?.thumb_hash ?? null}
                    alt={`${family.name} ${activeVariant?.label || ''}`}
                    className={isImageLoading ? 'is-loading' : 'is-ready'}
                    onLoad={() => setIsImageLoading(false)}
                    onError={() => {
                      setIsImageLoading(false);
                      setHasImageError(true);
                    }}
                  />
                </>
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
              title="Open preview"
              aria-label="Open preview"
              onClick={() => onOpenPreviewAndEdit(family.id)}
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
              title="Delete screenshot"
              aria-label="Delete screenshot"
              onClick={() => setShowDeleteConfirm(true)}
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
            {isEditing ? (
              <input
                className="catalogue-card-edit"
                type="text"
                value={editValue}
                autoFocus
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={() => {
                  const trimmed = editValue.trim();
                  if (trimmed && trimmed !== family.name) {
                    void onRenameFamily(family.id, trimmed);
                  }
                  setIsEditing(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') { setEditValue(family.name); setIsEditing(false); }
                }}
              />
            ) : (
              <button
                type="button"
                className="catalogue-family-card__name"
                onClick={() => onOpenPreview(family.id)}
                onDoubleClick={(event) => { event.preventDefault(); setEditValue(family.name); setIsEditing(true); }}
              >
                {family.name}
              </button>
            )}
          </div>

          <div className="catalogue-card-meta">
            <div className="catalogue-card-group">
              <span className="catalogue-card-dot" style={{ background: groupColor }} />
              <CatalogueGroupLabel
                className="catalogue-family-card__group"
                group={family.group}
                projectId={family.project_id}
              />
            </div>
            <div className="catalogue-card-meta-right">
              {platform === 'mobile' && (
                <span className="catalogue-card-platform-pill" title="Mobile" aria-label="Mobile">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="7" y="2" width="10" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </span>
              )}
              {platform === 'web' && (
                <span className="catalogue-card-platform-pill" title="Web" aria-label="Web">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </span>
              )}
              <span className="catalogue-card-flow-pill">
                {flowName || 'Unassigned'}
              </span>
            </div>
          </div>
        </div>
      </article>

      {showDeleteConfirm && createPortal(
        <ConfirmModal
          title="Delete Screenshot"
          message={`Delete "${family.name}" and all variants? This cannot be undone.`}
          onConfirm={() => {
            if (!isDeleting) void confirmDelete();
          }}
          onCancel={() => {
            if (!isDeleting) setShowDeleteConfirm(false);
          }}
        />,
        document.body,
      )}
    </>
  );
}
