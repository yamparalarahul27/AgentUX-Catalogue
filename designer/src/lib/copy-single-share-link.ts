// Copy a single-screenshot share URL to the clipboard.
//
// Used by the lightbox + card overlay Share buttons. Builds the URL
// via buildShareUrl({ mode: 'single' }) and copies via the async
// Clipboard API. Returns { ok: boolean } so callers can fire a toast.
//
// Companion code:
//   - lib/share-url.ts (buildShareUrl)
//   - components/CatalogueFamilyLightboxActions.tsx (lightbox button)
//   - components/CatalogueFamilyCard.tsx (card hover overlay button)

import { buildShareUrl } from './share-url';

export async function copySingleScreenshotShareLink(
  screenshotId: string,
  options?: { by?: string | null },
): Promise<{ ok: boolean }> {
  const url = buildShareUrl({
    mode: 'single',
    screenshotId,
    by: options?.by ?? null,
  });

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true };
  } catch {
    // Older browsers / locked clipboard / non-HTTPS — fall back to a
    // textarea trick. Returns ok: true if successful, false otherwise.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return { ok };
    } catch {
      return { ok: false };
    }
  }
}
