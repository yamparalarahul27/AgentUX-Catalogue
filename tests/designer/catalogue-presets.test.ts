import { describe, expect, it } from 'vitest';

import { DEFAULT_WEB_PRESETS, buildPresetMap, normalizeCatalogueSettingsRecord } from '../../designer/src/lib/catalogue-presets';

describe('catalogue preset helpers', () => {
  it('seeds default presets when the record is empty', () => {
    const settings = normalizeCatalogueSettingsRecord('user-1', null);
    expect(settings.user_id).toBe('user-1');
    expect(settings.web_presets).toEqual(DEFAULT_WEB_PRESETS);
  });

  it('normalizes preset labels and widths', () => {
    const settings = normalizeCatalogueSettingsRecord('user-1', {
      user_id: 'user-1',
      web_presets: [
        { key: ' custom ', label: '  Desktop ', width: 1512.4 },
      ],
    });

    expect(settings.web_presets).toEqual([
      { key: 'custom', label: 'Desktop', width: 1512 },
    ]);
  });

  it('builds a preset lookup by key', () => {
    const presetMap = buildPresetMap(DEFAULT_WEB_PRESETS);
    expect(presetMap['viewport-320']?.width).toBe(320);
  });
});
