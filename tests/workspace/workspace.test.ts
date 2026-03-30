import { describe, expect, it } from 'vitest';
import type { AppMapData } from '../../src/types';
import {
  addJourney,
  createJourney,
  createWorkspace,
  deriveJourneyDiff,
  deriveJourneyGraph,
  getJourneyRouteState,
  toggleJourneyBoundary,
  toggleJourneyEdgeChange,
} from '../../src/workspace';

describe('Workspace state', () => {
  const baseData: AppMapData = {
    routes: [
      { id: 'route-home', path: '/', name: 'Home', framework: 'nextjs-app', source: 'static' },
      {
        id: 'route-signup',
        path: '/signup',
        name: 'Signup',
        framework: 'nextjs-app',
        source: 'static',
      },
      {
        id: 'route-dashboard',
        path: '/dashboard',
        name: 'Dashboard',
        framework: 'nextjs-app',
        source: 'static',
      },
    ],
    edges: [
      {
        id: 'edge-home-dashboard',
        sourceRouteId: 'route-home',
        targetRouteId: 'route-dashboard',
        type: 'link',
      },
    ],
    framework: 'nextjs-app',
    scannedAt: '2026-03-23T10:00:00.000Z',
  };

  it('creates intended add and remove flow changes for a journey', () => {
    const workspace = addJourney(
      createWorkspace(baseData),
      createJourney('Primary Journey', '2026-03-23T10:01:00.000Z'),
    );
    const journeyId = workspace.journeys[0].id;

    const nextWorkspace = toggleJourneyEdgeChange(
      toggleJourneyEdgeChange(
        workspace,
        journeyId,
        'route-home',
        'route-signup',
        'add',
      ),
      journeyId,
      'route-home',
      'route-dashboard',
      'remove',
    );

    const diff = deriveJourneyDiff(nextWorkspace, journeyId);

    expect(diff?.addedEdges).toHaveLength(1);
    expect(diff?.removedEdges).toHaveLength(1);
    expect(diff?.addedEdges[0].targetRouteId).toBe('route-signup');
    expect(diff?.removedEdges[0].targetRouteId).toBe('route-dashboard');
  });

  it('toggles start and end boundaries for a route', () => {
    const workspace = addJourney(
      createWorkspace(baseData),
      createJourney('Primary Journey', '2026-03-23T10:01:00.000Z'),
    );
    const journeyId = workspace.journeys[0].id;

    const nextWorkspace = toggleJourneyBoundary(
      toggleJourneyBoundary(workspace, journeyId, 'route-home', 'start'),
      journeyId,
      'route-signup',
      'end',
    );

    const routeState = getJourneyRouteState(nextWorkspace, journeyId, 'route-home');
    const endRouteState = getJourneyRouteState(nextWorkspace, journeyId, 'route-signup');

    expect(routeState?.isStart).toBe(true);
    expect(routeState?.isEnd).toBe(false);
    expect(endRouteState?.isEnd).toBe(true);
  });

  it('restores a removed detected edge when add is toggled for the same pair', () => {
    const workspace = addJourney(
      createWorkspace(baseData),
      createJourney('Primary Journey', '2026-03-23T10:01:00.000Z'),
    );
    const journeyId = workspace.journeys[0].id;

    const removedWorkspace = toggleJourneyEdgeChange(
      workspace,
      journeyId,
      'route-home',
      'route-dashboard',
      'remove',
    );
    const restoredWorkspace = toggleJourneyEdgeChange(
      removedWorkspace,
      journeyId,
      'route-home',
      'route-dashboard',
      'add',
    );

    const diff = deriveJourneyDiff(restoredWorkspace, journeyId);

    expect(diff?.addedEdges).toHaveLength(0);
    expect(diff?.removedEdges).toHaveLength(0);
  });

  it('derives a graph overlay with intended and removed edge states', () => {
    const workspace = addJourney(
      createWorkspace(baseData),
      createJourney('Primary Journey', '2026-03-23T10:01:00.000Z'),
    );
    const journeyId = workspace.journeys[0].id;

    const nextWorkspace = toggleJourneyEdgeChange(
      toggleJourneyEdgeChange(
        workspace,
        journeyId,
        'route-home',
        'route-signup',
        'add',
      ),
      journeyId,
      'route-home',
      'route-dashboard',
      'remove',
    );

    const graph = deriveJourneyGraph(baseData, nextWorkspace, journeyId);

    expect(graph?.data.edges).toHaveLength(2);
    expect(graph?.edgeStatesById['edge-home-dashboard']).toBe('removed');
    expect(graph?.edgeStatesById['journey-route-home-route-signup']).toBe('intended');
  });
});
