export interface CatalogueGroupAppearance {
  icon?: string;
  label?: string;
}

type CatalogueGroupAppearanceMap = Record<string, Record<string, CatalogueGroupAppearance>>;

const CATALOGUE_GROUP_APPEARANCE_KEY = 'catalogue:group-appearance:v1';
const GLOBAL_PROJECT_KEY = '__global__';

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

function buildAppearanceEntry(
  group: string,
  label?: string | null,
  icon?: string | null,
): CatalogueGroupAppearance | null {
  const cleanedIcon = cleanText(icon);
  const cleanedLabel = cleanText(label);
  const entry: CatalogueGroupAppearance = {};

  if (cleanedIcon) entry.icon = cleanedIcon;
  if (cleanedLabel && cleanedLabel.toLowerCase() !== group.trim().toLowerCase()) {
    entry.label = cleanedLabel;
  }

  return entry.icon || entry.label ? entry : null;
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
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

export function upsertCatalogueGroupAppearance(
  map: CatalogueGroupAppearanceMap,
  input: {
    group: string;
    icon?: string | null;
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
  const entry = buildAppearanceEntry(cleanedGroup, input.label, input.icon);

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

export function resolveCatalogueGroupAppearance(
  map: CatalogueGroupAppearanceMap,
  group: string | null | undefined,
  projectId?: string | null,
) {
  const cleanedGroup = group?.trim();
  if (!cleanedGroup) return { icon: null as string | null, label: null as string | null };

  const groupKey = normalizeGroupKey(cleanedGroup);
  const scoped = map[normalizeProjectKey(projectId)]?.[groupKey];
  const fallback = map[GLOBAL_PROJECT_KEY]?.[groupKey];
  const entry = scoped || fallback;

  return {
    icon: cleanText(entry?.icon) || null,
    label: cleanText(entry?.label) || cleanedGroup,
  };
}
