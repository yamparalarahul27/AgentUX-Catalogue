import { describe, expect, it } from 'vitest';
import { sortCatalogueScreenshots } from '../../designer/src/lib/catalogue-sort';
import type { ScreenshotNode } from '../../designer/src/types';

function screenshot(
  id: string,
  name: string,
  createdAt?: string,
): ScreenshotNode {
  return {
    id,
    project_id: 'project-1',
    flow_id: null,
    name,
    file_name: `${name}.png`,
    storage_path: '',
    sequence: null,
    group: null,
    platform: null,
    theme: null,
    reference_url: null,
    reference_storage_path: null,
    reference_label: null,
    position_x: null,
    position_y: null,
    metadata: {},
    created_at: createdAt,
  };
}

describe('sortCatalogueScreenshots', () => {
  const items = [
    screenshot('c', 'Charlie', '2026-04-02T09:00:00.000Z'),
    screenshot('a', 'Alpha', '2026-04-01T09:00:00.000Z'),
    screenshot('b', 'Bravo', '2026-04-03T09:00:00.000Z'),
  ];

  it('sorts by latest date first', () => {
    const sorted = sortCatalogueScreenshots(items, 'date-desc');
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by latest date first for global latest mode', () => {
    const sorted = sortCatalogueScreenshots(items, 'date-desc-global');
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by oldest date first', () => {
    const sorted = sortCatalogueScreenshots(items, 'date-asc');
    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts alphabetically by name', () => {
    const sorted = sortCatalogueScreenshots(items, 'name-asc');
    expect(sorted.map((item) => item.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('falls back to deterministic name/id ordering when date is missing', () => {
    const mixed = [
      screenshot('z', 'Zulu'),
      screenshot('a', 'Alpha'),
      screenshot('b', 'beta'),
    ];

    const desc = sortCatalogueScreenshots(mixed, 'date-desc');
    const asc = sortCatalogueScreenshots(mixed, 'date-asc');

    expect(desc.map((item) => item.id)).toEqual(['a', 'b', 'z']);
    expect(asc.map((item) => item.id)).toEqual(['a', 'b', 'z']);
  });
});
