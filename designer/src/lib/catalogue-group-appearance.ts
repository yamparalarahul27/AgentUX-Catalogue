import { supabase } from './supabase';

export type CatalogueGroupCategory = 'cex' | 'dex' | 'other';
export type CatalogueGroupRegion = 'india' | 'global';

export interface CatalogueGroupAppearance {
  category?: CatalogueGroupCategory;
  iconStoragePath?: string;
  iconUrl?: string;
  label?: string;
  region?: CatalogueGroupRegion;
}

export type CatalogueGroupAppearanceMap = Record<string, Record<string, CatalogueGroupAppearance>>;

interface CatalogueGroupAppearanceRow {
  category: string | null;
  display_label: string | null;
  group_key: string;
  icon_storage_path: string | null;
  icon_url: string | null;
  region: string | null;
}

function normalizeCategory(value?: string | null): CatalogueGroupCategory | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (cleaned === 'cex' || cleaned === 'dex' || cleaned === 'other') return cleaned;
  return undefined;
}

function normalizeRegion(value?: string | null): CatalogueGroupRegion | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (cleaned === 'india' || cleaned === 'global') return cleaned;
  return undefined;
}

const CATALOGUE_GROUP_APPEARANCE_KEY = 'catalogue:group-appearance:v1';
const GLOBAL_PROJECT_KEY = '__global__';
const GROUP_ICON_BUCKET = 'catalogue-group-icons';
const MAX_GROUP_ICON_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_GROUP_ICON_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);

const syncedProjects = new Set<string>();
const inFlightLoads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function normalizeGroupKey(group: string) {
  return group.trim().toLowerCase();
}

function normalizeProjectKey(projectId?: string | null) {
  const trimmed = projectId?.trim();
  return trimmed || GLOBAL_PROJECT_KEY;
}

function normalizeProjectKeys(projectIds?: string[] | null) {
  const unique = new Set<string>();
  for (const id of projectIds || []) {
    const key = normalizeProjectKey(id);
    if (key === GLOBAL_PROJECT_KEY) continue;
    unique.add(key);
  }
  return [...unique];
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || '';
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || 'group-icon.png';
}

function buildGroupIconStoragePath(projectId: string, groupKey: string, fileName: string) {
  return `${projectId}/${groupKey}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function buildAppearanceEntry(
  group: string,
  input: {
    category?: CatalogueGroupCategory | null;
    iconStoragePath?: string | null;
    iconUrl?: string | null;
    label?: string | null;
    region?: CatalogueGroupRegion | null;
  },
): CatalogueGroupAppearance | null {
  const cleanedIconUrl = cleanText(input.iconUrl);
  const cleanedIconStoragePath = cleanText(input.iconStoragePath);
  const cleanedLabel = cleanText(input.label);
  const category = normalizeCategory(input.category ?? undefined);
  const region = normalizeRegion(input.region ?? undefined);
  const entry: CatalogueGroupAppearance = {};

  if (cleanedIconUrl) entry.iconUrl = cleanedIconUrl;
  if (cleanedIconStoragePath) entry.iconStoragePath = cleanedIconStoragePath;

  if (cleanedLabel && cleanedLabel.toLowerCase() !== group.trim().toLowerCase()) {
    entry.label = cleanedLabel;
  }

  if (category) entry.category = category;
  if (region) entry.region = region;

  return entry.iconUrl || entry.label || entry.category || entry.region ? entry : null;
}

function notifyGroupAppearanceSubscribers() {
  for (const listener of listeners) {
    listener();
  }
}

function setProjectEntries(
  map: CatalogueGroupAppearanceMap,
  projectKey: string,
  entries: Record<string, CatalogueGroupAppearance>,
) {
  if (Object.keys(entries).length === 0) {
    if (Object.prototype.hasOwnProperty.call(map, projectKey)) {
      delete map[projectKey];
    }
    return;
  }
  map[projectKey] = entries;
}

function normalizeRowToEntry(row: CatalogueGroupAppearanceRow): CatalogueGroupAppearance | null {
  return buildAppearanceEntry(row.group_key, {
    category: normalizeCategory(row.category),
    iconStoragePath: row.icon_storage_path,
    iconUrl: row.icon_url,
    label: row.display_label,
    region: normalizeRegion(row.region),
  });
}

function getScopedGroupAppearance(
  map: CatalogueGroupAppearanceMap,
  group: string,
  projectId?: string | null,
) {
  const groupKey = normalizeGroupKey(group);
  const normalizedProject = normalizeProjectKey(projectId);
  const fallback = map[GLOBAL_PROJECT_KEY]?.[groupKey];

  if (normalizedProject !== GLOBAL_PROJECT_KEY) {
    const scoped = map[normalizedProject]?.[groupKey];
    return scoped || fallback || null;
  }

  if (fallback) return fallback;

  for (const [key, entries] of Object.entries(map)) {
    if (key === GLOBAL_PROJECT_KEY) continue;
    const match = entries[groupKey];
    if (match) return match;
  }

  return null;
}

function collectScopedGroupIconStoragePaths(
  map: CatalogueGroupAppearanceMap,
  groupKey: string,
  projectKeys: string[],
  includeGlobal: boolean,
) {
  const paths = new Set<string>();

  for (const projectKey of projectKeys) {
    const scopedPath = cleanText(map[projectKey]?.[groupKey]?.iconStoragePath);
    if (scopedPath) {
      paths.add(scopedPath);
    }
  }

  if (includeGlobal) {
    const globalPath = cleanText(map[GLOBAL_PROJECT_KEY]?.[groupKey]?.iconStoragePath);
    if (globalPath) {
      paths.add(globalPath);
    }
  }

  return [...paths];
}

export function readCatalogueGroupAppearanceMap(): CatalogueGroupAppearanceMap {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(CATALOGUE_GROUP_APPEARANCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CatalogueGroupAppearanceMap;
  } catch {
    return {};
  }
}

export function writeCatalogueGroupAppearanceMap(map: CatalogueGroupAppearanceMap) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(CATALOGUE_GROUP_APPEARANCE_KEY, JSON.stringify(map));
    notifyGroupAppearanceSubscribers();
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

export function upsertCatalogueGroupAppearance(
  map: CatalogueGroupAppearanceMap,
  input: {
    category?: CatalogueGroupCategory | null;
    group: string;
    iconStoragePath?: string | null;
    iconUrl?: string | null;
    label?: string | null;
    projectId?: string | null;
    region?: CatalogueGroupRegion | null;
  },
): CatalogueGroupAppearanceMap {
  const cleanedGroup = input.group.trim();
  if (!cleanedGroup) return map;

  const projectKey = normalizeProjectKey(input.projectId);
  const groupKey = normalizeGroupKey(cleanedGroup);
  const projectEntries = { ...(map[projectKey] || {}) };
  const nextMap: CatalogueGroupAppearanceMap = { ...map };
  const entry = buildAppearanceEntry(cleanedGroup, {
    category: input.category,
    iconStoragePath: input.iconStoragePath,
    iconUrl: input.iconUrl,
    label: input.label,
    region: input.region,
  });

  if (!entry) {
    delete projectEntries[groupKey];
    if (Object.keys(projectEntries).length === 0) {
      delete nextMap[projectKey];
      return nextMap;
    }
    nextMap[projectKey] = projectEntries;
    return nextMap;
  }

  projectEntries[groupKey] = entry;
  nextMap[projectKey] = projectEntries;
  return nextMap;
}

export async function ensureCatalogueGroupAppearanceLoaded(_projectId?: string | null) {
  // project_id was dropped from catalogue_group_appearance in migration
  // 20260517_remove_project_scoping. Appearance is now global — load all
  // rows once into GLOBAL_PROJECT_KEY. The optional projectId parameter
  // is retained for backwards compatibility with existing call sites.
  if (syncedProjects.has(GLOBAL_PROJECT_KEY)) return;

  const existing = inFlightLoads.get(GLOBAL_PROJECT_KEY);
  if (existing) {
    await existing;
    return;
  }

  const nextLoad = (async () => {
    const { data, error } = await supabase
      .from('catalogue_group_appearance')
      .select('group_key, display_label, icon_url, icon_storage_path, category, region');

    if (error || !data) return;

    const entries: Record<string, CatalogueGroupAppearance> = {};
    for (const rawRow of data as CatalogueGroupAppearanceRow[]) {
      const groupKey = cleanText(rawRow.group_key).toLowerCase();
      if (!groupKey) continue;
      const entry = normalizeRowToEntry(rawRow);
      if (!entry) continue;
      entries[groupKey] = entry;
    }

    const nextMap = { ...readCatalogueGroupAppearanceMap() };
    setProjectEntries(nextMap, GLOBAL_PROJECT_KEY, entries);
    writeCatalogueGroupAppearanceMap(nextMap);
    syncedProjects.add(GLOBAL_PROJECT_KEY);
  })().finally(() => {
    inFlightLoads.delete(GLOBAL_PROJECT_KEY);
  });

  inFlightLoads.set(GLOBAL_PROJECT_KEY, nextLoad);
  await nextLoad;
}

export async function ensureCatalogueGroupAppearanceLoadedForProjects(_projectIds: string[]) {
  // Kept as a backwards-compatible alias — appearance is now global, so we
  // just delegate to the global loader. The argument is ignored.
  await ensureCatalogueGroupAppearanceLoaded();
}

export function subscribeCatalogueGroupAppearance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function saveCatalogueGroupAppearanceToSupabase(input: {
  category?: CatalogueGroupCategory | null;
  group: string;
  iconStoragePath?: string | null;
  iconUrl?: string | null;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
  region?: CatalogueGroupRegion | null;
}) {
  // project_id was dropped from catalogue_group_appearance in migration
  // 20260517_remove_project_scoping. All writes now hit a single row per
  // group_key. `projectId` / `projectIds` are accepted for caller
  // backwards-compat but ignored.
  const groupKey = normalizeGroupKey(input.group);
  if (!groupKey) {
    return { error: 'Group name is required.', ok: false as const };
  }

  let nextMap = readCatalogueGroupAppearanceMap();
  nextMap = upsertCatalogueGroupAppearance(nextMap, {
    category: input.category,
    group: input.group,
    iconStoragePath: input.iconStoragePath,
    iconUrl: input.iconUrl,
    label: input.label,
    projectId: null,
    region: input.region,
  });

  const entry = nextMap[GLOBAL_PROJECT_KEY]?.[groupKey] || null;

  if (entry) {
    const { error } = await supabase
      .from('catalogue_group_appearance')
      .upsert({
        category: entry.category || null,
        display_label: entry.label || null,
        group_key: groupKey,
        icon_storage_path: entry.iconStoragePath || null,
        icon_url: entry.iconUrl || null,
        region: entry.region || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'group_key' });

    if (error) {
      return { error: error.message, ok: false as const };
    }
  } else {
    const { error } = await supabase
      .from('catalogue_group_appearance')
      .delete()
      .eq('group_key', groupKey);

    if (error) {
      return { error: error.message, ok: false as const };
    }
  }

  writeCatalogueGroupAppearanceMap(nextMap);
  syncedProjects.add(GLOBAL_PROJECT_KEY);
  return { ok: true as const };
}

export async function uploadCatalogueGroupIconToSupabase(input: {
  category?: CatalogueGroupCategory | null;
  file: File;
  group: string;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
  region?: CatalogueGroupRegion | null;
}) {
  // projectId / projectIds are accepted for backwards-compat with old
  // callers but are no longer required — Project was removed from the
  // architecture in migration 20260517_remove_project_scoping. Icons
  // now write to the single global row per group_key, and storage uses
  // the `'all-projects'` scope. See saveCatalogueGroupAppearanceToSupabase
  // for the same flattening on the metadata side.
  const scopedProjects = input.projectId
    ? normalizeProjectKeys([input.projectId])
    : normalizeProjectKeys(input.projectIds);

  const groupKey = normalizeGroupKey(input.group);
  if (!groupKey) {
    return { error: 'Group name is required.', ok: false as const };
  }

  if (input.file.size > MAX_GROUP_ICON_SIZE_BYTES) {
    return {
      error: 'Icon file is too large. Max size is 2MB.',
      ok: false as const,
    };
  }

  if (input.file.type && !ALLOWED_GROUP_ICON_TYPES.has(input.file.type)) {
    return {
      error: 'Unsupported icon format. Use PNG, JPG, WEBP, GIF, or SVG.',
      ok: false as const,
    };
  }

  const storageScope = input.projectId ? scopedProjects[0] : 'all-projects';
  const storagePath = buildGroupIconStoragePath(storageScope, groupKey, input.file.name);
  const currentMap = readCatalogueGroupAppearanceMap();
  const previousStoragePaths = collectScopedGroupIconStoragePaths(
    currentMap,
    groupKey,
    scopedProjects,
    !input.projectId,
  );

  const { error: uploadError } = await supabase
    .storage
    .from(GROUP_ICON_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message, ok: false as const };
  }

  const { data: publicData } = supabase.storage.from(GROUP_ICON_BUCKET).getPublicUrl(storagePath);
  const publicUrl = cleanText(publicData?.publicUrl);

  if (!publicUrl) {
    await supabase.storage.from(GROUP_ICON_BUCKET).remove([storagePath]);
    return { error: 'Could not resolve uploaded icon URL.', ok: false as const };
  }

  const saveResult = await saveCatalogueGroupAppearanceToSupabase({
    category: input.category,
    group: input.group,
    iconStoragePath: storagePath,
    iconUrl: publicUrl,
    label: input.label,
    projectId: input.projectId,
    projectIds: input.projectIds,
    region: input.region,
  });

  if (!saveResult.ok) {
    await supabase.storage.from(GROUP_ICON_BUCKET).remove([storagePath]);
    return saveResult;
  }

  for (const previousStoragePath of previousStoragePaths) {
    if (previousStoragePath === storagePath) continue;
    await supabase.storage.from(GROUP_ICON_BUCKET).remove([previousStoragePath]);
  }

  return {
    iconStoragePath: storagePath,
    iconUrl: publicUrl,
    ok: true as const,
  };
}

export async function removeCatalogueGroupUploadedIconFromSupabase(input: {
  category?: CatalogueGroupCategory | null;
  group: string;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
  region?: CatalogueGroupRegion | null;
}) {
  // See `uploadCatalogueGroupIconToSupabase` — projectId / projectIds
  // are accepted but no longer required; Project was flattened out.
  const scopedProjects = input.projectId
    ? normalizeProjectKeys([input.projectId])
    : normalizeProjectKeys(input.projectIds);

  const currentMap = readCatalogueGroupAppearanceMap();
  const groupKey = normalizeGroupKey(input.group);
  const previousStoragePaths = collectScopedGroupIconStoragePaths(
    currentMap,
    groupKey,
    scopedProjects,
    !input.projectId,
  );

  const saveResult = await saveCatalogueGroupAppearanceToSupabase({
    category: input.category,
    group: input.group,
    iconStoragePath: null,
    iconUrl: null,
    label: input.label,
    projectId: input.projectId,
    projectIds: input.projectIds,
    region: input.region,
  });

  if (!saveResult.ok) return saveResult;

  for (const previousStoragePath of previousStoragePaths) {
    await supabase.storage.from(GROUP_ICON_BUCKET).remove([previousStoragePath]);
  }

  return { ok: true as const };
}

export function resolveCatalogueGroupAppearance(
  map: CatalogueGroupAppearanceMap,
  group: string | null | undefined,
  projectId?: string | null,
) {
  const cleanedGroup = group?.trim();
  if (!cleanedGroup) {
    return {
      category: null as CatalogueGroupCategory | null,
      iconStoragePath: null as string | null,
      iconUrl: null as string | null,
      label: null as string | null,
      region: null as CatalogueGroupRegion | null,
    };
  }

  const entry = getScopedGroupAppearance(map, cleanedGroup, projectId);

  return {
    category: entry?.category ?? null,
    iconStoragePath: cleanText(entry?.iconStoragePath) || null,
    iconUrl: cleanText(entry?.iconUrl) || null,
    label: cleanText(entry?.label) || cleanedGroup,
    region: entry?.region ?? null,
  };
}
