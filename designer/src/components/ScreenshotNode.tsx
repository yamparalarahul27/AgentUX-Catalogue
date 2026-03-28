import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ScreenshotNodeData {
  label: string;
  imageUrl: string;
  group: string | null;
  sequence: number | null;
  connectionType?: 'auto' | 'manual' | 'none';
  [key: string]: unknown;
}

const groupColors: Record<string, string> = {
  auth: '#3b82f6',
  dashboard: '#22c55e',
  settings: '#f59e0b',
  profile: '#a855f7',
  home: '#ec4899',
  checkout: '#06b6d4',
  onboarding: '#84cc16',
};

function getGroupColor(group: string | null): string {
  if (!group) return '#6b7280';
  return groupColors[group.toLowerCase()] || '#6366f1';
}

export const ScreenshotNodeComponent = memo(({ data }: NodeProps) => {
  const nodeData = data as ScreenshotNodeData;
  const groupColor = getGroupColor(nodeData.group);

  return (
    <div className="screenshot-node">
      <Handle type="target" position={Position.Top} className="screenshot-handle" />

      <div className="screenshot-node-image">
        {nodeData.imageUrl ? (
          <img
            src={nodeData.imageUrl}
            alt={nodeData.label}
            draggable={false}
          />
        ) : (
          <div className="screenshot-node-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </div>

      <div className="screenshot-node-info">
        <div className="screenshot-node-header">
          {nodeData.sequence !== null && (
            <span className="screenshot-node-seq">{nodeData.sequence}</span>
          )}
          <span className="screenshot-node-label">{nodeData.label}</span>
        </div>

        {nodeData.group && (
          <div className="screenshot-node-group">
            <span className="screenshot-node-dot" style={{ background: groupColor }} />
            {nodeData.group}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="screenshot-handle" />
    </div>
  );
});

ScreenshotNodeComponent.displayName = 'ScreenshotNode';
