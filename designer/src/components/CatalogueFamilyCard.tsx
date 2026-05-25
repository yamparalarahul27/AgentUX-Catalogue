import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Check, Copy, MapPin, Monitor, RefreshCw, Save, Smartphone, Trash2 } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { REFERENCE_IMAGES_ENABLED, REUPLOAD_ENABLED } from '../lib/feature-flags';
// import { getGroupColor } from '../lib/naming'; // unused while group colour dot is disabled — see catalogue-card-dot note in render
import { ConfirmModal } from './ConfirmModal';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { ThumbHashImage } from './ThumbHashImage';
import { useSaveTrashAnimation } from './SaveTrashAnimation';
import { CopyMorphIcon, useCopyConfirmation } from './CopyMorphIcon';
import { getSkipDeleteConfirm, setSkipDeleteConfirm } from '../lib/delete-confirm-pref';

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
  const { triggerSave, triggerDelete } = useSaveTrashAnimation();
  const { justCopied: justShared, confirm: confirmShareCopy } = useCopyConfirmation();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  // When the delete animation is running, hide the underlying card
  // image so it doesn't double with the animation overlay's ghost.
  const [isAnimatingDelete, setIsAnimatingDelete] = useState(false);
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
  // Count UI Element tags from the screenshot's label metadata. Used by
  // the indicator badge on the card so users see at a glance which shots
  // have curated/promoted UI Elements. Reads the nested jsonb path
  // defensively because labels can be missing entirely on older shots.
  const uiElementCount = (() => {
    const metadata = screenshot?.metadata as Record<string, unknown> | undefined;
    const label = metadata?.label as Record<string, unknown> | undefined;
    const screenAnalysis = label?.screen_analysis as Record<string, unknown> | undefined;
    const list = screenAnalysis?.ui_elements;
    return Array.isArray(list) ? list.length : 0;
  })();
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

  function confirmDelete() {
    if (isDeleting) return;
    const rect = imageWrapRef.current?.getBoundingClientRect();
    if (!rect) {
      // Fallback — no DOM rect (shouldn't happen). Skip the animation
      // and just dissolve the card the legacy way.
      setIsDeleting(true);
      setIsRemoving(true);
      setShowDeleteConfirm(false);
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 340));
        try { await onDeleteFamily(family.id); } finally { setIsDeleting(false); }
      })();
      return;
    }
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    setIsAnimatingDelete(true);
    // The animation overlay drives the visuals. onComplete fires
    // partway through (when the ball lands in the trash) — that's when
    // we commit the underlying soft-delete so the row drops from the
    // grid in sync with the visual landing.
    triggerDelete({
      sourceRect: rect,
      screenshotUrl: screenshot?.image_url ?? null,
      thumbHash: screenshot?.thumb_hash ?? null,
      onComplete: () => {
        // Mutation runs after the visual lands. Card unmounts when
        // parent re-renders the filtered list.
        void onDeleteFamily(family.id).finally(() => setIsDeleting(false));
      },
    });
  }

  return (
    <>
      <article className={`catalogue-card catalogue-family-card ${isSelected ? 'catalogue-card--selected is-selected' : ''} ${isRemoving ? 'is-removing' : ''} ${isAnimatingDelete ? 'is-animating-delete' : ''}`} data-family-id={family.id}>
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
            <div ref={imageWrapRef} className="catalogue-card-image">
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
              {uiElementCount > 0 && (
                <span className="catalogue-card-ui-btn" title={`${uiElementCount} UI Element${uiElementCount === 1 ? '' : 's'} tagged`}>
                  <Boxes size={11} strokeWidth={2.25} />
                  {uiElementCount}
                </span>
              )}
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
                  // The card-actions row sits inside the preview <button>
                  // that opens the lightbox. Stop the click here so save
                  // doesn't also open the lightbox.
                  event.stopPropagation();
                  const wasBookmarked = bookmarkedIds?.has(screenshot.id) ?? false;
                  if (wasBookmarked) {
                    // Unsave — no animation needed, just toggle.
                    onToggleBookmark(screenshot.id);
                    return;
                  }
                  const rect = imageWrapRef.current?.getBoundingClientRect();
                  if (!rect) {
                    // No DOM rect — graceful skip of the animation.
                    onToggleBookmark(screenshot.id);
                    return;
                  }
                  // Floppy slides in from the left, screenshot jumps
                  // into it, both fly off up-right. Mutation commits
                  // mid-flight via onComplete so the saved-state
                  // indicator flips before the floppy exits.
                  triggerSave({
                    sourceRect: rect,
                    screenshotUrl: screenshot.image_url || null,
                    thumbHash: screenshot.thumb_hash ?? null,
                    onComplete: () => onToggleBookmark(screenshot.id),
                  });
                }}
              >
                <Save size={14} />
              </button>
            )}
            {onShareLink && screenshot && (
              <button
                type="button"
                className="catalogue-card-action"
                title={justShared ? 'Copied!' : 'Copy share link to this screenshot'}
                aria-label="Copy share link to this screenshot"
                onClick={(event) => {
                  // Inside the preview button — stop bubbling so we
                  // don't also open the lightbox.
                  event.stopPropagation();
                  onShareLink(screenshot.id);
                  confirmShareCopy();
                }}
              >
                <CopyMorphIcon
                  defaultIcon={<Copy size={14} />}
                  confirmedIcon={<Check size={14} />}
                  justCopied={justShared}
                  size={14}
                />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="catalogue-card-action catalogue-card-action-danger"
                title="Delete screenshot"
                aria-label="Delete screenshot"
                onClick={(event) => {
                  event.stopPropagation();
                  // Skip the modal if the user previously ticked "Don't
                  // show again" — go straight to the trash animation.
                  if (getSkipDeleteConfirm()) {
                    confirmDelete();
                  } else {
                    setShowDeleteConfirm(true);
                  }
                }}
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
          confirmLabel="Move to Trash"
          dontShowAgainLabel="Don't show this confirmation again"
          onConfirm={(options) => {
            if (isDeleting) return;
            if (options?.dontShowAgain) setSkipDeleteConfirm(true);
            confirmDelete();
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
