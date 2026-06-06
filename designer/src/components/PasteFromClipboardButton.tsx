import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { Check, Clipboard } from 'lucide-react';

import { isImageFile, withGeneratedName } from './UploadZone';

interface Props {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

type Feedback =
  | { kind: 'idle' }
  | { kind: 'focused' }
  | { kind: 'success'; count: number }
  | { kind: 'empty' };

// Pull image files out of a synchronous paste event's DataTransfer —
// DataTransferItemList first, then `files` as a fallback, filtered to
// images and given a generated name.
function extractClipboardImages(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  const rawFiles = itemFiles.length > 0 ? itemFiles : Array.from(clipboardData.files || []);
  return rawFiles
    .filter((file) => isImageFile(file))
    .map((file, index) => withGeneratedName(file, index));
}

// Async fallback for when the synchronous paste event reports an image
// type but hands over zero files — a documented iPadOS behaviour when the
// image was copied from another app (e.g. X): clipboardData.types shows
// `image/png` but `files` is empty. navigator.clipboard.read() surfaces the
// bytes the paste event withheld. Called from inside the paste handler so
// it stays within the user's paste gesture, which is what WebKit requires
// to grant the read. No-ops on browsers without the async API.
async function readClipboardImagesAsync(): Promise<File[]> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    return [];
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    return [];
  }
  const collected: File[] = [];
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    try {
      const blob = await item.getType(imageType);
      collected.push(new File([blob], '', { type: imageType }));
    } catch {
      // Skip this item; keep walking.
    }
  }
  return collected.map((file, index) => withGeneratedName(file, index));
}

// Compact paste-from-clipboard link, rendered beneath the drop zone in
// the Quick Upload panel. The visible element is a contenteditable
// surface styled as a text link — clicking focuses it (cursor lands
// inside), then the user pastes via ⌘V on desktop or long-press →
// Paste on iOS Universal Clipboard.
//
// Paste delivery has two iOS gaps, so the handler tries both primitives:
//   1. The synchronous `paste` event's DataTransfer — works for ⌘V on
//      desktop and Universal Clipboard images from an iPhone.
//   2. navigator.clipboard.read() — the only path that surfaces images
//      copied from another app on iPadOS, where the paste event reports
//      an image type but zero files.
// Sync first; fall back to the async read only when sync yields nothing.
//
// Child elements are marked `contentEditable={false}` so the icon and
// labels are not editable — only the outer surface accepts paste.
export function PasteFromClipboardButton({ onFilesSelected, disabled = false }: Props) {
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const editableRef = useRef<HTMLDivElement>(null);

  // Auto-fade success / empty states so the link returns to its resting
  // copy after the user moves on.
  useEffect(() => {
    if (feedback.kind === 'idle' || feedback.kind === 'focused') return;
    const timeout = setTimeout(() => setFeedback({ kind: 'idle' }), 2400);
    return () => clearTimeout(timeout);
  }, [feedback]);

  function commitFiles(files: File[]) {
    onFilesSelected(files);
    setFeedback({ kind: 'success', count: files.length });
    clearEditable();
    editableRef.current?.blur();
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    // Always swallow the paste so nothing visible lands inside the
    // contenteditable. The outer element gets cleared post-handle.
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;

    // Read the DataTransfer synchronously — it is only valid inside the
    // event, before any await.
    const syncFiles = extractClipboardImages(event.clipboardData);
    if (syncFiles.length > 0) {
      commitFiles(syncFiles);
      return;
    }

    // Sync paste delivered no image bytes (the iPadOS cross-app case).
    // Try the async Clipboard API before declaring the clipboard empty.
    void readClipboardImagesAsync().then((asyncFiles) => {
      if (asyncFiles.length > 0) {
        commitFiles(asyncFiles);
      } else {
        setFeedback({ kind: 'empty' });
        clearEditable();
      }
    });
  }

  function clearEditable() {
    if (editableRef.current) editableRef.current.innerHTML = '';
  }

  function handleFocus() {
    if (disabled) return;
    if (feedback.kind === 'idle') setFeedback({ kind: 'focused' });
  }

  function handleBlur() {
    if (feedback.kind === 'focused') setFeedback({ kind: 'idle' });
    clearEditable();
  }

  function handleClick() {
    if (disabled) return;
    editableRef.current?.focus();
  }

  const variant = feedback.kind === 'success' ? 'success'
    : feedback.kind === 'empty' ? 'warn'
    : feedback.kind === 'focused' ? 'active'
    : 'idle';

  const label = feedback.kind === 'success' ? 'Pasted' : 'Paste from clipboard';
  const hint = (() => {
    switch (feedback.kind) {
      case 'focused':
        return 'Press ⌘V — or long-press → Paste';
      case 'success':
        return `Added ${feedback.count} image${feedback.count === 1 ? '' : 's'}`;
      case 'empty':
        return 'No image in clipboard';
      default:
        return 'iPhone supported · long-press → Paste';
    }
  })();

  return (
    <div
      ref={editableRef}
      role="button"
      aria-label="Paste image from clipboard"
      tabIndex={disabled ? -1 : 0}
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={`catalogue-paste-link catalogue-paste-link--${variant}`}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPaste={handlePaste}
      onKeyDown={(event) => {
        // Strip every typed character that isn't paste — keep the
        // contenteditable empty so it visually behaves like a link.
        // The browser's default paste keystroke (⌘V / Ctrl+V) reaches
        // the onPaste handler before this onKeyDown fires.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;
        if (event.key === 'Enter' || event.key === ' ') {
          // Allow space / enter as visual click — but don't insert chars.
          event.preventDefault();
          return;
        }
        event.preventDefault();
      }}
      spellCheck={false}
      data-disabled={disabled || undefined}
    >
      <span className="catalogue-paste-link__icon" contentEditable={false} aria-hidden="true">
        {variant === 'success' ? <Check size={14} /> : <Clipboard size={14} />}
      </span>
      <span className="catalogue-paste-link__label" contentEditable={false}>
        {label}
      </span>
      <span className="catalogue-paste-link__sep" contentEditable={false} aria-hidden="true" />
      <span className="catalogue-paste-link__hint" contentEditable={false}>
        {hint}
      </span>
    </div>
  );
}
