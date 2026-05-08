import { useEffect, useState } from 'react';

const IMAGE_MIME_PREFIX = 'image/';
const MAX_FILES_PER_DROP = 200;

export interface DropStats {
  skipped: number;
  truncated: number;
}

interface Args {
  enabled: boolean;
  onDrop: (files: File[], stats: DropStats) => void;
}

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

function isImageFile(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME_PREFIX);
}

async function readEntryAsFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function readTopLevelDirectory(dir: FileSystemDirectoryEntry): Promise<{ files: File[]; skipped: number }> {
  const files: File[] = [];
  let skipped = 0;
  const reader = dir.createReader();

  // readEntries returns up to 100 per call; keep reading until empty.
  while (true) {
    const batch: FileSystemEntry[] = await new Promise((resolve) => {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      );
    });
    if (batch.length === 0) break;
    for (const entry of batch) {
      if (!entry.isFile) continue; // top-level folders only — skip subdirectories
      if (isHidden(entry.name)) continue;
      const file = await readEntryAsFile(entry as FileSystemFileEntry);
      if (!file) continue;
      if (isImageFile(file)) {
        files.push(file);
      } else {
        skipped += 1;
      }
    }
  }

  return { files, skipped };
}

async function extractFiles(
  items: DataTransferItemList,
): Promise<{ files: File[]; skipped: number; truncated: number }> {
  const collected: File[] = [];
  let skipped = 0;
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== 'file') continue;

    const entry: FileSystemEntry | null = item.webkitGetAsEntry?.() ?? null;

    if (entry?.isDirectory) {
      tasks.push(
        readTopLevelDirectory(entry as FileSystemDirectoryEntry).then(({ files: folderFiles, skipped: folderSkipped }) => {
          collected.push(...folderFiles);
          skipped += folderSkipped;
        }),
      );
    } else if (entry?.isFile) {
      tasks.push(
        readEntryAsFile(entry as FileSystemFileEntry).then((file) => {
          if (!file) return;
          if (isHidden(file.name)) return;
          if (isImageFile(file)) collected.push(file);
          else skipped += 1;
        }),
      );
    } else {
      // Fallback when webkitGetAsEntry isn't supported.
      const file = item.getAsFile();
      if (!file) continue;
      if (isHidden(file.name)) continue;
      if (isImageFile(file)) collected.push(file);
      else skipped += 1;
    }
  }

  await Promise.all(tasks);

  let truncated = 0;
  let files = collected;
  if (collected.length > MAX_FILES_PER_DROP) {
    truncated = collected.length - MAX_FILES_PER_DROP;
    files = collected.slice(0, MAX_FILES_PER_DROP);
  }

  return { files, skipped, truncated };
}

// Global drag-and-drop on the catalogue page. Files dropped anywhere on the
// window get walked (top-level folders are recursed one level deep, deeper
// nesting is skipped), filtered to images, capped at 200, and handed back
// via onDrop. Returns a flag the consumer renders an overlay against.
export function useDropToUpload({ enabled, onDrop }: Args) {
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDragActive(false);
      return;
    }
    if (typeof window === 'undefined') return;

    let counter = 0;

    function handleDragEnter(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      counter += 1;
      setDragActive(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragActive(false);
    }

    async function handleDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      counter = 0;
      setDragActive(false);

      const items = event.dataTransfer?.items;
      if (!items || items.length === 0) return;

      const result = await extractFiles(items);
      if (result.files.length === 0 && result.skipped === 0) return;
      onDrop(result.files, { skipped: result.skipped, truncated: result.truncated });
    }

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [enabled, onDrop]);

  return { dragActive };
}
