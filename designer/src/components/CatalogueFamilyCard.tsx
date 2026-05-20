import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link2, MapPin, Monitor, RefreshCw, Save, Smartphone, Trash2 } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { REFERENCE_IMAGES_ENABLED, REUPLOAD_ENABLED } from '../lib/feature-flags';
// import { getGroupColor } from '../lib/naming'; // unused while group colour dot is disabled — see catalogue-card-dot note in render
import { ConfirmModal } from './ConfirmModal';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { ThumbHashImage } from './ThumbHashImage';
import { useSaveAnimation } from './SaveAnimation';

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
  // Single-screenshot share — parent copies the link + shows a toast.
  // Optional so callers that don't want sharing (none today) can omit.
  onShareLink?: (screenshotId: string) => void;
  // Capability + ownership gate. RLS already blocks delete attempts the
  // caller isn't entitled to; this prop just hides the affordance to
  // avoid showing a button that silently fails.
  canDelete: boolean;
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
  onShareLink,
  canDelete,
}: CatalogueFamilyCardProps) {
  const { flyFromButton } = useSaveAnimation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(family.name);
  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey),
    [activeVariantKey, family],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const imageUrl = screenshot?.image_url ?? '';
  // const groupColor = getGroupColor(family.group); // unused while .catalogue-card-dot is commented out below
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
    setIsRemoving(true);
    setShowDeleteConfirm(false);
    // Let the dissolve animation play, then run the actual delete.
    // The card unmounts when the parent filters this family out, so
    // setIsDeleting(false) in finally fires on an unmounted node — no-op.
    await new Promise((resolve) => setTimeout(resolve, 340));
    try {
      await onDeleteFamily(family.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <article className={`catalogue-card catalogue-family-card ${isSelected ? 'catalogue-card--selected is-selected' : ''} ${isRemoving ? 'is-removing' : ''}`} data-family-id={family.id}>
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
              {REFERENCE_IMAGES_ENABLED && screenshot.reference_url && <span className="catalogue-card-ref-btn">Ref</span>}
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
                title={bookmarkedIds?.has(screenshot.id) ? 'Unsave' : 'Save this screenshot'}
                aria-label={bookmarkedIds?.has(screenshot.id) ? 'Unsave' : 'Save this screenshot'}
                aria-pressed={bookmarkedIds?.has(screenshot.id) ?? false}
                onClick={(event) => {
                  const wasBookmarked = bookmarkedIds?.has(screenshot.id) ?? false;
                  onToggleBookmark(screenshot.id);
                  if (!wasBookmarked && screenshot.image_url) {
                    flyFromButton(event.currentTarget, screenshot.image_url);
                  }
                }}
              >
                <Save size={14} />
              </button>
            )}
            {onShareLink && screenshot && (
              <button
                type="button"
                className="catalogue-card-action"
                title="Copy share link to this screenshot"
                aria-label="Copy share link to this screenshot"
                onClick={() => onShareLink(screenshot.id)}
              >
                <Link2 size={14} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="catalogue-card-action catalogue-card-action-danger"
                title="Delete screenshot"
                aria-label="Delete screenshot"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={14} />
              </button>
            )}
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
              {/* Group colour dot — not useful in the current setup. The
                  groupColors map in lib/naming.ts only assigns unique colours
                  to generic groups (auth/dashboard/settings/…), and every
                  brand-based group (bybit, binance, …) falls through to the
                  same indigo fallback. The Group icon (avatar) already
                  conveys identity, so the dot is redundant. Keeping the
                  groupColor derivation in case we want to revive a dot
                  with per-group hashed colours later. */}
              {/* <span className="catalogue-card-dot" style={{ background: groupColor }} /> */}
              <CatalogueGroupLabel
                className="catalogue-family-card__group"
                group={family.group}
                projectId={null}
                linkTo={family.group ? `/g/${encodeURIComponent(family.group.trim().toLowerCase())}` : undefined}
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
          title="Move to Trash"
          message={`Move "${family.name}" to Trash? Recoverable for 15 days from Settings → Team → Trash.`}
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
