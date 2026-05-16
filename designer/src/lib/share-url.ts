// Share URL = encoded filter or single-screenshot pointer, not a snapshot.
// The view page re-runs the read against Supabase each time so shared
// content always reflects the current state of the catalogue. No DB
// table needed.
//
// Two modes:
//   - filter (existing) → group + flow + platform, optional title + by
//   - single (new)      → screenshot_id, optional by
// Both render under the same /designer/share path.

export type SharePlatform = 'web' | 'mobile';

export type ShareParams =
  | {
      mode: 'filter';
      group: string;
      flow: string;
      platform: SharePlatform;
      title?: string | null;
      by?: string | null;
    }
  | {
      mode: 'single';
      screenshotId: string;
      by?: string | null;
    };

const PATH = '/designer/share';

export function buildShareUrl(
  params: ShareParams,
  origin: string = window.location.origin,
): string {
  const query = new URLSearchParams();
  if (params.mode === 'filter') {
    query.set('group', params.group);
    query.set('flow', params.flow);
    query.set('platform', params.platform);
    if (params.title) query.set('title', params.title);
  } else {
    query.set('screenshot_id', params.screenshotId);
  }
  if (params.by) query.set('by', params.by);
  return `${origin}${PATH}?${query.toString()}`;
}

export function parseShareUrl(search: string): ShareParams | null {
  const query = new URLSearchParams(search);

  // Single-screenshot mode takes precedence if screenshot_id is present.
  const screenshotId = query.get('screenshot_id');
  if (screenshotId) {
    return {
      mode: 'single',
      screenshotId,
      by: query.get('by'),
    };
  }

  // Filter mode requires group + flow + platform.
  const group = query.get('group');
  const flow = query.get('flow');
  const platform = query.get('platform');
  if (!group || !flow) return null;
  if (platform !== 'web' && platform !== 'mobile') return null;
  return {
    mode: 'filter',
    group,
    flow,
    platform,
    title: query.get('title'),
    by: query.get('by'),
  };
}

// Path check — used by CatalogueApp.tsx to decide whether to render
// the share view instead of the catalogue.
export function isSharePath(pathname: string): boolean {
  return pathname === PATH || pathname === `${PATH}/`;
}
