import { describe, expect, it } from 'vitest';
import type { AppMapData } from '../../src/types';
import { buildFlowSpecPayload, generateJson } from '../../src/export';
import {
  addJourney,
  createJourney,
  createWorkspace,
  toggleJourneyBoundary,
  toggleJourneyEdgeChange,
} from '../../src/workspace';

describe('JSON Export', () => {
  const mockData: AppMapData = {
    routes: [
      {
        id: 'route-home',
        path: '/',
        name: 'Home',
        componentFile: 'app/page.tsx',
        framework: 'nextjs-app',
        source: 'static',
      },
      {
        id: 'route-dashboard',
        path: '/dashboard',
        name: 'Dashboard',
        componentFile: 'app/dashboard/page.tsx',
        framework: 'nextjs-app',
        source: 'static',
      },
      {
        id: 'route-users',
        path: '/users',
        name: 'Users',
        componentFile: 'app/users/page.tsx',
        framework: 'nextjs-app',
        source: 'both',
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceRouteId: 'route-home',
        targetRouteId: 'route-dashboard',
        type: 'link',
        sourceFile: 'app/page.tsx',
        sourceLine: 7,
      },
      {
        id: 'edge-2',
        sourceRouteId: 'route-dashboard',
        targetRouteId: 'route-users',
        type: 'navigate',
        sourceFile: 'app/dashboard/page.tsx',
        sourceLine: 12,
      },
    ],
    framework: 'nextjs-app',
    scannedAt: '2026-03-18T10:00:00.000Z',
  };

  it('builds a structured payload with metadata, nodes, edges, and signals', () => {
    const payload = buildFlowSpecPayload(mockData);

    expect(payload.metadata.framework).toBe('nextjs-app');
    expect(payload.metadata.frameworkLabel).toBe('Next.js App Router');
    expect(payload.nodes).toHaveLength(3);
    expect(payload.edges[0].typeLabel).toBe('<Link>');
    expect(payload.signals.entryRouteIds).toEqual(['route-home']);
  });

  it('generates valid JSON with intended journey changes when a workspace is provided', () => {
    const draftJourney = createJourney('Signup Journey', '2026-03-18T10:05:00.000Z');
    let workspace = addJourney(createWorkspace(mockData), draftJourney);
    workspace = toggleJourneyBoundary(workspace, draftJourney.id, 'route-home', 'start');
    workspace = toggleJourneyBoundary(workspace, draftJourney.id, 'route-users', 'end');
    workspace = toggleJourneyEdgeChange(
      workspace,
      draftJourney.id,
      'route-home',
      'route-users',
      'add',
    );

    const json = generateJson(mockData, {
      workspace,
      journeyId: draftJourney.id,
    });
    const parsed = JSON.parse(json);

    expect(parsed.intendedJourney.name).toBe('Signup Journey');
    expect(parsed.intendedJourney.startRouteIds).toEqual(['route-home']);
    expect(parsed.intendedJourney.addedEdges[0].targetRouteName).toBe('Users');
    expect(parsed.intendedJourney.requestedChanges[0]).toContain('journey starting screen');
  });
});
