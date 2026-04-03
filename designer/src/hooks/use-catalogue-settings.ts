import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildPresetMap, getDefaultCatalogueSettings, normalizeCatalogueSettingsRecord } from '../lib/catalogue-presets';
import { supabase } from '../lib/supabase';
import type { CatalogueSettingsRecord, WebPreset } from '../types';

export function useCatalogueSettings(userId: string) {
  const [settings, setSettings] = useState<CatalogueSettingsRecord>(() => getDefaultCatalogueSettings(userId));
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoaded(false);
    const { data, error } = await supabase
      .from('catalogue_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      setSettings(getDefaultCatalogueSettings(userId));
      setSettingsLoaded(true);
      return;
    }

    setSettings(normalizeCatalogueSettingsRecord(userId, data));
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

    const { data, error } = await supabase
      .from('catalogue_settings')
      .upsert(nextSettings)
      .select()
      .single();

    if (error || !data) {
      setSettings(nextSettings);
      return { ok: false as const, settings: nextSettings };
    }

    const normalized = normalizeCatalogueSettingsRecord(userId, data);
    setSettings(normalized);
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
