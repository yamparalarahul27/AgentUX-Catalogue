import React, { useMemo } from 'react';
import { DEFAULT_THEME } from '../constants';
import type { RouteNode } from '../types';
import { buildRouteHierarchy, type RouteHierarchyNode } from '../utils/route-hierarchy';

interface StructureTreeProps {
  routes: RouteNode[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

export function StructureTree({
  routes,
  selectedRouteId,
  onSelectRoute,
}: StructureTreeProps) {
  const hierarchy = useMemo(() => buildRouteHierarchy(routes), [routes]);

  if (hierarchy.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
        }}
      >
        <div style={{ display: 'grid', gap: '10px', maxWidth: '360px', textAlign: 'center' }}>
          <h3 style={{ margin: 0, color: '#f4f4f5', fontSize: '20px' }}>No project structure yet</h3>
          <p style={{ margin: 0, color: '#a1a1aa', lineHeight: 1.6 }}>
            Run a project scan so AgentUX can show your main screens and their nested sub-screens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        padding: '16px',
        display: 'grid',
        gap: '12px',
        alignContent: 'start',
      }}
    >
      {hierarchy.map((node) => (
        <StructureNode
          key={node.id}
          node={node}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
        />
      ))}
    </div>
  );
}

function StructureNode({
  node,
  selectedRouteId,
  onSelectRoute,
}: {
  node: RouteHierarchyNode;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}) {
  const isLeaf = node.children.length === 0;
  const isSelected = Boolean(node.route && node.route.id === selectedRouteId);

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <button
        type="button"
        onClick={() => node.route && onSelectRoute(node.route.id)}
        disabled={!node.route}
        style={{
          display: 'grid',
          gap: '6px',
          width: '100%',
          padding: '12px 14px',
          borderRadius: '14px',
          border: `1px solid ${isSelected ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
          background: isSelected ? 'rgba(99, 102, 241, 0.12)' : '#111113',
          color: DEFAULT_THEME.textColor,
          textAlign: 'left',
          cursor: node.route ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>
            {node.route ? node.route.name : node.label}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '22px',
              padding: '0 8px',
              borderRadius: '999px',
              background: '#18181b',
              color: '#a1a1aa',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {isLeaf ? 'Screen' : `${node.children.length} sub-screens`}
          </span>
          {node.route?.source && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '22px',
                padding: '0 8px',
                borderRadius: '999px',
                background: '#0f172a',
                color: '#93c5fd',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {node.route.source}
            </span>
          )}
        </div>
        <span style={{ color: '#a1a1aa', fontSize: '12px', lineHeight: 1.5 }}>
          {node.route?.path ?? node.fullPath}
        </span>
      </button>

      {node.children.length > 0 && (
        <div
          style={{
            marginLeft: '18px',
            paddingLeft: '14px',
            borderLeft: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
            display: 'grid',
            gap: '10px',
          }}
        >
          {node.children.map((child) => (
            <StructureNode
              key={child.id}
              node={child}
              selectedRouteId={selectedRouteId}
              onSelectRoute={onSelectRoute}
            />
          ))}
        </div>
      )}
    </div>
  );
}
