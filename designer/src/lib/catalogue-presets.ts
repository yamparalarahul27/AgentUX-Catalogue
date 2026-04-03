import type { CatalogueSettingsRecord, WebPreset } from '../types';

export const DEFAULT_WEB_PRESETS: WebPreset[] = [
  { key: 'default-1512', label: 'Default', width: 1512 },
  { key: 'viewport-1024', label: '1024', width: 1024 },
  { key: 'viewport-720', label: '720', width: 720 },
  { key: 'viewport-320', label: '320', width: 320 },
];

function isWebPreset(value: unknown): value is WebPreset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WebPreset>;
  return typeof candidate.key === 'string'
    && candidate.key.trim().length > 0
    && typeof candidate.label === 'string'
    && candidate.label.trim().length > 0
    && Number.isFinite(candidate.width);
}

export function getDefaultCatalogueSettings(userId: string): CatalogueSettingsRecord {
  return {
    user_id: userId,
    web_presets: DEFAULT_WEB_PRESETS,
  };
}

export function normalizeWebPresets(value: unknown): WebPreset[] {
  if (!Array.isArray(value)) return DEFAULT_WEB_PRESETS;
  const next = value.filter(isWebPreset).map((preset) => ({
    key: preset.key.trim(),
    label: preset.label.trim(),
    width: Math.max(1, Math.round(preset.width)),
  }));
  return next.length > 0 ? next : DEFAULT_WEB_PRESETS;
}

export function normalizeCatalogueSettingsRecord(
  userId: string,
  value: Partial<CatalogueSettingsRecord> | null | undefined,
): CatalogueSettingsRecord {
  return {
    user_id: value?.user_id || userId,
    web_presets: normalizeWebPresets(value?.web_presets),
    created_at: value?.created_at,
    updated_at: value?.updated_at,
  };
}

export function buildPresetMap(webPresets: WebPreset[]): Record<string, WebPreset> {
  return Object.fromEntries(webPresets.map((preset) => [preset.key, preset]));
}

export function getWebPresetLabel(webPresets: WebPreset[], presetKey: string | null | undefined): string | null {
  if (!presetKey) return null;
  return webPresets.find((preset) => preset.key === presetKey)?.label ?? null;
}

