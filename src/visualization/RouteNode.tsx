import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { DEFAULT_THEME } from '../constants';

export interface RouteNodeData {
  label: string;
  path: string;
  componentFile?: string;
  framework: string;
  source: 'static' | 'runtime' | 'both';
  canvasEditMode?: 'inspect' | 'connect' | 'prune';
  status?: string;
  incomingCount?: number;
  outgoingCount?: number;
  isSelected?: boolean;
  [key: string]: unknown;
}

const frameworkColors: Record<string, string> = {
  'nextjs-app': '#0070f3',
  'nextjs-pages': '#0070f3',
  'react-router': '#f44250',
  unknown: DEFAULT_THEME.accentColor,
};

const sourceColors: Record<string, string> = {
  static: '#3b82f6',
  runtime: '#22c55e',
  both: '#a855f7',
};

/** Custom React Flow node for displaying a route/screen */
export const RouteNodeComponent = memo(({ data }: NodeProps) => {
  const nodeData = data as RouteNodeData;
  const frameworkColor = frameworkColors[nodeData.framework] || frameworkColors.unknown;
  const sourceColor = sourceColors[nodeData.source] || sourceColors.static;
  const isConnectMode = nodeData.canvasEditMode === 'connect';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: DEFAULT_THEME.nodeBgColor,
        border: nodeData.isSelected
          ? `1px solid ${DEFAULT_THEME.accentColor}`
          : `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        minWidth: '220px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '13px',
        color: DEFAULT_THEME.textColor,
        boxShadow: nodeData.isSelected ? '0 0 0 1px rgba(99,102,241,0.25), 0 6px 20px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectMode}
        style={{
          background: DEFAULT_THEME.accentColor,
          width: isConnectMode ? 10 : 8,
          height: isConnectMode ? 10 : 8,
          boxShadow: isConnectMode ? '0 0 0 3px rgba(99,102,241,0.2)' : undefined,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{nodeData.label}</span>
        <span
          style={{
            fontSize: '9px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: sourceColor,
            color: '#fff',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {nodeData.source}
        </span>
      </div>

      <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: frameworkColor, marginRight: '4px' }}>●</span>
        {nodeData.path}
      </div>

      {nodeData.componentFile && (
        <div
          style={{
            color: '#71717a',
            fontSize: '11px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.componentFile}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginTop: '8px',
          color: '#71717a',
          fontSize: '11px',
        }}
      >
        <span>
          {nodeData.incomingCount ?? 0} in · {nodeData.outgoingCount ?? 0} out
        </span>
        {nodeData.status && (
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '999px',
              background: '#27272a',
              color: DEFAULT_THEME.textColor,
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {nodeData.status.replace(/-/g, ' ')}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectMode}
        style={{
          background: DEFAULT_THEME.accentColor,
          width: isConnectMode ? 10 : 8,
          height: isConnectMode ? 10 : 8,
          boxShadow: isConnectMode ? '0 0 0 3px rgba(99,102,241,0.2)' : undefined,
        }}
      />
    </div>
  );
});

RouteNodeComponent.displayName = 'RouteNode';
