import { supabase } from './supabase';

export interface CatalogueGroupAppearance {
  iconStoragePath?: string;
  iconUrl?: string;
  label?: string;
}

export type CatalogueGroupAppearanceMap = Record<string, Record<string, CatalogueGroupAppearance>>;

interface CatalogueGroupAppearanceRow {
  display_label: string | null;
  group_key: string;
  icon_storage_path: string | null;
  icon_url: string | null;
  project_id: string;
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
    iconStoragePath?: string | null;
    iconUrl?: string | null;
    label?: string | null;
  },
): CatalogueGroupAppearance | null {
  const cleanedIconUrl = cleanText(input.iconUrl);
  const cleanedIconStoragePath = cleanText(input.iconStoragePath);
  const cleanedLabel = cleanText(input.label);
  const entry: CatalogueGroupAppearance = {};

  if (cleanedIconUrl) entry.iconUrl = cleanedIconUrl;
  if (cleanedIconStoragePath) entry.iconStoragePath = cleanedIconStoragePath;

  if (cleanedLabel && cleanedLabel.toLowerCase() !== group.trim().toLowerCase()) {
    entry.label = cleanedLabel;
  }

  return entry.iconUrl || entry.label ? entry : null;
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
    iconStoragePath: row.icon_storage_path,
    iconUrl: row.icon_url,
    label: row.display_label,
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
    group: string;
    iconStoragePath?: string | null;
    iconUrl?: string | null;
    label?: string | null;
    projectId?: string | null;
  },
): CatalogueGroupAppearanceMap {
  const cleanedGroup = input.group.trim();
  if (!cleanedGroup) return map;

  const projectKey = normalizeProjectKey(input.projectId);
  const groupKey = normalizeGroupKey(cleanedGroup);
  const projectEntries = { ...(map[projectKey] || {}) };
  const nextMap: CatalogueGroupAppearanceMap = { ...map };
  const entry = buildAppearanceEntry(cleanedGroup, {
    iconStoragePath: input.iconStoragePath,
    iconUrl: input.iconUrl,
    label: input.label,
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

export async function ensureCatalogueGroupAppearanceLoaded(projectId?: string | null) {
  const projectKey = normalizeProjectKey(projectId);
  if (projectKey === GLOBAL_PROJECT_KEY) return;
  if (syncedProjects.has(projectKey)) return;

  const existing = inFlightLoads.get(projectKey);
  if (existing) {
    await existing;
    return;
  }

  const nextLoad = (async () => {
    const { data, error } = await supabase
      .from('catalogue_group_appearance')
      .select('project_id, group_key, display_label, icon_url, icon_storage_path')
      .eq('project_id', projectKey);

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
    setProjectEntries(nextMap, projectKey, entries);
    writeCatalogueGroupAppearanceMap(nextMap);
    syncedProjects.add(projectKey);
  })().finally(() => {
    inFlightLoads.delete(projectKey);
  });

  inFlightLoads.set(projectKey, nextLoad);
  await nextLoad;
}

export async function ensureCatalogueGroupAppearanceLoadedForProjects(projectIds: string[]) {
  const keys = normalizeProjectKeys(projectIds);
  if (keys.length === 0) return;
  await Promise.all(keys.map((projectKey) => ensureCatalogueGroupAppearanceLoaded(projectKey)));
}

export function subscribeCatalogueGroupAppearance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function saveCatalogueGroupAppearanceToSupabase(input: {
  group: string;
  iconStoragePath?: string | null;
  iconUrl?: string | null;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
}) {
  const scopedProjects = input.projectId
    ? normalizeProjectKeys([input.projectId])
    : normalizeProjectKeys(input.projectIds);

  if (scopedProjects.length === 0) {
    return {
      error: 'No projects available to save group appearance.',
      ok: false as const,
    };
  }

  const groupKey = normalizeGroupKey(input.group);
  let nextMap = readCatalogueGroupAppearanceMap();

  for (const projectKey of scopedProjects) {
    nextMap = upsertCatalogueGroupAppearance(nextMap, {
      group: input.group,
      iconStoragePath: input.iconStoragePath,
      iconUrl: input.iconUrl,
      label: input.label,
      projectId: projectKey,
    });
  }

  if (!input.projectId) {
    nextMap = upsertCatalogueGroupAppearance(nextMap, {
      group: input.group,
      iconStoragePath: input.iconStoragePath,
      iconUrl: input.iconUrl,
      label: input.label,
      projectId: null,
    });
  }

  for (const projectKey of scopedProjects) {
    const projectEntries = nextMap[projectKey] || {};
    const entry = projectEntries[groupKey] || null;

    if (entry) {
      const { error } = await supabase
        .from('catalogue_group_appearance')
        .upsert({
          display_label: entry.label || null,
          group_key: groupKey,
          icon_storage_path: entry.iconStoragePath || null,
          icon_url: entry.iconUrl || null,
          project_id: projectKey,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id,group_key' });

      if (error) {
        return { error: error.message, ok: false as const };
      }
      continue;
    }

    const { error } = await supabase
      .from('catalogue_group_appearance')
      .delete()
      .eq('project_id', projectKey)
      .eq('group_key', groupKey);

    if (error) {
      return { error: error.message, ok: false as const };
    }
  }

  writeCatalogueGroupAppearanceMap(nextMap);
  for (const projectKey of scopedProjects) {
    syncedProjects.add(projectKey);
  }
  return { ok: true as const };
}

export async function uploadCatalogueGroupIconToSupabase(input: {
  file: File;
  group: string;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
}) {
  const scopedProjects = input.projectId
    ? normalizeProjectKeys([input.projectId])
    : normalizeProjectKeys(input.projectIds);

  if (scopedProjects.length === 0) {
    return {
      error: 'No projects available to save the uploaded icon.',
      ok: false as const,
    };
  }

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
    group: input.group,
    iconStoragePath: storagePath,
    iconUrl: publicUrl,
    label: input.label,
    projectId: input.projectId,
    projectIds: input.projectIds,
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
  group: string;
  label?: string | null;
  projectId?: string | null;
  projectIds?: string[] | null;
}) {
  const scopedProjects = input.projectId
    ? normalizeProjectKeys([input.projectId])
    : normalizeProjectKeys(input.projectIds);

  if (scopedProjects.length === 0) {
    return {
      error: 'No projects available to remove the uploaded icon.',
      ok: false as const,
    };
  }

  const currentMap = readCatalogueGroupAppearanceMap();
  const groupKey = normalizeGroupKey(input.group);
  const previousStoragePaths = collectScopedGroupIconStoragePaths(
    currentMap,
    groupKey,
    scopedProjects,
    !input.projectId,
  );

  const saveResult = await saveCatalogueGroupAppearanceToSupabase({
    group: input.group,
    iconStoragePath: null,
    iconUrl: null,
    label: input.label,
    projectId: input.projectId,
    projectIds: input.projectIds,
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
      iconStoragePath: null as string | null,
      iconUrl: null as string | null,
      label: null as string | null,
    };
  }

  const entry = getScopedGroupAppearance(map, cleanedGroup, projectId);

  return {
    iconStoragePath: cleanText(entry?.iconStoragePath) || null,
    iconUrl: cleanText(entry?.iconUrl) || null,
    label: cleanText(entry?.label) || cleanedGroup,
  };
}
