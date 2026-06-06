import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export interface FolderDropContext {
  // Single folder name when exactly one directory was dropped; null otherwise.
  folderName: string | null;
  // True when 2+ directories were dropped together. The drop should be
  // rejected by the caller.
  multipleFolders: boolean;
  // Count of non-image files that were filtered out of the drop.
  skippedNonImageCount: number;
}

interface UploadZoneProps {
  onFilesSelected: (files: File[], context?: FolderDropContext) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/tiff'];
const MOUNTED_PASTE_ZONE_IDS: string[] = [];
let activePasteZoneId: string | null = null;

function registerPasteZone(id: string) {
  if (!MOUNTED_PASTE_ZONE_IDS.includes(id)) {
    MOUNTED_PASTE_ZONE_IDS.push(id);
  }
  activePasteZoneId = id;
}

function unregisterPasteZone(id: string) {
  const index = MOUNTED_PASTE_ZONE_IDS.indexOf(id);
  if (index >= 0) {
    MOUNTED_PASTE_ZONE_IDS.splice(index, 1);
  }
  if (activePasteZoneId === id) {
    activePasteZoneId = MOUNTED_PASTE_ZONE_IDS[MOUNTED_PASTE_ZONE_IDS.length - 1] ?? null;
  }
}

function activatePasteZone(id: string) {
  if (!MOUNTED_PASTE_ZONE_IDS.includes(id)) return;
  activePasteZoneId = id;
}

// Exported so the Paste-from-Clipboard sibling button can reuse the
// same filtering + naming convention as the drop zone's paste handler.
export function isImageFile(file: File) {
  return file.type.startsWith('image/') || ACCEPTED_TYPES.includes(file.type);
}

function getFileExtensionFromType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType.startsWith('image/')) return mimeType.slice('image/'.length);
  return 'png';
}

export function withGeneratedName(file: File, index: number) {
  if (file.name && file.name.trim().length > 0) return file;
  const extension = getFileExtensionFromType(file.type || 'image/png');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([file], `pasted-image-${timestamp}-${index + 1}.${extension}`, { type: file.type || 'image/png' });
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readDirectoryChunk(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    );
  });
}

async function readDirectoryEntry(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = entry.createReader();
  const files: File[] = [];

  while (true) {
    const entries = await readDirectoryChunk(reader);
    if (entries.length === 0) break;

    for (const child of entries) {
      if (isFileEntry(child)) {
        const file = await readFileEntry(child);
        if (file) files.push(file);
        continue;
      }
      if (isDirectoryEntry(child)) {
        files.push(...await readDirectoryEntry(child));
      }
    }
  }

  return files;
}

interface ExtractedDrop {
  files: File[];
  folderName: string | null;
  multipleFolders: boolean;
  skippedNonImageCount: number;
}

function summarizeDrop(allFiles: File[], folderName: string | null, multipleFolders: boolean): ExtractedDrop {
  const imageFiles = allFiles.filter(isImageFile);
  return {
    files: imageFiles,
    folderName,
    multipleFolders,
    skippedNonImageCount: allFiles.length - imageFiles.length,
  };
}

async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<ExtractedDrop> {
  const items = Array.from(dataTransfer.items || []);
  // DataTransfer references become invalid after the first `await`, so snapshot
  // entries and any direct files synchronously before any async work.
  const directFiles = Array.from(dataTransfer.files || []);

  if (items.length === 0) {
    return summarizeDrop(directFiles, null, false);
  }

  const entries: FileSystemEntry[] = [];
  const syncFiles: File[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
      continue;
    }
    const file = item.getAsFile();
    if (file) syncFiles.push(file);
  }

  if (entries.length === 0) {
    return summarizeDrop(syncFiles.length > 0 ? syncFiles : directFiles, null, false);
  }

  const directoryEntries = entries.filter(isDirectoryEntry);
  const folderName = directoryEntries.length === 1 ? directoryEntries[0].name : null;
  const multipleFolders = directoryEntries.length > 1;

  const allFiles: File[] = [...syncFiles];
  for (const entry of entries) {
    if (isFileEntry(entry)) {
      const file = await readFileEntry(entry);
      if (file) allFiles.push(file);
      continue;
    }
    if (isDirectoryEntry(entry)) {
      allFiles.push(...await readDirectoryEntry(entry));
    }
  }
  return summarizeDrop(allFiles, folderName, multipleFolders);
}

export function UploadZone({ onFilesSelected, disabled }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneIdRef = useRef(`upload-zone-${Math.random().toString(36).slice(2)}`);

  const emitImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((file) => isImageFile(file));
    if (imageFiles.length > 0) onFilesSelected(imageFiles);
  }, [onFilesSelected]);

  const setPasteZoneActive = useCallback(() => {
    if (disabled) return;
    activatePasteZone(zoneIdRef.current);
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
      setPasteZoneActive();
    }
  }, [disabled, setPasteZoneActive]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const result = await extractDroppedFiles(e.dataTransfer);
    const context: FolderDropContext = {
      folderName: result.folderName,
      multipleFolders: result.multipleFolders,
      skippedNonImageCount: result.skippedNonImageCount,
    };
    // Always emit so the caller can react to context (multiple folders,
    // skipped non-images) even when no usable files were extracted.
    if (result.files.length > 0 || result.multipleFolders || result.skippedNonImageCount > 0) {
      onFilesSelected(result.files, context);
    }
  }, [disabled, onFilesSelected]);

  const handleClick = () => {
    if (disabled) return;
    setPasteZoneActive();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    emitImageFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = useCallback((event: ClipboardEvent) => {
    if (disabled) return;
    if (activePasteZoneId !== zoneIdRef.current) return;
    const target = event.target;
    if (isEditableTarget(target) && (!zoneRef.current || !zoneRef.current.contains(target as Node))) return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const itemFiles = Array.from(clipboardData.items)
      .filter((item) => item.kind === 'file' && (item.type.startsWith('image/') || ACCEPTED_TYPES.includes(item.type)))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    const rawFiles = itemFiles.length > 0 ? itemFiles : Array.from(clipboardData.files || []);
    const files = rawFiles
      .filter((file) => isImageFile(file))
      .map((file, index) => withGeneratedName(file, index));

    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFilesSelected(files);
  }, [disabled, onFilesSelected]);

  useEffect(() => {
    if (disabled) {
      unregisterPasteZone(zoneIdRef.current);
      return undefined;
    }
    registerPasteZone(zoneIdRef.current);
    return () => unregisterPasteZone(zoneIdRef.current);
  }, [disabled]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <div
      ref={zoneRef}
      className={`upload-zone ${isDragOver ? 'upload-zone-active' : ''} ${disabled ? 'upload-zone-disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onFocusCapture={setPasteZoneActive}
      onMouseEnter={setPasteZoneActive}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <Upload size={32} strokeWidth={1.5} />
      <p>Drop or click to upload</p>
      <span className="upload-zone-hint">PNG, JPG, WebP · Paste with Ctrl+V / Cmd+V</span>
    </div>
  );
}
