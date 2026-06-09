import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildPresetMap, getDefaultCatalogueSettings, normalizeCatalogueSettingsRecord } from '../lib/catalogue-presets';
import { supabase } from '../lib/supabase';
import type {
  CatalogueSettingsRecord,
  ToolbarHideableKey,
  ToolbarPinnableKey,
  WebPreset,
} from '../types';

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
    // Spread the current settings first so the upsert keeps the other
    // columns intact (toolbar_hidden_keys / toolbar_pinned_keys). Without
    // this the normalizer fills those with empty arrays and the upsert
    // wipes the user's toolbar customization every time they save presets.
    const nextSettings = normalizeCatalogueSettingsRecord(userId, {
      ...settings,
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
  }, [settings, userId]);

  // Persist toolbar customization. The two arrays move together so the
  // shape stays simple — if you only want to change one, pass the
  // current value of the other from `settings`.
  const saveToolbarPrefs = useCallback(async (next: {
    toolbar_hidden_keys: ToolbarHideableKey[];
    toolbar_pinned_keys: ToolbarPinnableKey[];
  }) => {
    const nextSettings = normalizeCatalogueSettingsRecord(userId, {
      ...settings,
      user_id: userId,
      toolbar_hidden_keys: next.toolbar_hidden_keys,
      toolbar_pinned_keys: next.toolbar_pinned_keys,
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
  }, [settings, userId]);

  const presetByKey = useMemo(() => buildPresetMap(settings.web_presets), [settings.web_presets]);

  return {
    presetByKey,
    saveToolbarPrefs,
    saveWebPresets,
    settings,
    settingsLoaded,
    toolbarHiddenKeys: settings.toolbar_hidden_keys,
    toolbarPinnedKeys: settings.toolbar_pinned_keys,
    webPresets: settings.web_presets,
  };
}
