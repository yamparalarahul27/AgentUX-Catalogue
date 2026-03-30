import React from 'react';
import { DEFAULT_THEME } from '../constants';

export function Legend() {
  return (
    <section style={containerStyle}>
      <div style={{ display: 'grid', gap: '4px' }}>
        <p style={eyebrowStyle}>Legend</p>
        <h3 style={titleStyle}>Read the map at a glance</h3>
      </div>

      <div style={sectionStyle}>
        <p style={labelStyle}>Edge states</p>
        <div style={rowWrapStyle}>
          <LegendChip swatch={<EdgeSwatch color={DEFAULT_THEME.edgeColor} />} label="Current flow" />
          <LegendChip
            swatch={<EdgeSwatch color="#22c55e" dash="6 4" />}
            label="Intended flow"
          />
          <LegendChip
            swatch={<EdgeSwatch color="#f59e0b" dash="8 6" />}
            label="Removed flow"
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <p style={labelStyle}>Screen signals</p>
        <div style={rowWrapStyle}>
          <LegendChip swatch={<NodeBadge label="entry" />} label="Journey entry" />
          <LegendChip swatch={<NodeBadge label="dead end" />} label="No outgoing flow" />
          <LegendChip swatch={<NodeBadge label="orphaned" />} label="No detected connections" />
          <LegendChip swatch={<NodeBadge label="runtime only" />} label="Found only while navigating" />
        </div>
      </div>
    </section>
  );
}

function LegendChip({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div style={chipStyle}>
      {swatch}
      <span style={{ color: DEFAULT_THEME.textColor, fontSize: '12px' }}>{label}</span>
    </div>
  );
}

function EdgeSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
      <line
        x1="2"
        y1="5"
        x2="32"
        y2="5"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

function NodeBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: '999px',
        background: '#27272a',
        color: DEFAULT_THEME.textColor,
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    >
      {label}
    </span>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  padding: '14px',
  borderRadius: '14px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#101013',
};

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: '32px',
  padding: '0 10px',
  borderRadius: '999px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
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
  fontSize: '16px',
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: '#71717a',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
};
