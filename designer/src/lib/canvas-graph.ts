import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Connection, ScreenshotNode } from '../types';

export const CANVAS_THEME = {
  accent: '#6366f1',
  bg: '#0f0f10',
  nodeBg: '#18181b',
  nodeBorder: '#27272a',
  text: '#e4e4e7',
};

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 200;
export const NODE_SEP = 80;
export const RANK_SEP = 120;

export type ArrowDirection = 'forward' | 'backward' | 'both';

export function layoutElements(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      };
    }),
    edges,
  };
}

export function buildEdgeMarkers(dir: ArrowDirection) {
  const markers: { markerEnd?: { type: MarkerType; color: string }; markerStart?: { type: MarkerType; color: string } } = {};
  if (dir === 'forward' || dir === 'both') {
    markers.markerEnd = { type: MarkerType.ArrowClosed, color: CANVAS_THEME.accent };
  }
  if (dir === 'backward' || dir === 'both') {
    markers.markerStart = { type: MarkerType.ArrowClosed, color: CANVAS_THEME.accent };
  }
  return markers;
}

export function buildFlowElements(screenshots: ScreenshotNode[], connections: Connection[]) {
  const rawNodes: Node[] = screenshots.map((s) => ({
    id: s.id,
    type: 'screenshotNode',
    position:
      s.position_x !== null && s.position_y !== null
        ? { x: s.position_x, y: s.position_y }
        : { x: 0, y: 0 },
    data: {
      label: s.name,
      imageUrl: s.image_url || '',
      group: s.group,
      sequence: s.sequence,
    },
  }));

  const nodeIds = new Set(screenshots.map((s) => s.id));
  const rawEdges: Edge[] = connections
    .filter((c) => nodeIds.has(c.source_id) && nodeIds.has(c.target_id))
    .map((c) => ({
      id: c.id,
      source: c.source_id,
      target: c.target_id,
      sourceHandle: c.source_handle || undefined,
      targetHandle: c.target_handle || undefined,
      type: 'connectionEdge',
      animated: c.type === 'auto',
      ...buildEdgeMarkers(c.arrow_direction || 'forward'),
      data: { type: c.type, label: c.label || '' },
    }));

  const hasPositions = screenshots.some(
    (s) => s.position_x !== null && s.position_y !== null,
  );

  if (hasPositions) {
    return { nodes: rawNodes, edges: rawEdges };
  }
  return layoutElements(rawNodes, rawEdges);
}
