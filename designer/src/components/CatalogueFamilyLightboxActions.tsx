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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        {LIGHTBOX_REUPLOAD_ENABLED && (
          <button type="button" className="catalogue-lightbox-icon-btn" onClick={onReupload} title="Reupload">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
          </button>
        )}
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenCrop} disabled={!canCrop} title="Crop">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></svg>
        </button>
        <span className="catalogue-lightbox-icon-bar__spacer" />
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenComments} title={`Comments (${commentsCount})`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {commentsCount > 0 && <span className="catalogue-lightbox-icon-badge">{commentsCount}</span>}
        </button>
        <button type="button" className="catalogue-lightbox-icon-btn" onClick={onOpenAnnotations} title={`Annotations (${annotationsCount})`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3" /><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" /></svg>
          {annotationsCount > 0 && <span className="catalogue-lightbox-icon-badge">{annotationsCount}</span>}
        </button>
        <button type="button" className="catalogue-lightbox-icon-btn is-danger" onClick={onDelete} title="Delete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
