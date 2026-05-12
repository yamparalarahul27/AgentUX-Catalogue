import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';

import type {
  CatalogueGroupCategory,
  CatalogueGroupRegion,
} from '../lib/catalogue-group-appearance';

interface GroupAppearanceEditModalProps {
  group: string;
  labelDraft: string;
  iconUrlDraft: string;
  categoryDraft: CatalogueGroupCategory | null;
  regionDraft: CatalogueGroupRegion | null;
  hasUploadedIcon: boolean;
  isUploading: boolean;
  isSaving: boolean;
  message: string | null;
  onChangeLabel: (value: string) => void;
  onChangeCategory: (value: CatalogueGroupCategory | null) => void;
  onChangeRegion: (value: CatalogueGroupRegion | null) => void;
  onPickFile: (file: File) => void;
  onRemoveUploadedIcon: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS: { label: string; value: CatalogueGroupCategory | null }[] = [
  { label: 'CEX', value: 'cex' },
  { label: 'DEX', value: 'dex' },
  { label: 'None', value: null },
];

const REGION_OPTIONS: { label: string; value: CatalogueGroupRegion | null }[] = [
  { label: 'India', value: 'india' },
  { label: 'Global', value: 'global' },
  { label: 'None', value: null },
];

export function GroupAppearanceEditModal({
  group,
  labelDraft,
  iconUrlDraft,
  categoryDraft,
  regionDraft,
  hasUploadedIcon,
  isUploading,
  isSaving,
  message,
  onChangeLabel,
  onChangeCategory,
  onChangeRegion,
  onPickFile,
  onRemoveUploadedIcon,
  onSave,
  onCancel,
}: GroupAppearanceEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            onPickFile(file);
            return;
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onPickFile]);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onPickFile(file);
    }
  }

  return (
    <div className="group-edit-overlay" onClick={onCancel}>
      <div className="group-edit-modal" onClick={(event) => event.stopPropagation()}>
        <div className="group-edit-header">
          <h3>Edit Icon — {group}</h3>
          <button type="button" className="group-edit-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="group-edit-body">
          <div className="group-edit-preview">
            <div className="group-edit-preview-icon">
              {iconUrlDraft ? <img src={iconUrlDraft} alt="" aria-hidden="true" /> : <ImagePlus size={24} />}
            </div>
            <span className="group-edit-preview-label">{labelDraft.trim() || group}</span>
          </div>

          <label className="group-edit-field">
            <span>Display name</span>
            <input
              className="catalogue-filter"
              type="text"
              value={labelDraft}
              onChange={(event) => onChangeLabel(event.target.value)}
              placeholder="Group display name"
            />
          </label>

          <div className="group-edit-field">
            <span>Upload icon</span>
            <div
              className={`group-edit-dropzone${isDragging ? ' is-dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              <Upload size={20} strokeWidth={1.5} />
              <span>Drop, click, or paste an image here</span>
              <small>PNG · JPG · WEBP · GIF · SVG · max 2MB</small>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file);
                event.target.value = '';
              }}
            />
          </div>

          {hasUploadedIcon && (
            <button
              type="button"
              className="btn-secondary group-edit-remove"
              disabled={isUploading || isSaving}
              onClick={onRemoveUploadedIcon}
            >
              Remove uploaded icon
            </button>
          )}

          <div className="group-edit-field">
            <span>Type</span>
            <div className="group-edit-segmented" role="radiogroup" aria-label="Type">
              {CATEGORY_OPTIONS.map((option) => {
                const checked = categoryDraft === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className={`group-edit-segmented-option${checked ? ' is-active' : ''}`}
                    onClick={() => onChangeCategory(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="group-edit-field">
            <span>Region</span>
            <div className="group-edit-segmented" role="radiogroup" aria-label="Region">
              {REGION_OPTIONS.map((option) => {
                const checked = regionDraft === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className={`group-edit-segmented-option${checked ? ' is-active' : ''}`}
                    onClick={() => onChangeRegion(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {message && <div className="group-edit-message">{message}</div>}
        </div>

        <div className="group-edit-footer">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSaving || isUploading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onSave}
            disabled={isSaving || isUploading}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
