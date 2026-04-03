import { describe, expect, it } from 'vitest';

import {
  buildTeamUploadAnalyticsRows,
  UNKNOWN_UPLOADER,
} from '../../designer/src/lib/catalogue-team-analytics';
import type { ScreenshotNode } from '../../designer/src/types';

let counter = 0;

function makeScreenshot(overrides: Partial<ScreenshotNode>): ScreenshotNode {
  counter += 1;
  return {
    id: `shot-${counter}`,
    project_id: 'project-1',
    flow_id: null,
    screen_family_id: null,
    name: 'Screen',
    file_name: `screen-${counter}.png`,
    storage_path: `path-${counter}.png`,
    image_url: '',
    sequence: null,
    group: null,
    platform: null,
    web_preset_key: null,
    mobile_os: null,
    theme: null,
    reference_url: null,
    reference_storage_path: null,
    reference_label: null,
    position_x: null,
    position_y: null,
    metadata: {},
    created_at: '2026-04-03T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildTeamUploadAnalyticsRows', () => {
  it('groups uploads by IST date boundaries', () => {
    const rows = buildTeamUploadAnalyticsRows([
      makeScreenshot({
        created_at: '2026-04-03T18:29:59.000Z',
        platform: 'web',
        uploader_email: 'owner@example.com',
      }),
      makeScreenshot({
        created_at: '2026-04-03T18:30:00.000Z',
        platform: 'mobile',
        uploader_email: 'owner@example.com',
      }),
    ], null);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-04-04', mobileCount: 1, webCount: 0 });
    expect(rows[1]).toMatchObject({ date: '2026-04-03', mobileCount: 0, webCount: 1 });
  });

  it('excludes rows with unknown platform from web/mobile totals', () => {
    const rows = buildTeamUploadAnalyticsRows([
      makeScreenshot({ platform: null, uploader_email: 'user@example.com' }),
      makeScreenshot({ platform: 'web', uploader_email: 'user@example.com' }),
    ], null);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ webCount: 1, mobileCount: 0, totalCount: 1 });
  });

  it('maps missing uploader values to Unknown uploader', () => {
    const rows = buildTeamUploadAnalyticsRows([
      makeScreenshot({ platform: 'mobile', uploader_email: null }),
    ], null);

    expect(rows).toHaveLength(1);
    expect(rows[0].userEmail).toBe(UNKNOWN_UPLOADER);
  });

  it('filters by selected project', () => {
    const rows = buildTeamUploadAnalyticsRows([
      makeScreenshot({ platform: 'web', project_id: 'project-1', uploader_email: 'a@example.com' }),
      makeScreenshot({ platform: 'web', project_id: 'project-2', uploader_email: 'b@example.com' }),
    ], 'project-1');

    expect(rows).toHaveLength(1);
    expect(rows[0].userEmail).toBe('a@example.com');
  });

  it('sorts by date desc and then user asc', () => {
    const rows = buildTeamUploadAnalyticsRows([
      makeScreenshot({
        created_at: '2026-04-03T19:00:00.000Z',
        platform: 'web',
        uploader_email: 'zebra@example.com',
      }),
      makeScreenshot({
        created_at: '2026-04-03T19:10:00.000Z',
        platform: 'mobile',
        uploader_email: 'alpha@example.com',
      }),
      makeScreenshot({
        created_at: '2026-04-02T10:00:00.000Z',
        platform: 'web',
        uploader_email: 'middle@example.com',
      }),
    ], null);

    expect(rows[0].date).toBe('2026-04-04');
    expect(rows[0].userEmail).toBe('alpha@example.com');
    expect(rows[1].date).toBe('2026-04-04');
    expect(rows[1].userEmail).toBe('zebra@example.com');
    expect(rows[2].date).toBe('2026-04-02');
  });
});
