import React, { useMemo, useState } from 'react';
import { DEFAULT_THEME } from '../constants';
import type { Journey, RouteNode } from '../types';
import type { AppMapInsights, RouteDetails } from '../utils/flow-insights';
import type { JourneyRouteState } from '../workspace';

interface RouteDetailsPanelProps {
  details: RouteDetails | null;
  insights: AppMapInsights;
  onInspectFirstVisible?: () => void;
  visibleRouteCount: number;
  routes: RouteNode[];
  journey: Journey | null;
  journeyRouteState?: JourneyRouteState | null;
  onCreateJourneyDraft?: () => void;
  onToggleJourneyBoundary?: (routeId: string, boundary: 'start' | 'end') => void;
  onToggleJourneyEdgeChange?: (
    sourceRouteId: string,
    targetRouteId: string,
    change: 'add' | 'remove',
  ) => void;
}

export function RouteDetailsPanel({
  details,
  insights,
  onInspectFirstVisible,
  visibleRouteCount,
  routes,
  journey,
  journeyRouteState,
  onCreateJourneyDraft,
  onToggleJourneyBoundary,
  onToggleJourneyEdgeChange,
}: RouteDetailsPanelProps) {
  const [selectedTargetRouteId, setSelectedTargetRouteId] = useState('');
  const routeMap = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);

  if (!details) {
    return (
      <aside
        style={{
          flex: '0 0 300px',
          minHeight: 0,
          borderLeft: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
          background: '#111113',
          padding: '20px',
          display: 'grid',
          gap: '16px',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <div>
          <p style={eyebrowStyle}>Route Details</p>
          <h3 style={titleStyle}>Inspect one screen at a time</h3>
          <p style={bodyStyle}>
            Select a node in the graph to inspect its incoming and outgoing routes, evidence, and
            flow flags.
          </p>
        </div>

        <div style={cardStyle}>
          <p style={labelStyle}>Current graph signals</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>
              <span>Entry points</span>
              <strong style={valueStyle}>{insights.entryRouteIds.length}</strong>
            </li>
            <li style={listItemStyle}>
              <span>Dead ends</span>
              <strong style={valueStyle}>{insights.deadEndRouteIds.length}</strong>
            </li>
            <li style={listItemStyle}>
              <span>Orphaned</span>
              <strong style={valueStyle}>{insights.orphanedRouteIds.length}</strong>
            </li>
            <li style={listItemStyle}>
              <span>Runtime only</span>
              <strong style={valueStyle}>{insights.runtimeOnlyRouteIds.length}</strong>
            </li>
          </ul>
        </div>

        <div style={cardStyle}>
          <p style={labelStyle}>Intended journey draft</p>
          <p style={bodyStyle}>
            {journey
              ? `Drafting "${journey.name}". Select a screen to mark starts, ends, and intended next steps.`
              : 'Start a draft journey to shape the next UX flow on top of the detected graph.'}
          </p>
          {!journey && (
            <button
              type="button"
              onClick={onCreateJourneyDraft}
              disabled={!onCreateJourneyDraft}
              style={{
                ...buttonStyle,
                opacity: onCreateJourneyDraft ? 1 : 0.5,
                cursor: onCreateJourneyDraft ? 'pointer' : 'not-allowed',
              }}
            >
              Start intended journey draft
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onInspectFirstVisible}
          disabled={!onInspectFirstVisible || visibleRouteCount === 0}
          style={{
            ...buttonStyle,
            opacity: onInspectFirstVisible && visibleRouteCount > 0 ? 1 : 0.5,
            cursor: onInspectFirstVisible && visibleRouteCount > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          Inspect first visible screen
        </button>
      </aside>
    );
  }

  const countBadges = [
    details.isEntry ? 'Entry point' : null,
    details.isDeadEnd ? 'Dead end' : null,
    details.isOrphaned ? 'Orphaned' : null,
    details.isRuntimeOnly ? 'Runtime only' : null,
    details.isHub ? 'Hub screen' : null,
  ].filter(Boolean);
  const availableTargetRoutes = routes
    .filter((route) => route.id !== details.route.id)
    .sort((a, b) => a.path.localeCompare(b.path));
  const removedOutgoingRouteIds = new Set(journeyRouteState?.removedOutgoingRouteIds ?? []);
  const addedOutgoingRoutes = (journeyRouteState?.addedOutgoingRouteIds ?? [])
    .map((routeId) => routeMap.get(routeId))
    .filter(Boolean) as RouteNode[];

  return (
    <aside
      style={{
        flex: '0 0 300px',
        minHeight: 0,
        borderLeft: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        background: '#111113',
        padding: '20px',
        display: 'grid',
        gap: '16px',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <div>
        <p style={eyebrowStyle}>Route Details</p>
        <h3 style={titleStyle}>{details.route.name}</h3>
        <p style={bodyStyle}>{details.route.path}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {countBadges.map((badge) => (
          <span key={badge} style={badgeStyle}>
            {badge}
          </span>
        ))}
      </div>

      <div style={cardStyle}>
        <p style={labelStyle}>Screen metadata</p>
        <dl style={{ margin: 0, display: 'grid', gap: '12px' }}>
          <DetailRow label="Framework" value={formatFramework(details.route.framework)} />
          <DetailRow label="Source" value={details.route.source} />
          <DetailRow label="Incoming flows" value={String(details.incoming.length)} />
          <DetailRow label="Outgoing flows" value={String(details.outgoing.length)} />
          <DetailRow label="Component" value={details.route.componentFile ?? 'Not detected'} />
        </dl>
      </div>

      <div style={cardStyle}>
        <p style={labelStyle}>Intended Journey Draft</p>
        {journey ? (
          <div style={{ display: 'grid', gap: '12px' }}>
            <p style={{ ...bodyStyle, marginTop: 0 }}>
              Editing <strong style={{ color: DEFAULT_THEME.textColor }}>{journey.name}</strong>
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <InlineActionButton
                onClick={() => onToggleJourneyBoundary?.(details.route.id, 'start')}
                active={Boolean(journeyRouteState?.isStart)}
              >
                {journeyRouteState?.isStart ? 'Started here' : 'Mark as start'}
              </InlineActionButton>
              <InlineActionButton
                onClick={() => onToggleJourneyBoundary?.(details.route.id, 'end')}
                active={Boolean(journeyRouteState?.isEnd)}
              >
                {journeyRouteState?.isEnd ? 'Ends here' : 'Mark as end'}
              </InlineActionButton>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={labelStyle}>Add intended next step</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={selectedTargetRouteId}
                  onChange={(event) => setSelectedTargetRouteId(event.target.value)}
                  style={selectStyle}
                >
                  <option value="">Choose a screen</option>
                  {availableTargetRoutes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name} ({route.path})
                    </option>
                  ))}
                </select>
                <InlineActionButton
                  onClick={() => {
                    if (!selectedTargetRouteId) return;
                    onToggleJourneyEdgeChange?.(details.route.id, selectedTargetRouteId, 'add');
                    setSelectedTargetRouteId('');
                  }}
                  disabled={!selectedTargetRouteId}
                >
                  Add flow
                </InlineActionButton>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              <p style={labelStyle}>Drafted next steps</p>
              {addedOutgoingRoutes.length === 0 ? (
                <p style={{ ...bodyStyle, marginTop: 0 }}>
                  No intended next steps have been added from this screen yet.
                </p>
              ) : (
                <ul style={listStyle}>
                  {addedOutgoingRoutes.map((route) => (
                    <li key={route.id} style={listItemStyle}>
                      <span>
                        {route.name}
                        <span style={metaStyle}> · {route.path}</span>
                      </span>
                      <InlineActionButton
                        onClick={() => onToggleJourneyEdgeChange?.(details.route.id, route.id, 'add')}
                      >
                        Remove
                      </InlineActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            <p style={{ ...bodyStyle, marginTop: 0 }}>
              Start a draft journey to mark where this path should begin, end, and what comes
              next.
            </p>
            <button
              type="button"
              onClick={onCreateJourneyDraft}
              disabled={!onCreateJourneyDraft}
              style={{
                ...buttonStyle,
                opacity: onCreateJourneyDraft ? 1 : 0.5,
                cursor: onCreateJourneyDraft ? 'pointer' : 'not-allowed',
              }}
            >
              Start intended journey draft
            </button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <p style={labelStyle}>Incoming</p>
        {details.incoming.length === 0 ? (
          <p style={bodyStyle}>No screens currently navigate into this route.</p>
        ) : (
          <ConnectionList items={details.incoming} />
        )}
      </div>

      <div style={cardStyle}>
        <p style={labelStyle}>Outgoing</p>
        {details.outgoing.length === 0 ? (
          <p style={bodyStyle}>No outgoing transitions detected from this route yet.</p>
        ) : (
          <ConnectionList
            items={details.outgoing}
            mutedRouteIds={removedOutgoingRouteIds}
            renderAction={
              journey
                ? ({ route }) => (
                    <InlineActionButton
                      onClick={() =>
                        onToggleJourneyEdgeChange?.(details.route.id, route.id, 'remove')
                      }
                      tone={removedOutgoingRouteIds.has(route.id) ? 'warning' : 'default'}
                    >
                      {removedOutgoingRouteIds.has(route.id) ? 'Restore' : 'Remove'}
                    </InlineActionButton>
                  )
                : undefined
            }
          />
        )}
      </div>
    </aside>
  );
}

function ConnectionList({
  items,
  mutedRouteIds,
  renderAction,
}: {
  items: Array<{ route: RouteDetails['route']; edge: RouteDetails['incoming'][number]['edge'] }>;
  mutedRouteIds?: Set<string>;
  renderAction?: (item: {
    route: RouteDetails['route'];
    edge: RouteDetails['incoming'][number]['edge'];
  }) => React.ReactNode;
}) {
  return (
    <ul style={{ ...listStyle, gap: '10px' }}>
      {items.map(({ route, edge }) => (
        <li
          key={edge.id}
          style={{
            ...listItemStyle,
            alignItems: 'flex-start',
            opacity: mutedRouteIds?.has(route.id) ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
            <span style={{ color: DEFAULT_THEME.textColor, fontWeight: 600 }}>{route.name}</span>
            <span style={metaStyle}>
              {route.path} · {formatEdgeType(edge.type)}
              {edge.sourceFile ? ` · ${edge.sourceFile}` : ''}
              {edge.sourceLine ? `:${edge.sourceLine}` : ''}
            </span>
          </div>
          {renderAction?.({ route, edge })}
        </li>
      ))}
    </ul>
  );
}

function InlineActionButton({
  onClick,
  children,
  active = false,
  disabled = false,
  tone = 'default',
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'warning';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '32px',
        padding: '0 10px',
        borderRadius: '10px',
        border: `1px solid ${
          tone === 'warning'
            ? '#f59e0b'
            : active
              ? DEFAULT_THEME.accentColor
              : DEFAULT_THEME.nodeBorderColor
        }`,
        background:
          tone === 'warning'
            ? 'rgba(245, 158, 11, 0.12)'
            : active
              ? 'rgba(99, 102, 241, 0.18)'
              : '#09090b',
        color: tone === 'warning' ? '#fbbf24' : DEFAULT_THEME.textColor,
        fontSize: '12px',
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ margin: 0, color: DEFAULT_THEME.textColor, fontSize: '13px', lineHeight: 1.5 }}>{value}</dd>
    </div>
  );
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
      return 'Link';
    case 'navigate':
      return 'Navigate';
    case 'redirect':
      return 'Redirect';
    case 'inferred':
      return 'Runtime';
    default:
      return type;
  }
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: '#f59e0b',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: DEFAULT_THEME.textColor,
  fontSize: '18px',
};

const bodyStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: '#a1a1aa',
  fontSize: '13px',
  lineHeight: 1.6,
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: '#71717a',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const valueStyle: React.CSSProperties = {
  color: DEFAULT_THEME.textColor,
  fontSize: '13px',
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  padding: '14px',
  borderRadius: '14px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#18181b',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: '8px',
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  color: '#d4d4d8',
  fontSize: '13px',
};

const metaStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '12px',
  lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: DEFAULT_THEME.textColor,
  fontSize: '12px',
};

const badgeStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '999px',
  background: '#27272a',
  color: DEFAULT_THEME.textColor,
  fontSize: '11px',
  fontWeight: 600,
};

const buttonStyle: React.CSSProperties = {
  minHeight: '40px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: DEFAULT_THEME.textColor,
  fontSize: '13px',
  fontWeight: 600,
};
