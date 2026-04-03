import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildPresetMap, getDefaultCatalogueSettings, normalizeCatalogueSettingsRecord } from '../lib/catalogue-presets';
import { supabase } from '../lib/supabase';
import type { CatalogueSettingsRecord, WebPreset } from '../types';

function getLocalSettingsKey(userId: string) {
  return `catalogue:settings:${userId}`;
}

function readLocalSettings(userId: string): CatalogueSettingsRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getLocalSettingsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogueSettingsRecord>;
    return normalizeCatalogueSettingsRecord(userId, parsed);
  } catch {
    return null;
  }
}

function writeLocalSettings(userId: string, value: CatalogueSettingsRecord) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getLocalSettingsKey(userId), JSON.stringify(value));
  } catch {
    // Ignore localStorage write errors.
  }
}

export function useCatalogueSettings(userId: string) {
  const [settings, setSettings] = useState<CatalogueSettingsRecord>(() => (
    readLocalSettings(userId) ?? getDefaultCatalogueSettings(userId)
  ));
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoaded(false);
    const { data, error } = await supabase
      .from('catalogue_settings')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      setSettings(readLocalSettings(userId) ?? getDefaultCatalogueSettings(userId));
      setSettingsLoaded(true);
      return;
    }

    const next = data
      ? normalizeCatalogueSettingsRecord(userId, data)
      : (readLocalSettings(userId) ?? getDefaultCatalogueSettings(userId));
    setSettings(next);
    writeLocalSettings(userId, next);
    setSettingsLoaded(true);
  }, [userId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveWebPresets = useCallback(async (webPresets: WebPreset[]) => {
    const nextSettings = normalizeCatalogueSettingsRecord(userId, {
      user_id: userId,
      web_presets: webPresets,
    });
    setSettings(nextSettings);
    writeLocalSettings(userId, nextSettings);

    const { data, error } = await supabase
      .from('catalogue_settings')
      .upsert(nextSettings, { onConflict: 'user_id' })
      .select()
      .single();

    if (error || !data) {
      return { ok: false as const, settings: nextSettings };
    }

    const normalized = normalizeCatalogueSettingsRecord(userId, data);
    setSettings(normalized);
    writeLocalSettings(userId, normalized);
    return { ok: true as const, settings: normalized };
  }, [userId]);

  const presetByKey = useMemo(() => buildPresetMap(settings.web_presets), [settings.web_presets]);

  return {
    presetByKey,
    saveWebPresets,
    settings,
    settingsLoaded,
    webPresets: settings.web_presets,
  };
}
