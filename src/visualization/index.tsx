import React, { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  type Connection,
  type EdgeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { AppMapData } from '../types';
import { DEFAULT_THEME } from '../constants';
import { RouteNodeComponent } from './RouteNode';
import { FlowEdgeComponent } from './FlowEdge';
import { getLayoutedElements } from './layout';
import type { AppMapInsights } from '../utils/flow-insights';
import type { JourneyGraphEdgeState } from '../workspace';
import type { CanvasEditMode } from '../ui/CanvasEditBar';

interface AppMapCanvasProps {
  data: AppMapData;
  insights: AppMapInsights;
  selectedRouteId: string | null;
  onRouteSelect: (routeId: string | null) => void;
  edgeStatesById?: Record<string, JourneyGraphEdgeState>;
  canvasEditMode: CanvasEditMode;
  onCanvasConnect?: (sourceRouteId: string, targetRouteId: string) => void;
  onCanvasEdgeToggle?: (edge: {
    sourceRouteId: string;
    targetRouteId: string;
    state: JourneyGraphEdgeState;
  }) => void;
}

const nodeTypes = {
  routeNode: RouteNodeComponent,
};

const edgeTypes = {
  flowEdge: FlowEdgeComponent,
};

/** Convert AppMapData into React Flow nodes and edges with dagre layout */
function buildFlowElements(
  data: AppMapData,
  insights: AppMapInsights,
  selectedRouteId: string | null,
  edgeStatesById: Record<string, JourneyGraphEdgeState> = {},
  canvasEditMode: CanvasEditMode = 'inspect',
): { nodes: Node[]; edges: Edge[] } {
  const rawNodes: Node[] = data.routes.map((route) => ({
    id: route.id,
    type: 'routeNode',
    position: { x: 0, y: 0 },
    data: {
      label: route.name,
      path: route.path,
      componentFile: route.componentFile,
      framework: route.framework,
      source: route.source,
      incomingCount: insights.countsByRouteId[route.id]?.incoming ?? 0,
      outgoingCount: insights.countsByRouteId[route.id]?.outgoing ?? 0,
      isSelected: route.id === selectedRouteId,
      canvasEditMode,
      status: insights.orphanedRouteIds.includes(route.id)
        ? 'orphaned'
        : insights.deadEndRouteIds.includes(route.id)
          ? 'dead-end'
          : insights.runtimeOnlyRouteIds.includes(route.id)
            ? 'runtime-only'
            : insights.entryRouteIds.includes(route.id)
              ? 'entry'
              : undefined,
    },
  }));

  const routeIds = new Set(data.routes.map((r) => r.id));

  const rawEdges: Edge[] = data.edges
    .filter((edge) => routeIds.has(edge.sourceRouteId) && routeIds.has(edge.targetRouteId))
    .map((edge) => ({
      id: edge.id,
      source: edge.sourceRouteId,
      target: edge.targetRouteId,
      type: 'flowEdge',
      animated:
        edgeStatesById[edge.id] === 'intended' || edge.type === 'inferred',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color:
          edgeStatesById[edge.id] === 'removed'
            ? '#f59e0b'
            : edgeStatesById[edge.id] === 'intended'
              ? '#22c55e'
              : DEFAULT_THEME.edgeColor,
      },
      data: {
        type: edge.type,
        state: edgeStatesById[edge.id] ?? 'current',
        canvasEditMode,
      },
    }));

  return getLayoutedElements(rawNodes, rawEdges);
}

/** Interactive React Flow canvas that displays the app map */
export function AppMapCanvas({
  data,
  insights,
  selectedRouteId,
  onRouteSelect,
  edgeStatesById,
  canvasEditMode,
  onCanvasConnect,
  onCanvasEdgeToggle,
}: AppMapCanvasProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildFlowElements(data, insights, selectedRouteId, edgeStatesById, canvasEditMode),
    [data, insights, selectedRouteId, edgeStatesById, canvasEditMode],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  const handleConnect = (connection: Connection) => {
    if (!onCanvasConnect || canvasEditMode !== 'connect') return;
    if (!connection.source || !connection.target) return;
    onCanvasConnect(connection.source, connection.target);
  };

  const handleEdgeClick: EdgeMouseHandler = (_, edge) => {
    if (!onCanvasEdgeToggle || canvasEditMode !== 'prune') return;

    onCanvasEdgeToggle({
      sourceRouteId: edge.source,
      targetRouteId: edge.target,
      state: ((edge.data?.state as JourneyGraphEdgeState | undefined) ?? 'current'),
    });
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onRouteSelect(node.id)}
        onEdgeClick={handleEdgeClick}
        onConnect={handleConnect}
        onPaneClick={() => onRouteSelect(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={canvasEditMode === 'connect'}
        elementsSelectable={canvasEditMode !== 'connect'}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        defaultEdgeOptions={{
          type: 'flowEdge',
        }}
        style={{
          background: DEFAULT_THEME.bgColor,
        }}
      >
        <Controls
          style={{
            background: DEFAULT_THEME.nodeBgColor,
            border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
            borderRadius: '8px',
          }}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={DEFAULT_THEME.nodeBorderColor}
        />
      </ReactFlow>
    </div>
  );
}

export { getLayoutedElements } from './layout';
