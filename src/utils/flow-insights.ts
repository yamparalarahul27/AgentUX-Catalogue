import type { AppMapData, FlowEdge, RouteNode } from '../types';

export type AppMapFilter = 'all' | 'runtime-only' | 'dead-ends' | 'orphaned';

interface RouteCounts {
  incoming: number;
  outgoing: number;
}

export interface RouteDetails {
  route: RouteNode;
  incoming: Array<{ route: RouteNode; edge: FlowEdge }>;
  outgoing: Array<{ route: RouteNode; edge: FlowEdge }>;
  isEntry: boolean;
  isDeadEnd: boolean;
  isOrphaned: boolean;
  isRuntimeOnly: boolean;
  isHub: boolean;
}

export interface AppMapInsights {
  countsByRouteId: Record<string, RouteCounts>;
  entryRouteIds: string[];
  deadEndRouteIds: string[];
  orphanedRouteIds: string[];
  runtimeOnlyRouteIds: string[];
  hubRouteIds: string[];
}

const HUB_THRESHOLD = 3;

export function analyzeAppMap(data: AppMapData): AppMapInsights {
  const countsByRouteId = Object.fromEntries(
    data.routes.map((route) => [route.id, { incoming: 0, outgoing: 0 }]),
  ) as Record<string, RouteCounts>;

  for (const edge of data.edges) {
    if (countsByRouteId[edge.sourceRouteId]) {
      countsByRouteId[edge.sourceRouteId].outgoing += 1;
    }
    if (countsByRouteId[edge.targetRouteId]) {
      countsByRouteId[edge.targetRouteId].incoming += 1;
    }
  }

  const entryRouteIds: string[] = [];
  const deadEndRouteIds: string[] = [];
  const orphanedRouteIds: string[] = [];
  const runtimeOnlyRouteIds: string[] = [];
  const hubRouteIds: string[] = [];

  for (const route of data.routes) {
    const counts = countsByRouteId[route.id] ?? { incoming: 0, outgoing: 0 };

    if (route.source === 'runtime') {
      runtimeOnlyRouteIds.push(route.id);
    }

    if (counts.incoming === 0 && counts.outgoing > 0) {
      entryRouteIds.push(route.id);
    }

    if (counts.incoming === 0 && counts.outgoing === 0) {
      orphanedRouteIds.push(route.id);
    } else if (counts.outgoing === 0) {
      deadEndRouteIds.push(route.id);
    }

    if (counts.incoming + counts.outgoing >= HUB_THRESHOLD) {
      hubRouteIds.push(route.id);
    }
  }

  return {
    countsByRouteId,
    entryRouteIds: sortRouteIdsByPath(entryRouteIds, data.routes),
    deadEndRouteIds: sortRouteIdsByPath(deadEndRouteIds, data.routes),
    orphanedRouteIds: sortRouteIdsByPath(orphanedRouteIds, data.routes),
    runtimeOnlyRouteIds: sortRouteIdsByPath(runtimeOnlyRouteIds, data.routes),
    hubRouteIds: sortRouteIdsByPath(hubRouteIds, data.routes),
  };
}

export function filterAppMapData(data: AppMapData, filter: AppMapFilter): AppMapData {
  if (filter === 'all') {
    return data;
  }

  const insights = analyzeAppMap(data);
  const routeIds = new Set(
    filter === 'runtime-only'
      ? insights.runtimeOnlyRouteIds
      : filter === 'dead-ends'
        ? insights.deadEndRouteIds
        : insights.orphanedRouteIds,
  );

  return {
    ...data,
    routes: data.routes.filter((route) => routeIds.has(route.id)),
    edges: data.edges.filter(
      (edge) => routeIds.has(edge.sourceRouteId) && routeIds.has(edge.targetRouteId),
    ),
  };
}

export function getRouteDetails(
  data: AppMapData,
  insights: AppMapInsights,
  routeId: string | null,
): RouteDetails | null {
  if (!routeId) return null;

  const routeMap = new Map(data.routes.map((route) => [route.id, route]));
  const route = routeMap.get(routeId);

  if (!route) {
    return null;
  }

  const incoming = data.edges
    .filter((edge) => edge.targetRouteId === routeId)
    .map((edge) => {
      const source = routeMap.get(edge.sourceRouteId);
      return source ? { route: source, edge } : null;
    })
    .filter(Boolean) as Array<{ route: RouteNode; edge: FlowEdge }>;

  const outgoing = data.edges
    .filter((edge) => edge.sourceRouteId === routeId)
    .map((edge) => {
      const target = routeMap.get(edge.targetRouteId);
      return target ? { route: target, edge } : null;
    })
    .filter(Boolean) as Array<{ route: RouteNode; edge: FlowEdge }>;

  incoming.sort((a, b) => a.route.path.localeCompare(b.route.path));
  outgoing.sort((a, b) => a.route.path.localeCompare(b.route.path));

  return {
    route,
    incoming,
    outgoing,
    isEntry: insights.entryRouteIds.includes(routeId),
    isDeadEnd: insights.deadEndRouteIds.includes(routeId),
    isOrphaned: insights.orphanedRouteIds.includes(routeId),
    isRuntimeOnly: insights.runtimeOnlyRouteIds.includes(routeId),
    isHub: insights.hubRouteIds.includes(routeId),
  };
}

function sortRouteIdsByPath(routeIds: string[], routes: RouteNode[]): string[] {
  const routeMap = new Map(routes.map((route) => [route.id, route]));

  return [...routeIds].sort((a, b) => {
    const routeA = routeMap.get(a);
    const routeB = routeMap.get(b);
    return (routeA?.path ?? '').localeCompare(routeB?.path ?? '');
  });
}
