import React from 'react';
import { DEFAULT_THEME } from '../constants';

export type DataSourceStatus =
  | 'no-data'
  | 'runtime-only'
  | 'static-only'
  | 'static-plus-runtime';

export type ProjectStructureStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'missing'
  | 'error';

interface SetupGuideProps {
  dataSourceStatus: DataSourceStatus;
  projectStructureStatus: ProjectStructureStatus;
  projectStructureMessage: string;
  runtimeRouteCount: number;
  runtimeDetection: boolean;
  onRunProjectStructure: () => void;
  onCopyScanCommand: () => void;
  onRestartRuntime: () => void;
  onRefreshAll: () => void;
  onDismiss: () => void;
}

export function SetupGuide({
  dataSourceStatus,
  projectStructureStatus,
  projectStructureMessage,
  runtimeRouteCount,
  runtimeDetection,
  onRunProjectStructure,
  onCopyScanCommand,
  onRestartRuntime,
  onRefreshAll,
  onDismiss,
}: SetupGuideProps) {
  return (
    <section
      style={{
        display: 'grid',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        background: '#121216',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <p style={{ margin: 0, color: DEFAULT_THEME.textColor, fontSize: '15px', fontWeight: 700 }}>
              Run AgentUX
            </p>
            <span style={statusBadgeStyle(dataSourceStatus)}>
              {formatDataSourceLabel(dataSourceStatus)}
            </span>
          </div>
          <p style={{ margin: 0, color: '#a1a1aa', fontSize: '12px', lineHeight: 1.5 }}>
            Start by loading your project structure, then use the flow map or structure view to inspect
            the app’s UX.
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            minHeight: '32px',
            padding: '0 10px',
            borderRadius: '999px',
            border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
            background: '#09090b',
            color: '#d4d4d8',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Hide
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '10px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <RunCard
          eyebrow="Project Structure"
          title="Show all main screens and sub-screens"
          body={projectStructureMessage}
          tone={projectStructureStatus}
          actions={[
            { label: 'Load agentux.json', onClick: onRunProjectStructure },
            { label: 'Copy npx agentux scan', onClick: onCopyScanCommand, secondary: true },
          ]}
        />

        <RunCard
          eyebrow="Runtime Flow"
          title="Capture screens as you navigate"
          body={
            runtimeDetection
              ? `${runtimeRouteCount} runtime-discovered screen${runtimeRouteCount === 1 ? '' : 's'} are available right now.`
              : 'Runtime capture is disabled, so AgentUX can only show data from your project scan.'
          }
          tone={runtimeDetection ? 'loaded' : 'idle'}
          actions={[
            { label: 'Restart runtime capture', onClick: onRestartRuntime, disabled: !runtimeDetection },
          ]}
        />

        <RunCard
          eyebrow="Refresh"
          title="Refresh the full app map"
          body="Reload project structure and runtime state when your app changes and you want a fresh view."
          tone="idle"
          actions={[
            { label: 'Refresh all', onClick: onRefreshAll },
          ]}
        />
      </div>
    </section>
  );
}

function RunCard({
  eyebrow,
  title,
  body,
  tone,
  actions,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: ProjectStructureStatus;
  actions: Array<{ label: string; onClick: () => void; secondary?: boolean; disabled?: boolean }>;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '10px',
        padding: '12px',
        borderRadius: '12px',
        border: `1px solid ${cardBorderColor(tone)}`,
        background: '#09090b',
        alignContent: 'start',
      }}
    >
      <p style={eyebrowStyle}>{eyebrow}</p>
      <div style={{ display: 'grid', gap: '6px' }}>
        <p style={titleStyle}>{title}</p>
        <p style={bodyStyle}>{body}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            style={{
              ...buttonStyle,
              background: action.secondary ? '#09090b' : '#18181b',
              color: action.secondary ? '#d4d4d8' : DEFAULT_THEME.textColor,
              opacity: action.disabled ? 0.5 : 1,
              cursor: action.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDataSourceLabel(dataSourceStatus: DataSourceStatus): string {
  switch (dataSourceStatus) {
    case 'static-plus-runtime':
      return 'Static + Runtime';
    case 'static-only':
      return 'Static only';
    case 'runtime-only':
      return 'Runtime only';
    default:
      return 'No data yet';
  }
}

function statusBadgeStyle(dataSourceStatus: DataSourceStatus): React.CSSProperties {
  const background =
    dataSourceStatus === 'static-plus-runtime'
      ? 'rgba(34, 197, 94, 0.16)'
      : dataSourceStatus === 'static-only'
        ? 'rgba(59, 130, 246, 0.16)'
        : dataSourceStatus === 'runtime-only'
          ? 'rgba(245, 158, 11, 0.16)'
          : 'rgba(113, 113, 122, 0.2)';
  const color =
    dataSourceStatus === 'static-plus-runtime'
      ? '#86efac'
      : dataSourceStatus === 'static-only'
        ? '#93c5fd'
        : dataSourceStatus === 'runtime-only'
          ? '#fcd34d'
          : '#d4d4d8';

  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '24px',
    padding: '0 10px',
    borderRadius: '999px',
    background,
    color,
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
  };
}

function cardBorderColor(tone: ProjectStructureStatus): string {
  switch (tone) {
    case 'loaded':
      return '#22c55e';
    case 'loading':
      return '#60a5fa';
    case 'missing':
      return '#f59e0b';
    case 'error':
      return '#f87171';
    default:
      return DEFAULT_THEME.nodeBorderColor;
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
  margin: 0,
  color: DEFAULT_THEME.textColor,
  fontSize: '14px',
  fontWeight: 700,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  color: '#a1a1aa',
  fontSize: '12px',
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  minHeight: '34px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  fontSize: '12px',
  fontWeight: 600,
};
