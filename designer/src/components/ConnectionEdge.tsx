import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

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
  markerStart,
}: EdgeProps) {
  const connectionType = (data?.type as string) || 'manual';
  const edgeLabel = (data?.label as string) || '';
  const color = edgeTypeColors[connectionType] || edgeTypeColors.manual;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: connectionType === 'auto' ? 'none' : '6 3',
        }}
      />
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
