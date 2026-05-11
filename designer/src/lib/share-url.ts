// Share URL = encoded filter, not a snapshot. The view page re-runs the
// filter against Supabase each time, so shared content always reflects
// the current state of the catalogue. No DB table needed.

export type SharePlatform = 'web' | 'mobile';

export interface ShareParams {
  group: string;
  flow: string;
  platform: SharePlatform;
  title?: string | null;
  by?: string | null;
}

const PATH = '/designer/share';

export function buildShareUrl(params: ShareParams, origin: string = window.location.origin): string {
  const query = new URLSearchParams();
  query.set('group', params.group);
  query.set('flow', params.flow);
  query.set('platform', params.platform);
  if (params.title) query.set('title', params.title);
  if (params.by) query.set('by', params.by);
  return `${origin}${PATH}?${query.toString()}`;
}

export function parseShareUrl(search: string): ShareParams | null {
  const query = new URLSearchParams(search);
  const group = query.get('group');
  const flow = query.get('flow');
  const platform = query.get('platform');
  if (!group || !flow) return null;
  if (platform !== 'web' && platform !== 'mobile') return null;
  return {
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
