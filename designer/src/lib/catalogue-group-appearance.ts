import { supabase } from './supabase';

export interface CatalogueGroupAppearance {
  iconEmoji?: string;
  iconStoragePath?: string;
  iconUrl?: string;
  label?: string;
}

export type CatalogueGroupAppearanceMap = Record<string, Record<string, CatalogueGroupAppearance>>;

interface CatalogueGroupAppearanceRow {
  display_label: string | null;
  group_key: string;
  icon_emoji: string | null;
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
    iconEmoji?: string | null;
    iconStoragePath?: string | null;
    iconUrl?: string | null;
    label?: string | null;
  },
): CatalogueGroupAppearance | null {
  const cleanedIconEmoji = cleanText(input.iconEmoji);
  const cleanedIconUrl = cleanText(input.iconUrl);
  const cleanedIconStoragePath = cleanText(input.iconStoragePath);
  const cleanedLabel = cleanText(input.label);
  const entry: CatalogueGroupAppearance = {};

  if (cleanedIconEmoji) entry.iconEmoji = cleanedIconEmoji;
  if (cleanedIconUrl) entry.iconUrl = cleanedIconUrl;
  if (cleanedIconStoragePath) entry.iconStoragePath = cleanedIconStoragePath;

  if (cleanedLabel && cleanedLabel.toLowerCase() !== group.trim().toLowerCase()) {
    entry.label = cleanedLabel;
  }

  return entry.iconEmoji || entry.iconUrl || entry.label ? entry : null;
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
    iconEmoji: row.icon_emoji,
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
  const scoped = map[normalizeProjectKey(projectId)]?.[groupKey];
  const fallback = map[GLOBAL_PROJECT_KEY]?.[groupKey];
  return scoped || fallback || null;
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
    iconEmoji?: string | null;
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
    iconEmoji: input.iconEmoji,
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
      .select('project_id, group_key, display_label, icon_emoji, icon_url, icon_storage_path')
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

export function subscribeCatalogueGroupAppearance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function saveCatalogueGroupAppearanceToSupabase(input: {
  group: string;
  iconEmoji?: string | null;
  iconStoragePath?: string | null;
  iconUrl?: string | null;
  label?: string | null;
  projectId?: string | null;
}) {
  const projectKey = normalizeProjectKey(input.projectId);
  if (projectKey === GLOBAL_PROJECT_KEY) {
    return {
      error: 'Select a specific project to save group icon and display name.',
      ok: false as const,
    };
  }

  const nextMap = upsertCatalogueGroupAppearance(readCatalogueGroupAppearanceMap(), {
    group: input.group,
    iconEmoji: input.iconEmoji,
    iconStoragePath: input.iconStoragePath,
    iconUrl: input.iconUrl,
    label: input.label,
    projectId: projectKey,
  });

  const groupKey = normalizeGroupKey(input.group);
  const projectEntries = nextMap[projectKey] || {};
  const entry = projectEntries[groupKey] || null;

  if (entry) {
    const { error } = await supabase
      .from('catalogue_group_appearance')
      .upsert({
        display_label: entry.label || null,
        group_key: groupKey,
        icon_emoji: entry.iconEmoji || null,
        icon_storage_path: entry.iconStoragePath || null,
        icon_url: entry.iconUrl || null,
        project_id: projectKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,group_key' });

    if (error) {
      return { error: error.message, ok: false as const };
    }
  } else {
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
  syncedProjects.add(projectKey);
  return { ok: true as const };
}

export async function uploadCatalogueGroupIconToSupabase(input: {
  file: File;
  group: string;
  iconEmoji?: string | null;
  label?: string | null;
  projectId?: string | null;
}) {
  const projectKey = normalizeProjectKey(input.projectId);
  if (projectKey === GLOBAL_PROJECT_KEY) {
    return {
      error: 'Select a specific project before uploading a group icon.',
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

  const storagePath = buildGroupIconStoragePath(projectKey, groupKey, input.file.name);
  const currentMap = readCatalogueGroupAppearanceMap();
  const currentAppearance = getScopedGroupAppearance(currentMap, input.group, projectKey);
  const previousStoragePath = cleanText(currentAppearance?.iconStoragePath);

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
    iconEmoji: input.iconEmoji,
    iconStoragePath: storagePath,
    iconUrl: publicUrl,
    label: input.label,
    projectId: projectKey,
  });

  if (!saveResult.ok) {
    await supabase.storage.from(GROUP_ICON_BUCKET).remove([storagePath]);
    return saveResult;
  }

  if (previousStoragePath && previousStoragePath !== storagePath) {
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
  iconEmoji?: string | null;
  label?: string | null;
  projectId?: string | null;
}) {
  const projectKey = normalizeProjectKey(input.projectId);
  if (projectKey === GLOBAL_PROJECT_KEY) {
    return {
      error: 'Select a specific project to remove the uploaded icon.',
      ok: false as const,
    };
  }

  const currentMap = readCatalogueGroupAppearanceMap();
  const currentAppearance = getScopedGroupAppearance(currentMap, input.group, projectKey);
  const previousStoragePath = cleanText(currentAppearance?.iconStoragePath);

  const saveResult = await saveCatalogueGroupAppearanceToSupabase({
    group: input.group,
    iconEmoji: input.iconEmoji,
    iconStoragePath: null,
    iconUrl: null,
    label: input.label,
    projectId: projectKey,
  });

  if (!saveResult.ok) return saveResult;

  if (previousStoragePath) {
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
      iconEmoji: null as string | null,
      iconStoragePath: null as string | null,
      iconUrl: null as string | null,
      label: null as string | null,
    };
  }

  const entry = getScopedGroupAppearance(map, cleanedGroup, projectId);

  return {
    iconEmoji: cleanText(entry?.iconEmoji) || null,
    iconStoragePath: cleanText(entry?.iconStoragePath) || null,
    iconUrl: cleanText(entry?.iconUrl) || null,
    label: cleanText(entry?.label) || cleanedGroup,
  };
}
