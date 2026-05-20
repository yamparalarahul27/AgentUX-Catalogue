import { Check, Copy, Crop, MapPin, MessageCircle, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';

import { REUPLOAD_ENABLED } from '../lib/feature-flags';
import type { MobileOs, WebPreset } from '../types';
import { CatalogueFamilyLightboxInlineEditor } from './CatalogueFamilyLightboxInlineEditor';
import { useSaveAnimation } from './SaveAnimation';
import { CopyMorphIcon, useCopyConfirmation } from './CopyMorphIcon';

interface CatalogueFamilyLightboxActionsProps {
  annotationsCount: number;
  commentsCount: number;
  existingFlows: string[];
  existingGroups: string[];
  flowDraft: string;
  groupDraft: string;
  suggestedGroup?: string | null;
  isInlineEditing: boolean;
  // Capability + ownership gates. RLS enforces server-side; these
  // just hide affordances the caller can't act on.
  canEdit: boolean;
  canDelete: boolean;
  isSavingInline: boolean;
  hasReference: boolean;
  mobileOsDraft: MobileOs | null;
  nameDraft: string;
  platformDraft: 'mobile' | 'web' | null;
  referenceFileName: string | null;
  referenceLabelDraft: string;
  themeDraft: 'light' | 'dark' | null;
  webPresetDraft: string | null;
  webPresets: WebPreset[];
  canCrop: boolean;
  hideCatalogueActions?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  // Source image for the parabolic save-to-Saved animation. The
  // animation only fires when toggling INTO the saved state (not on
  // unsave). Omit to skip the animation.
  saveAnimationImageUrl?: string;
  // Single-screenshot share. Optional — if omitted, the Share icon
  // isn't rendered (e.g., when the lightbox shows a non-shareable
  // surface like the Labelling Studio context).
  onShareLink?: () => void;
  onDelete: () => void;
  onFlowChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onMobileOsChange: (value: MobileOs | null) => void;
  onNameChange: (value: string) => void;
  onOpenAnnotations: () => void;
  onOpenComments: () => void;
  onOpenCrop: () => void;
  onPlatformChange: (value: 'mobile' | 'web' | null) => void;
  onReferenceFileSelect: (file: File | null) => void;
  onReferenceLabelChange: (value: string) => void;
  onReupload: () => void;
  onSave: () => void;
  onThemeChange: (value: 'light' | 'dark' | null) => void;
  onToggleInlineEdit: () => void;
  onWebPresetChange: (value: string | null) => void;
}

export function CatalogueFamilyLightboxActions({
  annotationsCount,
  commentsCount,
  existingFlows,
  existingGroups,
  flowDraft,
  groupDraft,
  suggestedGroup,
  hasReference,
  isInlineEditing,
  isSavingInline,
  mobileOsDraft,
  nameDraft,
  platformDraft,
  referenceFileName,
  referenceLabelDraft,
  themeDraft,
  webPresetDraft,
  webPresets,
  canCrop,
  hideCatalogueActions = false,
  isBookmarked,
  onToggleBookmark,
  saveAnimationImageUrl,
  onShareLink,
  onDelete,
  onFlowChange,
  onGroupChange,
  onMobileOsChange,
  onNameChange,
  onOpenAnnotations,
  onOpenComments,
  onOpenCrop,
  onPlatformChange,
  onReferenceFileSelect,
  onReferenceLabelChange,
  onReupload,
  onSave,
  onThemeChange,
  onToggleInlineEdit,
  onWebPresetChange,
  canEdit,
  canDelete,
}: CatalogueFamilyLightboxActionsProps) {
  const { flyFromButton } = useSaveAnimation();
  const { justCopied: justShared, confirm: confirmShareCopy } = useCopyConfirmation();
  return (
    <div className="catalogue-family-lightbox__summary" style={{ borderTop: 0, borderRadius: '0 0 16px 16px' }}>
      <div className="catalogue-lightbox-icon-bar">
        {canEdit && (
          <button type="button" className="catalogue-lightbox-icon-btn" onClick={onToggleInlineEdit} disabled={isSavingInline} title={isInlineEditing ? 'Close edit' : 'Edit'}>
            <Pencil size={15} />
          </button>
        )}
        {REUPLOAD_ENABLED && (
          <button type="button" className="catalogue-lightbox-icon-btn" onClick={onReupload} title="Reupload">
            <RefreshCw size={15} />
          </button>
        )}
        {!hideCatalogueActions && (
          <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenCrop} disabled={!canCrop} title="Crop">
            <Crop size={15} />
          </button>
        )}
        {!hideCatalogueActions && onToggleBookmark && (
          <button
            type="button"
            className={`catalogue-lightbox-icon-btn ${isBookmarked ? 'is-bookmarked' : ''}`}
            onClick={(event) => {
              if (!isBookmarked && saveAnimationImageUrl) {
                flyFromButton(event.currentTarget, saveAnimationImageUrl);
              }
              onToggleBookmark();
            }}
            title={isBookmarked ? 'Unsave' : 'Save'}
            aria-pressed={Boolean(isBookmarked)}
          >
            <Save size={15} />
          </button>
        )}
        {!hideCatalogueActions && onShareLink && (
          <button
            type="button"
            className="catalogue-lightbox-icon-btn"
            onClick={() => { onShareLink(); confirmShareCopy(); }}
            title={justShared ? 'Copied!' : 'Copy share link to this screenshot'}
            aria-label="Copy share link to this screenshot"
          >
            <CopyMorphIcon
              defaultIcon={<Copy size={15} />}
              confirmedIcon={<Check size={15} />}
              justCopied={justShared}
              size={15}
            />
          </button>
        )}
        <span className="catalogue-lightbox-icon-bar__spacer" />
        {!hideCatalogueActions && (
          <>
            <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenComments} title={`Comments (${commentsCount})`}>
              <MessageCircle size={15} />
              {commentsCount > 0 && <span className="catalogue-lightbox-icon-badge">{commentsCount}</span>}
            </button>
            <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenAnnotations} title={`Annotations (${annotationsCount})`}>
              <MapPin size={15} />
              {annotationsCount > 0 && <span className="catalogue-lightbox-icon-badge">{annotationsCount}</span>}
            </button>
            {canDelete && (
              <button type="button" className="catalogue-lightbox-icon-btn is-danger" onClick={onDelete} title="Delete">
                <Trash2 size={15} />
              </button>
            )}
          </>
        )}
      </div>
      {isInlineEditing && (
        <CatalogueFamilyLightboxInlineEditor
          existingFlows={existingFlows}
          existingGroups={existingGroups}
          flowDraft={flowDraft}
          groupDraft={groupDraft}
          suggestedGroup={suggestedGroup}
          hasReference={hasReference}
          isSaving={isSavingInline}
          mobileOsDraft={mobileOsDraft}
          nameDraft={nameDraft}
          platformDraft={platformDraft}
          referenceFileName={referenceFileName}
          referenceLabelDraft={referenceLabelDraft}
          themeDraft={themeDraft}
          webPresetDraft={webPresetDraft}
          webPresets={webPresets}
          onCancel={onToggleInlineEdit}
          onFlowChange={onFlowChange}
          onGroupChange={onGroupChange}
          onMobileOsChange={onMobileOsChange}
          onNameChange={onNameChange}
          onPlatformChange={onPlatformChange}
          onReferenceFileSelect={onReferenceFileSelect}
          onReferenceLabelChange={onReferenceLabelChange}
          onSave={onSave}
          onThemeChange={onThemeChange}
          onWebPresetChange={onWebPresetChange}
        />
      )}
    </div>
  );
}
