import { describe, expect, it } from 'vitest';
import type { Connection, Flow, ScreenshotNode } from '../../designer/src/types';
import { compareFlowSnapshots } from '../../designer/src/lib/compare-flows';

function makeFlow(id: string, name: string): Flow {
  return {
    id,
    project_id: 'project-1',
    name,
    platform: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
  };
}

function makeScreenshot(id: string, name: string, sequence: number): ScreenshotNode {
  return {
    id,
    project_id: 'project-1',
    flow_id: 'flow-1',
    name,
    file_name: `${name}.png`,
    storage_path: `${id}.png`,
    sequence,
    group: null,
    platform: null,
    theme: null,
    reference_url: null,
    reference_storage_path: null,
    reference_label: null,
    position_x: null,
    position_y: null,
    metadata: {},
    created_at: `2026-03-01T0${sequence}:00:00.000Z`,
    image_url: `https://example.com/${id}.png`,
  };
}

function makeConnection(
  id: string,
  source_id: string,
  target_id: string,
  label: string | null = null,
  arrow_direction: Connection['arrow_direction'] = 'forward',
  type: Connection['type'] = 'manual',
): Connection {
  return {
    id,
    project_id: 'project-1',
    flow_id: 'flow-1',
    source_id,
    target_id,
    type,
    label,
    arrow_direction,
    source_handle: null,
    target_handle: null,
    created_at: '2026-03-01T00:00:00.000Z',
  };
}

describe('compareFlowSnapshots', () => {
  it('finds shared and unique steps and transitions with a weighted similarity score', () => {
    const left = {
      flow: makeFlow('flow-a', 'Flow A'),
      screenshots: [
        makeScreenshot('a-start', 'Start', 1),
        makeScreenshot('a-review', 'Review', 2),
        makeScreenshot('a-done', 'Done', 3),
        makeScreenshot('a-cancel', 'Cancel', 4),
      ],
      connections: [
        makeConnection('a-1', 'a-start', 'a-review', 'continue'),
        makeConnection('a-2', 'a-review', 'a-done'),
        makeConnection('a-3', 'a-start', 'a-cancel', 'fallback'),
      ],
    };

    const right = {
      flow: makeFlow('flow-b', 'Flow B'),
      screenshots: [
        makeScreenshot('b-start', 'start', 1),
        makeScreenshot('b-review', 'Review', 2),
        makeScreenshot('b-success', 'Success', 3),
      ],
      connections: [
        makeConnection('b-1', 'b-start', 'b-review', 'Continue'),
        makeConnection('b-2', 'b-review', 'b-success'),
        makeConnection('b-3', 'b-start', 'b-success', 'shortcut'),
      ],
    };

    const comparison = compareFlowSnapshots(left, right);

    expect(comparison.sharedSteps.map((step) => step.label)).toEqual(['Start', 'Review']);
    expect(comparison.onlyStepsA.map((step) => step.label)).toEqual(['Done', 'Cancel']);
    expect(comparison.onlyStepsB.map((step) => step.label)).toEqual(['Success']);

    expect(comparison.sharedTransitions.map((transition) => `${transition.sourceLabel} -> ${transition.targetLabel}`)).toEqual([
      'Start -> Review',
    ]);
    expect(comparison.onlyTransitionsA.map((transition) => `${transition.sourceLabel} -> ${transition.targetLabel}`)).toEqual([
      'Start -> Cancel',
      'Review -> Done',
    ]);
    expect(comparison.onlyTransitionsB.map((transition) => `${transition.sourceLabel} -> ${transition.targetLabel}`)).toEqual([
      'start -> Success',
      'Review -> Success',
    ]);
    expect(comparison.similarityScore).toBe(32);
  });

  it('keeps transitions distinct when direction or type changes', () => {
    const sharedScreens = [
      makeScreenshot('left-start', 'Start', 1),
      makeScreenshot('left-next', 'Next', 2),
    ];

    const left = {
      flow: makeFlow('flow-a', 'Flow A'),
      screenshots: sharedScreens,
      connections: [makeConnection('left-1', 'left-start', 'left-next', 'Go', 'forward', 'manual')],
    };

    const right = {
      flow: makeFlow('flow-b', 'Flow B'),
      screenshots: [
        makeScreenshot('right-start', 'Start', 1),
        makeScreenshot('right-next', 'Next', 2),
      ],
      connections: [makeConnection('right-1', 'right-start', 'right-next', 'Go', 'backward', 'auto')],
    };

    const comparison = compareFlowSnapshots(left, right);

    expect(comparison.sharedSteps.map((step) => step.label)).toEqual(['Start', 'Next']);
    expect(comparison.sharedTransitions).toEqual([]);
    expect(comparison.onlyTransitionsA).toHaveLength(1);
    expect(comparison.onlyTransitionsB).toHaveLength(1);
    expect(comparison.similarityScore).toBe(60);
  });
});
