import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const edgeTypeColors: Record<string, string> = {
  auto: '#6366f1',
  manual: '#22c55e',
};

export function ConnectionEdgeComponent({
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
  const connectionType = (data?.type as string) || 'manual';
  const color = edgeTypeColors[connectionType] || edgeTypeColors.manual;

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
        strokeWidth: 2,
        strokeDasharray: connectionType === 'auto' ? 'none' : '6 3',
      }}
    />
  );
}
