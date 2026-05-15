import { useEffect } from 'react';

interface Args {
  enabled: boolean;
  onPaste: (files: File[]) => void;
}

const IMAGE_MIME_PREFIX = 'image/';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

function extensionFromMime(mime: string): string {
  // mime is like "image/png" — return "png"; fall back to "bin" for safety.
  const slash = mime.indexOf('/');
  if (slash < 0) return 'bin';
  return mime.slice(slash + 1) || 'bin';
}

function pastedFileName(mime: string, index: number): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const suffix = index > 0 ? `-${index}` : '';
  return `pasted-${yyyy}-${mm}-${dd}-${hh}-${mi}-${ss}${suffix}.${extensionFromMime(mime)}`;
}

// Global Cmd+V / Ctrl+V → read clipboard → if any images, hand them to onPaste.
// - Suppressed when the focused element is an input / textarea / contenteditable
//   so normal paste-into-field behaviour wins.
// - Browsers that don't expose navigator.clipboard.read() (older Safari, Firefox
//   without permission) silently no-op. The user just doesn't get the shortcut.
export function usePasteToUpload({ enabled, onPaste }: Args) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return;

    async function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'v' && event.key !== 'V') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey) return;
      if (isEditableTarget(event.target)) return;

      // preventDefault BEFORE the async clipboard.read so the browser
      // does not also fire the native `paste` event. Without this, any
      // mounted UploadZone (e.g., the open Quick Upload modal) would
      // re-handle the same paste via its own window-level paste
      // listener — both pathways inserting into the queue with
      // different file names (`pasted-…png` here vs `image.png` from
      // clipboardData.items[].getAsFile()) and bypassing the dedupe.
      event.preventDefault();

      let items: ClipboardItem[];
      try {
        items = await navigator.clipboard.read();
      } catch {
        return;
      }

      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (!type.startsWith(IMAGE_MIME_PREFIX)) continue;
          try {
            const blob = await item.getType(type);
            const name = pastedFileName(type, files.length);
            files.push(new File([blob], name, { type }));
          } catch {
            // Skip this item; keep walking.
          }
          break; // Take the first image type per item; don't double-add.
        }
      }

      if (files.length === 0) return;
      onPaste(files);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onPaste]);
}
