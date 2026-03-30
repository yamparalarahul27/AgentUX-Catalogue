import type { AppMapData, Journey, JourneyEdgeChange, RouteAnnotation, Workspace } from '../types';

export interface JourneyDiff {
  journey: Journey;
  addedEdges: JourneyEdgeChange[];
  removedEdges: JourneyEdgeChange[];
}

export type JourneyGraphEdgeState = 'current' | 'intended' | 'removed';

export interface JourneyGraph {
  data: AppMapData;
  edgeStatesById: Record<string, JourneyGraphEdgeState>;
}

export interface JourneyRouteState {
  isStart: boolean;
  isEnd: boolean;
  addedOutgoingRouteIds: string[];
  removedOutgoingRouteIds: string[];
}

export function createWorkspace(
  baseData: AppMapData,
  overrides: Partial<Pick<Workspace, 'journeys' | 'annotations' | 'savedAt'>> = {},
): Workspace {
  return {
    baseData,
    journeys: overrides.journeys ?? [],
    annotations: overrides.annotations ?? {},
    savedAt: overrides.savedAt ?? new Date().toISOString(),
  };
}

export function syncWorkspaceBaseData(
  workspace: Workspace | null,
  baseData: AppMapData,
): Workspace {
  if (!workspace) {
    return createWorkspace(baseData);
  }

  return {
    ...workspace,
    baseData,
    savedAt: new Date().toISOString(),
  };
}

export function createJourney(name: string, now = new Date().toISOString()): Journey {
  const normalizedName = name.trim() || 'Main Journey';
  return {
    id: `journey-${slugify(normalizedName)}-${now.replace(/[^0-9]/g, '').slice(0, 14)}`,
    name: normalizedName,
    startRouteIds: [],
    endRouteIds: [],
    edgeChanges: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addJourney(workspace: Workspace, journey: Journey): Workspace {
  return {
    ...workspace,
    journeys: [...workspace.journeys, journey],
    savedAt: new Date().toISOString(),
  };
}

export function getJourney(workspace: Workspace | null, journeyId: string | null): Journey | null {
  if (!workspace) return null;
  if (!journeyId) {
    return workspace.journeys[0] ?? null;
  }

  return workspace.journeys.find((journey) => journey.id === journeyId) ?? null;
}

export function renameJourney(workspace: Workspace, journeyId: string, name: string): Workspace {
  return updateJourney(workspace, journeyId, (journey) => ({
    ...journey,
    name: name.trim() || journey.name,
  }));
}

export function toggleJourneyBoundary(
  workspace: Workspace,
  journeyId: string,
  routeId: string,
  boundary: 'start' | 'end',
): Workspace {
  return updateJourney(workspace, journeyId, (journey) => {
    const key = boundary === 'start' ? 'startRouteIds' : 'endRouteIds';
    const nextValues = toggleItem(journey[key], routeId);

    return {
      ...journey,
      [key]: nextValues,
    };
  });
}

export function setRouteAnnotation(
  workspace: Workspace,
  routeId: string,
  annotation: RouteAnnotation,
): Workspace {
  return {
    ...workspace,
    annotations: {
      ...workspace.annotations,
      [routeId]: annotation,
    },
    savedAt: new Date().toISOString(),
  };
}

export function toggleJourneyEdgeChange(
  workspace: Workspace,
  journeyId: string,
  sourceRouteId: string,
  targetRouteId: string,
  change: JourneyEdgeChange['change'],
): Workspace {
  return updateJourney(workspace, journeyId, (journey) => {
    const baseHasEdge = hasDetectedEdge(workspace.baseData, sourceRouteId, targetRouteId);
    const matchingChange = journey.edgeChanges.find(
      (edgeChange) =>
        edgeChange.sourceRouteId === sourceRouteId &&
        edgeChange.targetRouteId === targetRouteId &&
        edgeChange.change === change,
    );

    if (matchingChange) {
      return {
        ...journey,
        edgeChanges: journey.edgeChanges.filter((edgeChange) => edgeChange.id !== matchingChange.id),
      };
    }

    const nextEdgeChanges = journey.edgeChanges.filter(
      (edgeChange) =>
        !(
          edgeChange.sourceRouteId === sourceRouteId &&
          edgeChange.targetRouteId === targetRouteId
        ),
    );

    if (change === 'add' && baseHasEdge) {
      return {
        ...journey,
        edgeChanges: nextEdgeChanges,
      };
    }

    if (change === 'remove' && !baseHasEdge) {
      return {
        ...journey,
        edgeChanges: nextEdgeChanges,
      };
    }

    return {
      ...journey,
      edgeChanges: [
        ...nextEdgeChanges,
        {
          id: `change-${sourceRouteId}-${targetRouteId}-${change}`,
          sourceRouteId,
          targetRouteId,
          change,
        },
      ],
    };
  });
}

export function deriveJourneyDiff(workspace: Workspace, journeyId: string): JourneyDiff | null {
  const journey = getJourney(workspace, journeyId);
  if (!journey) return null;

  return {
    journey,
    addedEdges: journey.edgeChanges
      .filter((edgeChange) => edgeChange.change === 'add')
      .sort(compareEdgeChanges),
    removedEdges: journey.edgeChanges
      .filter((edgeChange) => edgeChange.change === 'remove')
      .sort(compareEdgeChanges),
  };
}

export function getJourneyRouteState(
  workspace: Workspace,
  journeyId: string,
  routeId: string,
): JourneyRouteState | null {
  const journey = getJourney(workspace, journeyId);
  if (!journey) return null;

  const addedOutgoingRouteIds = journey.edgeChanges
    .filter((edgeChange) => edgeChange.change === 'add' && edgeChange.sourceRouteId === routeId)
    .map((edgeChange) => edgeChange.targetRouteId)
    .sort();

  const removedOutgoingRouteIds = journey.edgeChanges
    .filter((edgeChange) => edgeChange.change === 'remove' && edgeChange.sourceRouteId === routeId)
    .map((edgeChange) => edgeChange.targetRouteId)
    .sort();

  return {
    isStart: journey.startRouteIds.includes(routeId),
    isEnd: journey.endRouteIds.includes(routeId),
    addedOutgoingRouteIds,
    removedOutgoingRouteIds,
  };
}

export function deriveJourneyGraph(
  data: AppMapData,
  workspace: Workspace,
  journeyId: string,
): JourneyGraph | null {
  const diff = deriveJourneyDiff(workspace, journeyId);
  if (!diff) return null;

  const visibleRouteIds = new Set(data.routes.map((route) => route.id));
  const nextEdges = [...data.edges];
  const edgeStatesById = Object.fromEntries(
    data.edges.map((edge) => [edge.id, 'current']),
  ) as Record<string, JourneyGraphEdgeState>;

  for (const edgeChange of diff.removedEdges) {
    for (const edge of data.edges) {
      if (
        edge.sourceRouteId === edgeChange.sourceRouteId &&
        edge.targetRouteId === edgeChange.targetRouteId
      ) {
        edgeStatesById[edge.id] = 'removed';
      }
    }
  }

  for (const edgeChange of diff.addedEdges) {
    if (
      !visibleRouteIds.has(edgeChange.sourceRouteId) ||
      !visibleRouteIds.has(edgeChange.targetRouteId)
    ) {
      continue;
    }

    const existingEdge = data.edges.find(
      (edge) =>
        edge.sourceRouteId === edgeChange.sourceRouteId &&
        edge.targetRouteId === edgeChange.targetRouteId,
    );

    if (existingEdge) {
      edgeStatesById[existingEdge.id] = 'current';
      continue;
    }

    const edgeId = `journey-${edgeChange.sourceRouteId}-${edgeChange.targetRouteId}`;

    nextEdges.push({
      id: edgeId,
      sourceRouteId: edgeChange.sourceRouteId,
      targetRouteId: edgeChange.targetRouteId,
      type: 'inferred',
    });
    edgeStatesById[edgeId] = 'intended';
  }

  return {
    data: {
      ...data,
      edges: nextEdges,
    },
    edgeStatesById,
  };
}

export function hasDetectedEdge(
  data: AppMapData,
  sourceRouteId: string,
  targetRouteId: string,
): boolean {
  return data.edges.some(
    (edge) =>
      edge.sourceRouteId === sourceRouteId && edge.targetRouteId === targetRouteId,
  );
}

function updateJourney(
  workspace: Workspace,
  journeyId: string,
  updater: (journey: Journey) => Journey,
): Workspace {
  let changed = false;
  const now = new Date().toISOString();

  const journeys = workspace.journeys.map((journey) => {
    if (journey.id !== journeyId) return journey;

    changed = true;
    return {
      ...updater(journey),
      updatedAt: now,
    };
  });

  if (!changed) {
    return workspace;
  }

  return {
    ...workspace,
    journeys,
    savedAt: now,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function toggleItem(values: string[], item: string): string[] {
  return values.includes(item)
    ? values.filter((value) => value !== item)
    : [...values, item].sort();
}

function compareEdgeChanges(a: JourneyEdgeChange, b: JourneyEdgeChange): number {
  return `${a.sourceRouteId}->${a.targetRouteId}`.localeCompare(
    `${b.sourceRouteId}->${b.targetRouteId}`,
  );
}
