import React from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { DEFAULT_THEME } from '../constants';

const edgeTypeColors: Record<string, string> = {
  link: DEFAULT_THEME.edgeColor,
  navigate: '#8b5cf6',
  redirect: '#f59e0b',
  inferred: '#6b7280',
};

/** Custom React Flow edge for displaying a navigation flow */
export function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeType = (data?.type as string) || 'link';
  const state = (data?.state as string) || 'current';
  const canvasEditMode = (data?.canvasEditMode as string) || 'inspect';
  const color =
    state === 'removed'
      ? '#f59e0b'
      : state === 'intended'
        ? '#22c55e'
        : edgeTypeColors[edgeType] || edgeTypeColors.link;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: color,
        strokeWidth: canvasEditMode === 'prune' ? 3 : 2,
        strokeDasharray: state === 'removed' ? '8 6' : state === 'intended' ? '6 4' : undefined,
        opacity: state === 'removed' ? 0.75 : canvasEditMode === 'prune' ? 0.95 : 1,
        cursor: canvasEditMode === 'prune' ? 'pointer' : 'default',
      }}
    />
  );
}
