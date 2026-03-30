import { describe, expect, it } from 'vitest';
import type { AppMapData } from '../../src/types';
import { analyzeAppMap, filterAppMapData, getRouteDetails } from '../../src/utils/flow-insights';

describe('Flow Insights', () => {
  const data: AppMapData = {
    routes: [
      { id: 'route-home', path: '/', name: 'Home', framework: 'nextjs-app', source: 'static', componentFile: 'app/page.tsx' },
      { id: 'route-dashboard', path: '/dashboard', name: 'Dashboard', framework: 'nextjs-app', source: 'both', componentFile: 'app/dashboard/page.tsx' },
      { id: 'route-budgets', path: '/budgets', name: 'Budgets', framework: 'nextjs-app', source: 'static', componentFile: 'app/budgets/page.tsx' },
      { id: 'route-preview', path: '/preview', name: 'Preview', framework: 'unknown', source: 'runtime' },
      { id: 'route-lab', path: '/lab', name: 'Lab', framework: 'nextjs-app', source: 'static', componentFile: 'app/lab/page.tsx' },
    ],
    edges: [
      { id: 'edge-1', sourceRouteId: 'route-home', targetRouteId: 'route-dashboard', type: 'link' },
      { id: 'edge-2', sourceRouteId: 'route-dashboard', targetRouteId: 'route-budgets', type: 'navigate' },
      { id: 'edge-3', sourceRouteId: 'route-dashboard', targetRouteId: 'route-preview', type: 'inferred' },
    ],
    framework: 'nextjs-app',
    scannedAt: '2026-03-23T10:00:00.000Z',
  };

  it('identifies entry, dead-end, orphaned, runtime-only, and hub routes', () => {
    const insights = analyzeAppMap(data);

    expect(insights.entryRouteIds).toEqual(['route-home']);
    expect(insights.deadEndRouteIds).toEqual(['route-budgets', 'route-preview']);
    expect(insights.orphanedRouteIds).toEqual(['route-lab']);
    expect(insights.runtimeOnlyRouteIds).toEqual(['route-preview']);
    expect(insights.hubRouteIds).toEqual(['route-dashboard']);
  });

  it('filters the graph to dead ends and runtime-only routes', () => {
    const deadEnds = filterAppMapData(data, 'dead-ends');
    const runtimeOnly = filterAppMapData(data, 'runtime-only');

    expect(deadEnds.routes.map((route) => route.id)).toEqual(['route-budgets', 'route-preview']);
    expect(deadEnds.edges).toHaveLength(0);

    expect(runtimeOnly.routes.map((route) => route.id)).toEqual(['route-preview']);
    expect(runtimeOnly.edges).toHaveLength(0);
  });

  it('returns route details with incoming and outgoing connections', () => {
    const insights = analyzeAppMap(data);
    const details = getRouteDetails(data, insights, 'route-dashboard');

    expect(details?.incoming).toHaveLength(1);
    expect(details?.outgoing).toHaveLength(2);
    expect(details?.isHub).toBe(true);
    expect(details?.isDeadEnd).toBe(false);
  });
});
