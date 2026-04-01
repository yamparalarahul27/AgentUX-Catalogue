import { describe, expect, it } from 'vitest';
import { parseMultiPathFlow } from '../../designer/src/lib/parse-flow-paths';

describe('parseMultiPathFlow', () => {
  it('merges duplicate nodes case-insensitively and with whitespace normalization', () => {
    const graph = parseMultiPathFlow(`
      Deposit in progress -> Success
      deposit   in   progress -> failure
      DEPOSIT IN PROGRESS -> Success
    `);

    expect(graph.nodeNames).toEqual([
      'Deposit in progress',
      'Success',
      'failure',
    ]);
    expect(graph.edges).toEqual([
      ['Deposit in progress', 'Success'],
      ['Deposit in progress', 'failure'],
    ]);
  });

  it('fans out a repeated source line to multiple targets deterministically', () => {
    const graph = parseMultiPathFlow(`
      Deposit in progress -> Success
      Deposit in progress -> Fail
    `);

    expect(graph.nodeNames).toEqual([
      'Deposit in progress',
      'Success',
      'Fail',
    ]);
    expect(graph.edges).toEqual([
      ['Deposit in progress', 'Success'],
      ['Deposit in progress', 'Fail'],
    ]);
  });

  it('dedupes repeated lines and repeated edges', () => {
    const graph = parseMultiPathFlow(`
      Start -> Review -> Done
      start -> review -> done
      Start -> Review -> Done
    `);

    expect(graph.nodeNames).toEqual([
      'Start',
      'Review',
      'Done',
    ]);
    expect(graph.edges).toEqual([
      ['Start', 'Review'],
      ['Review', 'Done'],
    ]);
  });
});
