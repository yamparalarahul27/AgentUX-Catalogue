import { Crop, MapPin, MessageCircle, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { LIGHTBOX_REUPLOAD_ENABLED } from '../lib/feature-flags';
import type { MobileOs, WebPreset } from '../types';
import { CatalogueFamilyLightboxInlineEditor } from './CatalogueFamilyLightboxInlineEditor';

interface CatalogueFamilyLightboxActionsProps {
  annotationsCount: number;
  commentsCount: number;
  existingGroups: string[];
  flowDraft: string;
  groupDraft: string;
  isInlineEditing: boolean;
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
  existingGroups,
  flowDraft,
  groupDraft,
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
}: CatalogueFamilyLightboxActionsProps) {
  return (
    <div className="catalogue-family-lightbox__summary" style={{ borderTop: 0, borderRadius: '0 0 16px 16px' }}>
      <div className="catalogue-lightbox-icon-bar">
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onToggleInlineEdit} disabled={isSavingInline} title={isInlineEditing ? 'Close edit' : 'Edit'}>
          <Pencil size={15} />
        </button>
        {LIGHTBOX_REUPLOAD_ENABLED && (
          <button type="button" className="catalogue-lightbox-icon-btn" onClick={onReupload} title="Reupload">
            <RefreshCw size={15} />
          </button>
        )}
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenCrop} disabled={!canCrop} title="Crop">
          <Crop size={15} />
        </button>
        <span className="catalogue-lightbox-icon-bar__spacer" />
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenComments} title={`Comments (${commentsCount})`}>
          <MessageCircle size={15} />
          {commentsCount > 0 && <span className="catalogue-lightbox-icon-badge">{commentsCount}</span>}
        </button>
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenAnnotations} title={`Annotations (${annotationsCount})`}>
          <MapPin size={15} />
          {annotationsCount > 0 && <span className="catalogue-lightbox-icon-badge">{annotationsCount}</span>}
        </button>
        <button type="button" className="catalogue-lightbox-icon-btn is-danger" onClick={onDelete} title="Delete">
          <Trash2 size={15} />
        </button>
      </div>
      {isInlineEditing && (
        <CatalogueFamilyLightboxInlineEditor
          existingGroups={existingGroups}
          flowDraft={flowDraft}
          groupDraft={groupDraft}
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
