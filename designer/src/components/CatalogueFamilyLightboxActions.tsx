import { Check, Copy, Crop, MapPin, MessageCircle, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';

import { REUPLOAD_ENABLED } from '../lib/feature-flags';
import type { MobileOs, WebPreset } from '../types';
import { CatalogueFamilyLightboxInlineEditor } from './CatalogueFamilyLightboxInlineEditor';
import { CopyMorphIcon, useCopyConfirmation } from './CopyMorphIcon';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { Squircle } from './Squircle';

// Matches the existing border-radius: 10px on .catalogue-lightbox-icon-btn —
// the CSS rule stays as a fallback before the hook computes the clip-path.
const ICON_BTN_RADIUS = 10;

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
  // The parent owns the save animation now — this just toggles state.
  // When toggling from unsaved → saved, the parent fires the floppy
  // animation before calling its underlying state mutation.
  onToggleBookmark?: () => void;
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
  const { justCopied: justShared, confirm: confirmShareCopy } = useCopyConfirmation();
  // Labeling studio (hideCatalogueActions=true) suppresses every icon
  // here. With Edit also gated on !hideCatalogueActions and the inline
  // editor never opening in that mode, the whole summary wrapper has
  // nothing to render — skip it to avoid a stray empty bar above the
  // tabs. Reupload is feature-flagged false today; if it ever flips
  // true and gets added to labeling studio, revisit this guard.
  if (hideCatalogueActions && !isInlineEditing && !REUPLOAD_ENABLED) return null;
  return (
    <IconTooltipProvider>
    <div className="catalogue-family-lightbox__summary">
      <div className="catalogue-lightbox-icon-bar">
        {canEdit && !hideCatalogueActions && (
          <IconTooltip label={isInlineEditing ? 'Close edit' : 'Edit'}>
            <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn" onClick={onToggleInlineEdit} disabled={isSavingInline} aria-label={isInlineEditing ? 'Close edit' : 'Edit'}>
              <Pencil size={15} />
            </Squircle>
          </IconTooltip>
        )}
        {REUPLOAD_ENABLED && (
          <IconTooltip label="Reupload">
            <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn" onClick={onReupload} aria-label="Reupload">
              <RefreshCw size={15} />
            </Squircle>
          </IconTooltip>
        )}
        {!hideCatalogueActions && (
          <IconTooltip label="Crop">
            <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenCrop} disabled={!canCrop} aria-label="Crop">
              <Crop size={15} />
            </Squircle>
          </IconTooltip>
        )}
        {!hideCatalogueActions && onToggleBookmark && (
          <IconTooltip label={isBookmarked ? 'Unsave' : 'Save'}>
            <Squircle
              as="button"
              cornerRadius={ICON_BTN_RADIUS}
              type="button"
              className={`catalogue-lightbox-icon-btn ${isBookmarked ? 'is-bookmarked' : ''}`}
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? 'Unsave' : 'Save'}
              aria-pressed={Boolean(isBookmarked)}
            >
              <Save size={15} />
            </Squircle>
          </IconTooltip>
        )}
        {!hideCatalogueActions && onShareLink && (
          <IconTooltip label={justShared ? 'Copied!' : 'Copy share link'}>
            <Squircle
              as="button"
              cornerRadius={ICON_BTN_RADIUS}
              type="button"
              className="catalogue-lightbox-icon-btn"
              onClick={() => { onShareLink(); confirmShareCopy(); }}
              aria-label="Copy share link to this screenshot"
            >
              <CopyMorphIcon
                defaultIcon={<Copy size={15} />}
                confirmedIcon={<Check size={15} />}
                justCopied={justShared}
                size={15}
              />
            </Squircle>
          </IconTooltip>
        )}
        <span className="catalogue-lightbox-icon-bar__spacer" />
        {!hideCatalogueActions && (
          <>
            <IconTooltip label={`Comments (${commentsCount})`}>
              <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenComments} aria-label={`Comments (${commentsCount})`}>
                <MessageCircle size={15} />
                {commentsCount > 0 && <span className="catalogue-lightbox-icon-badge">{commentsCount}</span>}
              </Squircle>
            </IconTooltip>
            <IconTooltip label={`Annotations (${annotationsCount})`}>
              <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenAnnotations} aria-label={`Annotations (${annotationsCount})`}>
                <MapPin size={15} />
                {annotationsCount > 0 && <span className="catalogue-lightbox-icon-badge">{annotationsCount}</span>}
              </Squircle>
            </IconTooltip>
            {canDelete && (
              <IconTooltip label="Delete">
                <Squircle as="button" cornerRadius={ICON_BTN_RADIUS} type="button" className="catalogue-lightbox-icon-btn is-danger" onClick={onDelete} aria-label="Delete">
                  <Trash2 size={15} />
                </Squircle>
              </IconTooltip>
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
    </IconTooltipProvider>
  );
}
