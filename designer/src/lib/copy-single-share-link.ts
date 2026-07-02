// Share (or copy) a single-screenshot share URL.
//
// Used by the lightbox + card overlay Share buttons. Builds the URL via
// buildShareUrl({ mode: 'single' }) and hands it to shareOrCopyUrl: the OS
// share sheet on mobile, clipboard copy everywhere else. Returns the resolved
// `method` so callers can fire the right toast.
//
// Companion code:
//   - lib/share-url.ts (buildShareUrl)
//   - lib/native-share.ts (shareOrCopyUrl)
//   - components/CatalogueFamilyLightboxActions.tsx (lightbox button)
//   - components/CatalogueFamilyCard.tsx (card hover overlay button)

import { buildShareUrl } from './share-url';
import { shareOrCopyUrl, type ShareMethod } from './native-share';

export async function shareSingleScreenshotLink(
  screenshotId: string,
  options?: { by?: string | null; title?: string | null },
): Promise<ShareMethod> {
  const url = buildShareUrl({
    mode: 'single',
    screenshotId,
    by: options?.by ?? null,
  });

  return shareOrCopyUrl({
    url,
    title: options?.title?.trim() || 'AgentUX screen',
  });
}
