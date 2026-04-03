import { describe, expect, it } from 'vitest';

import { buildCatalogueFamilies, getActiveFamilyVariant, getVariantLabel } from '../../designer/src/lib/catalogue-families';
import type { ScreenFamily, ScreenshotNode, WebPreset } from '../../designer/src/types';

const presets: WebPreset[] = [
  { key: 'default-1512', label: 'Default', width: 1512 },
  { key: 'viewport-320', label: '320', width: 320 },
];

function screenshot(overrides: Partial<ScreenshotNode>): ScreenshotNode {
  return {
    id: overrides.id || 'shot-1',
    project_id: overrides.project_id || 'project-1',
    flow_id: overrides.flow_id ?? null,
    screen_family_id: overrides.screen_family_id ?? null,
    name: overrides.name || 'Deposit',
    file_name: overrides.file_name || 'deposit.png',
    storage_path: overrides.storage_path || '',
    image_url: overrides.image_url,
    sequence: overrides.sequence ?? null,
    group: overrides.group ?? 'Binance Group',
    platform: overrides.platform ?? 'web',
    web_preset_key: overrides.web_preset_key ?? 'default-1512',
    mobile_os: overrides.mobile_os ?? null,
    theme: overrides.theme ?? 'dark',
    reference_url: overrides.reference_url ?? null,
    reference_storage_path: overrides.reference_storage_path ?? null,
    reference_label: overrides.reference_label ?? null,
    version_count: overrides.version_count,
    comment_count: overrides.comment_count,
    comment_last_added_at: overrides.comment_last_added_at ?? null,
    annotation_count: overrides.annotation_count,
    annotation_last_added_at: overrides.annotation_last_added_at ?? null,
    position_x: overrides.position_x ?? null,
    position_y: overrides.position_y ?? null,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at,
  };
}

describe('catalogue family helpers', () => {
  it('builds one family with multiple variants', () => {
    const families: ScreenFamily[] = [
      {
        id: 'family-1',
        project_id: 'project-1',
        name: 'Deposit',
        group: 'Binance Group',
        flow_id: 'flow-1',
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
      },
    ];

    const results = buildCatalogueFamilies([
      screenshot({ id: 'shot-1', screen_family_id: 'family-1', web_preset_key: 'default-1512' }),
      screenshot({ id: 'shot-2', screen_family_id: 'family-1', web_preset_key: 'viewport-320' }),
    ], families, Object.fromEntries(presets.map((preset) => [preset.key, preset])));

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Deposit');
    expect(results[0].variants.map((variant) => variant.label)).toEqual([
      'Dark / Web / 320',
      'Dark / Web / Default',
    ]);
  });

  it('falls back to a legacy family when a screenshot has no family id', () => {
    const results = buildCatalogueFamilies([
      screenshot({ id: 'legacy-1', screen_family_id: null, name: 'Withdraw' }),
    ], [], Object.fromEntries(presets.map((preset) => [preset.key, preset])));

    expect(results).toHaveLength(1);
    expect(results[0].isLegacy).toBe(true);
    expect(results[0].name).toBe('Withdraw');
  });

  it('returns active variants and user-facing labels', () => {
    const family = buildCatalogueFamilies([
      screenshot({ id: 'shot-web', screen_family_id: 'family-1', web_preset_key: 'default-1512' }),
      screenshot({ id: 'shot-mobile', screen_family_id: 'family-1', platform: 'mobile', web_preset_key: null, mobile_os: 'ios' }),
    ], [{
      id: 'family-1',
      project_id: 'project-1',
      name: 'Deposit',
      group: 'Binance Group',
      flow_id: null,
      created_at: '2026-04-03T00:00:00.000Z',
      updated_at: '2026-04-03T00:00:00.000Z',
    }], Object.fromEntries(presets.map((preset) => [preset.key, preset])))[0];

    const active = getActiveFamilyVariant(family, family.variants[1].key);
    expect(active?.screenshot.id).toBe('shot-web');
    expect(getVariantLabel(family.variants[0].screenshot, Object.fromEntries(presets.map((preset) => [preset.key, preset])))).toBe('Dark / Mobile / iOS');
  });
});
