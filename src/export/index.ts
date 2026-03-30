import type { AppMapData } from '../types';
import { analyzeAppMap } from '../utils/flow-insights';
import type { Journey, Workspace } from '../types';
import { deriveJourneyDiff, getJourney } from '../workspace';

export interface ExportOptions {
  workspace?: Workspace | null;
  journeyId?: string | null;
}

export interface FlowSpecPayload {
  metadata: {
    framework: string;
    frameworkLabel: string;
    scannedAt: string;
    routeCount: number;
    edgeCount: number;
  };
  signals: {
    entryRouteIds: string[];
    deadEndRouteIds: string[];
    orphanedRouteIds: string[];
    runtimeOnlyRouteIds: string[];
    hubRouteIds: string[];
  };
  nodes: Array<{
    id: string;
    name: string;
    path: string;
    componentFile: string | null;
    framework: string;
    frameworkLabel: string;
    source: string;
  }>;
  edges: Array<{
    id: string;
    sourceRouteId: string;
    sourceRouteName: string;
    targetRouteId: string;
    targetRouteName: string;
    type: string;
    typeLabel: string;
    sourceFile: string | null;
    sourceLine: number | null;
  }>;
  openQuestions: string[];
  intendedJourney: {
    id: string;
    name: string;
    startRouteIds: string[];
    endRouteIds: string[];
    addedEdges: Array<{
      sourceRouteId: string;
      sourceRouteName: string;
      targetRouteId: string;
      targetRouteName: string;
    }>;
    removedEdges: Array<{
      sourceRouteId: string;
      sourceRouteName: string;
      targetRouteId: string;
      targetRouteName: string;
    }>;
    requestedChanges: string[];
  } | null;
}

export function buildFlowSpecPayload(
  data: AppMapData,
  options: ExportOptions = {},
): FlowSpecPayload {
  const insights = analyzeAppMap(data);
  const routeMap = new Map(data.routes.map((route) => [route.id, route]));
  const sortedRoutes = [...data.routes].sort((a, b) => a.path.localeCompare(b.path));
  const sortedEdges = [...data.edges].sort((a, b) => {
    const sourceA = routeMap.get(a.sourceRouteId)?.path ?? '';
    const sourceB = routeMap.get(b.sourceRouteId)?.path ?? '';
    const targetA = routeMap.get(a.targetRouteId)?.path ?? '';
    const targetB = routeMap.get(b.targetRouteId)?.path ?? '';
    return `${sourceA}->${targetA}`.localeCompare(`${sourceB}->${targetB}`);
  });
  const selectedJourney = options.workspace
    ? getJourney(options.workspace, options.journeyId ?? null)
    : null;
  const journeyDiff =
    options.workspace && selectedJourney
      ? deriveJourneyDiff(options.workspace, selectedJourney.id)
      : null;
  const openQuestions = buildOpenQuestions(insights, routeMap);

  return {
    metadata: {
      framework: data.framework,
      frameworkLabel: formatFramework(data.framework),
      scannedAt: data.scannedAt,
      routeCount: data.routes.length,
      edgeCount: data.edges.length,
    },
    signals: {
      entryRouteIds: insights.entryRouteIds,
      deadEndRouteIds: insights.deadEndRouteIds,
      orphanedRouteIds: insights.orphanedRouteIds,
      runtimeOnlyRouteIds: insights.runtimeOnlyRouteIds,
      hubRouteIds: insights.hubRouteIds,
    },
    nodes: sortedRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      path: route.path,
      componentFile: route.componentFile ?? null,
      framework: route.framework,
      frameworkLabel: formatFramework(route.framework),
      source: route.source,
    })),
    edges: sortedEdges.map((edge) => ({
      id: edge.id,
      sourceRouteId: edge.sourceRouteId,
      sourceRouteName: routeMap.get(edge.sourceRouteId)?.name ?? edge.sourceRouteId,
      targetRouteId: edge.targetRouteId,
      targetRouteName: routeMap.get(edge.targetRouteId)?.name ?? edge.targetRouteId,
      type: edge.type,
      typeLabel: formatEdgeType(edge.type),
      sourceFile: edge.sourceFile ?? null,
      sourceLine: edge.sourceLine ?? null,
    })),
    openQuestions,
    intendedJourney: journeyDiff
      ? {
          id: journeyDiff.journey.id,
          name: journeyDiff.journey.name,
          startRouteIds: journeyDiff.journey.startRouteIds,
          endRouteIds: journeyDiff.journey.endRouteIds,
          addedEdges: journeyDiff.addedEdges.map((edgeChange) => ({
            sourceRouteId: edgeChange.sourceRouteId,
            sourceRouteName:
              routeMap.get(edgeChange.sourceRouteId)?.name ?? edgeChange.sourceRouteId,
            targetRouteId: edgeChange.targetRouteId,
            targetRouteName:
              routeMap.get(edgeChange.targetRouteId)?.name ?? edgeChange.targetRouteId,
          })),
          removedEdges: journeyDiff.removedEdges.map((edgeChange) => ({
            sourceRouteId: edgeChange.sourceRouteId,
            sourceRouteName:
              routeMap.get(edgeChange.sourceRouteId)?.name ?? edgeChange.sourceRouteId,
            targetRouteId: edgeChange.targetRouteId,
            targetRouteName:
              routeMap.get(edgeChange.targetRouteId)?.name ?? edgeChange.targetRouteId,
          })),
          requestedChanges: buildRequestedChanges(journeyDiff.journey, journeyDiff, routeMap),
        }
      : null,
  };
}

export function generateJson(
  data: AppMapData,
  options: ExportOptions = {},
): string {
  return JSON.stringify(buildFlowSpecPayload(data, options), null, 2);
}

/** Generate structured Markdown from app map data, optimized for AI agent consumption */
export function generateMarkdown(
  data: AppMapData,
  options: ExportOptions = {},
): string {
  const lines: string[] = [];
  const payload = buildFlowSpecPayload(data, options);

  lines.push('# AgentUX Flow Spec');
  lines.push('');

  lines.push('## Current Flow Summary');
  lines.push('');
  lines.push(`- **Framework**: ${payload.metadata.frameworkLabel}`);
  lines.push(`- **Screens**: ${payload.metadata.routeCount}`);
  lines.push(`- **Flows**: ${payload.metadata.edgeCount}`);
  lines.push(`- **Generated**: ${payload.metadata.scannedAt}`);
  lines.push('');

  lines.push('## Current Screens');
  lines.push('');

  if (payload.nodes.length === 0) {
    lines.push('- No screens detected yet.');
    lines.push('');
  }

  for (const route of payload.nodes) {
    lines.push(`### ${route.name}`);
    lines.push(`- **Path**: \`${route.path}\``);
    if (route.componentFile) {
      lines.push(`- **Component**: \`${route.componentFile}\``);
    }
    lines.push(`- **Framework**: ${route.frameworkLabel}`);
    if (route.source !== 'static') {
      lines.push(`- **Source**: ${route.source}`);
    }
    lines.push('');
  }

  lines.push('## Current Navigation Flows');
  lines.push('');

  if (payload.edges.length === 0) {
    lines.push('- No navigation flows detected yet.');
    lines.push('');
  } else {
    for (const edge of payload.edges) {
      const location = edge.sourceFile
        ? edge.sourceLine
          ? ` (\`${edge.typeLabel}\` in \`${edge.sourceFile}:${edge.sourceLine}\`)`
          : ` (\`${edge.typeLabel}\` in \`${edge.sourceFile}\`)`
        : ` (${edge.typeLabel})`;

      lines.push(`- ${edge.sourceRouteName} → ${edge.targetRouteName}${location}`);
    }

    lines.push('');
  }

  lines.push('## Current Flow Signals');
  lines.push('');
  lines.push(`- **Entry points**: ${formatRouteList(payload.signals.entryRouteIds, payload.nodes)}`);
  lines.push(`- **Dead ends**: ${formatRouteList(payload.signals.deadEndRouteIds, payload.nodes)}`);
  lines.push(`- **Orphaned screens**: ${formatRouteList(payload.signals.orphanedRouteIds, payload.nodes)}`);
  lines.push(`- **Runtime-only screens**: ${formatRouteList(payload.signals.runtimeOnlyRouteIds, payload.nodes)}`);
  lines.push(`- **Hub screens**: ${formatRouteList(payload.signals.hubRouteIds, payload.nodes)}`);
  lines.push('');

  lines.push('## Open Questions For Next Change');
  lines.push('');

  for (const question of payload.openQuestions) {
    lines.push(`- ${question}`);
  }
  lines.push('');

  if (payload.intendedJourney) {
    lines.push('## Intended Journey');
    lines.push('');
    lines.push(`- **Journey**: ${payload.intendedJourney.name}`);
    lines.push(`- **Start screens**: ${formatRouteList(payload.intendedJourney.startRouteIds, payload.nodes)}`);
    lines.push(`- **End screens**: ${formatRouteList(payload.intendedJourney.endRouteIds, payload.nodes)}`);
    lines.push(`- **Added flows**: ${payload.intendedJourney.addedEdges.length}`);
    lines.push(`- **Removed flows**: ${payload.intendedJourney.removedEdges.length}`);
    lines.push('');

    lines.push('## Intended Flow Changes');
    lines.push('');

    if (
      payload.intendedJourney.addedEdges.length === 0 &&
      payload.intendedJourney.removedEdges.length === 0
    ) {
      lines.push('- No intended flow changes have been drafted yet.');
      lines.push('');
    } else {
      for (const edgeChange of payload.intendedJourney.addedEdges) {
        lines.push(`- Add flow: ${edgeChange.sourceRouteName} -> ${edgeChange.targetRouteName}`);
      }
      for (const edgeChange of payload.intendedJourney.removedEdges) {
        lines.push(`- Remove flow: ${edgeChange.sourceRouteName} -> ${edgeChange.targetRouteName}`);
      }
      lines.push('');
    }

    lines.push('## Requested Changes For AI');
    lines.push('');

    for (const change of payload.intendedJourney.requestedChanges) {
      lines.push(`- ${change}`);
    }
    lines.push('');
  }

  lines.push('## Structured Data');
  lines.push('');
  lines.push('```json');
  lines.push(generateJson(data, options));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function formatFramework(framework: string): string {
  switch (framework) {
    case 'nextjs-app':
      return 'Next.js App Router';
    case 'nextjs-pages':
      return 'Next.js Pages Router';
    case 'react-router':
      return 'React Router';
    default:
      return 'Unknown';
  }
}

function formatEdgeType(type: string): string {
  switch (type) {
    case 'link':
      return '<Link>';
    case 'navigate':
      return 'useNavigate';
    case 'redirect':
      return 'redirect';
    case 'inferred':
      return 'inferred';
    default:
      return type;
  }
}

function formatRouteList(
  routeIds: string[],
  routes: Array<{ id: string; name: string; path: string }>,
): string {
  if (routeIds.length === 0) {
    return 'None';
  }

  const routeMap = new Map(routes.map((route) => [route.id, route]));
  return routeIds
    .map((routeId) => {
      const route = routeMap.get(routeId);
      return route ? `\`${route.name} (${route.path})\`` : `\`${routeId}\``;
    })
    .join(', ');
}

function buildOpenQuestions(
  insights: ReturnType<typeof analyzeAppMap>,
  routeMap: Map<string, { name: string; path: string }>,
): string[] {
  const questions: string[] = [];

  if (insights.deadEndRouteIds.length > 0) {
    questions.push(
      `What should happen after ${formatPlainRouteList(insights.deadEndRouteIds, routeMap)}?`,
    );
  }

  if (insights.orphanedRouteIds.length > 0) {
    questions.push(
      `Should ${formatPlainRouteList(insights.orphanedRouteIds, routeMap)} be linked into a journey or removed?`,
    );
  }

  if (insights.runtimeOnlyRouteIds.length > 0) {
    questions.push(
      `Should ${formatPlainRouteList(insights.runtimeOnlyRouteIds, routeMap)} be represented in static routing or hidden from the product flow?`,
    );
  }

  if (questions.length === 0) {
    questions.push('What is the intended next user journey that should be shaped after this current-state map?');
  }

  return questions;
}

function buildRequestedChanges(
  journey: Journey,
  diff: NonNullable<ReturnType<typeof deriveJourneyDiff>>,
  routeMap: Map<string, { name: string; path: string }>,
): string[] {
  const changes: string[] = [];

  if (journey.startRouteIds.length > 0) {
    changes.push(
      `Use ${formatPlainRouteList(journey.startRouteIds, routeMap)} as the journey starting screen${journey.startRouteIds.length > 1 ? 's' : ''}.`,
    );
  }

  if (journey.endRouteIds.length > 0) {
    changes.push(
      `Use ${formatPlainRouteList(journey.endRouteIds, routeMap)} as the journey ending screen${journey.endRouteIds.length > 1 ? 's' : ''}.`,
    );
  }

  for (const edgeChange of diff.addedEdges) {
    changes.push(`Add a user flow from ${formatEdgeChange(edgeChange, routeMap)}.`);
  }

  for (const edgeChange of diff.removedEdges) {
    changes.push(`Remove the current user flow from ${formatEdgeChange(edgeChange, routeMap)}.`);
  }

  if (changes.length === 0) {
    changes.push('Draft the intended next journey on top of the current screens before making code changes.');
  }

  return changes;
}

function formatPlainRouteList(routeIds: string[], routeMap: Map<string, { name: string; path: string }>): string {
  return routeIds
    .map((routeId) => routeMap.get(routeId)?.name ?? routeId)
    .join(', ');
}

function formatEdgeChange(
  edgeChange: { sourceRouteId: string; targetRouteId: string },
  routeMap: Map<string, { name: string; path: string }>,
): string {
  const source = routeMap.get(edgeChange.sourceRouteId);
  const target = routeMap.get(edgeChange.targetRouteId);

  return `${source?.name ?? edgeChange.sourceRouteId} -> ${target?.name ?? edgeChange.targetRouteId}`;
}

export { copyToClipboard } from './clipboard';
