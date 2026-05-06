import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, MapPin, Monitor, RefreshCw, Smartphone, Trash2 } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { REUPLOAD_ENABLED } from '../lib/feature-flags';
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
  onRenameFamily: (familyId: string, newName: string) => Promise<void>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onToggleSelect: (familyId: string) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (screenshotId: string) => void;
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
  onRenameFamily,
  onReplaceVariantImage,
  onToggleSelect,
  bookmarkedIds,
  onToggleBookmark,
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
              <Check size={12} strokeWidth={3} />
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
              {(screenshot.annotation_count ?? 0) > 0 && (
                <span className="catalogue-card-comment-btn">
                  <MapPin size={11} strokeWidth={2.25} />
                  {screenshot.annotation_count}
                </span>
              )}
              {(screenshot.version_count ?? 0) > 0 && (
                <span className="catalogue-card-version-btn">v{(screenshot.version_count ?? 0) + 1}</span>
              )}
            </div>
          )}

          <div className="catalogue-card-actions catalogue-family-card__media-actions">
            {REUPLOAD_ENABLED && (
              <button
                type="button"
                className="catalogue-card-action"
                title="Reupload variant"
                aria-label="Reupload variant"
                onClick={() => fileRef.current?.click()}
                disabled={!screenshot}
              >
                <RefreshCw size={14} />
              </button>
            )}
            {onToggleBookmark && screenshot && (
              <button
                type="button"
                className={`catalogue-card-action ${bookmarkedIds?.has(screenshot.id) ? 'is-bookmarked' : ''}`}
                title={bookmarkedIds?.has(screenshot.id) ? 'Remove bookmark' : 'Bookmark this screenshot'}
                aria-label={bookmarkedIds?.has(screenshot.id) ? 'Remove bookmark' : 'Bookmark this screenshot'}
                aria-pressed={bookmarkedIds?.has(screenshot.id) ?? false}
                onClick={() => onToggleBookmark(screenshot.id)}
              >
                <Bookmark
                  size={14}
                  fill={bookmarkedIds?.has(screenshot.id) ? 'currentColor' : 'none'}
                />
              </button>
            )}
            <button
              type="button"
              className="catalogue-card-action catalogue-card-action-danger"
              title="Delete screenshot"
              aria-label="Delete screenshot"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} />
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
                  <Smartphone size={12} aria-hidden="true" />
                </span>
              )}
              {platform === 'web' && (
                <span className="catalogue-card-platform-pill" title="Web" aria-label="Web">
                  <Monitor size={12} aria-hidden="true" />
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
