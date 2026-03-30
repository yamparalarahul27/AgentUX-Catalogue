import React from 'react';
import { DEFAULT_THEME } from '../constants';

export type CanvasEditMode = 'inspect' | 'connect' | 'prune';

interface CanvasEditBarProps {
  mode: CanvasEditMode;
  onModeChange: (mode: CanvasEditMode) => void;
  hasJourneyDraft: boolean;
}

const MODE_COPY: Record<CanvasEditMode, { title: string; hint: string }> = {
  inspect: {
    title: 'Inspect mode',
    hint: 'Click any screen to inspect its evidence, incoming flows, and outgoing flows.',
  },
  connect: {
    title: 'Add flow mode',
    hint: 'Drag from a node’s bottom handle to another node’s top handle to add an intended flow.',
  },
  prune: {
    title: 'Prune flow mode',
    hint: 'Click an edge in the graph to remove it from the draft or restore it.',
  },
};

export function CanvasEditBar({
  mode,
  onModeChange,
  hasJourneyDraft,
}: CanvasEditBarProps) {
  const copy = MODE_COPY[mode];

  return (
    <section style={containerStyle}>
      <div style={{ display: 'grid', gap: '4px' }}>
        <p style={eyebrowStyle}>Canvas Editing</p>
        <h3 style={titleStyle}>{copy.title}</h3>
        <p style={bodyStyle}>
          {hasJourneyDraft
            ? copy.hint
            : 'Create a journey draft first to unlock graph editing directly from the canvas.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <ModeButton
          label="Inspect"
          active={mode === 'inspect'}
          onClick={() => onModeChange('inspect')}
        />
        <ModeButton
          label="Add Flow"
          active={mode === 'connect'}
          onClick={() => onModeChange('connect')}
          disabled={!hasJourneyDraft}
        />
        <ModeButton
          label="Prune Flow"
          active={mode === 'prune'}
          onClick={() => onModeChange('prune')}
          disabled={!hasJourneyDraft}
        />
      </div>
    </section>
  );
}

function ModeButton({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '34px',
        padding: '0 12px',
        borderRadius: '999px',
        border: `1px solid ${active ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
        background: active ? DEFAULT_THEME.accentColor : '#09090b',
        color: active ? '#ffffff' : '#d4d4d8',
        fontSize: '12px',
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  padding: '12px 16px',
  borderBottom: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#101013',
};

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
  fontSize: '15px',
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  color: '#a1a1aa',
  fontSize: '13px',
  lineHeight: 1.6,
};
