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

// Compact paste-from-clipboard link, rendered beneath the drop zone in
// the Quick Upload panel. The visible element is a contenteditable
// surface styled as a text link — clicking focuses it (cursor lands
// inside), then the user pastes via ⌘V on desktop or long-press →
// Paste on iOS Universal Clipboard.
//
// The contenteditable mechanic is what makes iOS work — the native
// `paste` event delivers the clipboard bytes (including images
// transferred via Universal Clipboard), which `navigator.clipboard.read()`
// doesn't reliably provide on iOS Safari.
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

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    // Always swallow the paste so nothing visible lands inside the
    // contenteditable. The outer element gets cleared post-handle.
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      setFeedback({ kind: 'empty' });
      return;
    }

    // Extract image files the same way UploadZone's window paste handler
    // does — DataTransferItemList first, then clipboardData.files as a
    // fallback. Filter to image MIME types.
    const itemFiles = Array.from(clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    const rawFiles = itemFiles.length > 0 ? itemFiles : Array.from(clipboardData.files || []);
    const files = rawFiles
      .filter((file) => isImageFile(file))
      .map((file, index) => withGeneratedName(file, index));

    if (files.length === 0) {
      setFeedback({ kind: 'empty' });
      clearEditable();
      return;
    }

    onFilesSelected(files);
    setFeedback({ kind: 'success', count: files.length });
    clearEditable();
    editableRef.current?.blur();
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

  const label = (() => {
    switch (feedback.kind) {
      case 'success':
        return `Pasted · ${feedback.count} image${feedback.count === 1 ? '' : 's'}`;
      case 'empty':
        return 'No image in clipboard';
      default:
        return 'Paste from clipboard';
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
    </div>
  );
}
