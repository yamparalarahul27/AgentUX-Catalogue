// Native share with graceful copy fallback.
//
// On mobile (and any browser exposing the Web Share API) `shareOrCopyUrl`
// opens the real OS share sheet. Everywhere else — desktop Chrome/Firefox,
// locked-down contexts — it silently falls back to copying the URL to the
// clipboard. Callers toast based on the returned `method`.
//
// MUST be called synchronously from a user gesture (button click). Callers
// build the URL synchronously (no network) before calling, so nothing awaits
// ahead of navigator.share() — Safari rejects a share not tied to a gesture.

export type ShareMethod = 'shared' | 'copied' | 'cancelled' | 'failed';

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / locked clipboard / non-HTTPS — textarea fallback.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

// Open the OS share sheet when supported; otherwise copy the URL.
// Returns how it resolved so callers can pick the right feedback:
//   'shared'    — OS sheet completed (no toast needed; the sheet is the feedback)
//   'cancelled' — user dismissed the sheet (stay silent)
//   'copied'    — fell back to clipboard (toast "Link copied")
//   'failed'    — both share and copy failed (toast an error)
export async function shareOrCopyUrl(params: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareMethod> {
  const { url, title, text } = params;

  if (canNativeShare()) {
    try {
      await navigator.share({ url, title, text });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet — not an error, and don't fall back to copy
      // (that would surprise them with a clipboard write they didn't ask for).
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Any other failure (NotAllowedError, unsupported payload) → copy.
    }
  }

  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}
