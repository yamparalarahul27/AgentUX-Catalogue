import { describe, expect, it } from 'vitest';
import {
  getAnnotationActivity,
  sortByAnnotationActivity,
  sortByCommentActivity,
} from '../../designer/src/lib/catalogue-activity';
import type { ScreenshotNode } from '../../designer/src/types';

function screenshot(
  id: string,
  name: string,
  createdAt: string,
  overrides: Partial<ScreenshotNode> = {},
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
    ...overrides,
  };
}

describe('getAnnotationActivity', () => {
  it('reads stringified annotation payloads and resolves latest timestamp', () => {
    const activity = getAnnotationActivity({
      lightbox_annotations: JSON.stringify([
        { id: 'a', created_at: '2026-04-01T08:00:00.000Z' },
        { id: 'b', created_at: '2026-04-02T08:00:00.000Z' },
      ]),
    });

    expect(activity.count).toBe(2);
    expect(activity.lastAddedAt).toBe('2026-04-02T08:00:00.000Z');
  });

  it('supports array payloads and ignores invalid dates', () => {
    const activity = getAnnotationActivity({
      lightbox_annotations: [
        { id: 'a', createdAt: 'not-a-date' },
        { id: 'b', createdAt: '2026-04-03T09:00:00.000Z' },
      ],
    });

    expect(activity.count).toBe(2);
    expect(activity.lastAddedAt).toBe('2026-04-03T09:00:00.000Z');
  });
});

describe('activity sorting', () => {
  const createdAt = '2026-04-01T09:00:00.000Z';

  it('sorts comments mode by latest comment timestamp, then count', () => {
    const sorted = sortByCommentActivity([
      screenshot('a', 'Alpha', createdAt, { comment_count: 2, comment_last_added_at: '2026-04-01T09:00:00.000Z' }),
      screenshot('b', 'Bravo', createdAt, { comment_count: 1, comment_last_added_at: '2026-04-03T09:00:00.000Z' }),
      screenshot('c', 'Charlie', createdAt, { comment_count: 5, comment_last_added_at: '2026-04-03T09:00:00.000Z' }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts annotation mode by latest annotation timestamp, then count', () => {
    const sorted = sortByAnnotationActivity([
      screenshot('a', 'Alpha', createdAt, { annotation_count: 1, annotation_last_added_at: '2026-04-02T09:00:00.000Z' }),
      screenshot('b', 'Bravo', createdAt, { annotation_count: 3, annotation_last_added_at: '2026-04-02T09:00:00.000Z' }),
      screenshot('c', 'Charlie', createdAt, { annotation_count: 2, annotation_last_added_at: '2026-04-04T09:00:00.000Z' }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });
});
