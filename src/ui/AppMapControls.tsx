import type React from 'react';

import { DEFAULT_THEME } from '../constants';
import type { DataSourceStatus } from './SetupGuide';

export function formatDataSourceLabel(status: DataSourceStatus): string {
  switch (status) {
    case 'static-plus-runtime':
      return 'Static + Runtime';
    case 'static-only':
      return 'Static only';
    case 'no-data':
      return 'No data yet';
    default:
      return 'Runtime only';
  }
}

interface PanelToggleButtonProps {
  label: string;
  meta: string;
  isOpen: boolean;
  onClick: () => void;
}

export function PanelToggleButton({ label, meta, isOpen, onClick }: PanelToggleButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={onClick}
      style={{
        display: 'grid',
        gap: '4px',
        minWidth: 220,
        padding: '10px 12px',
        borderRadius: '12px',
        border: `1px solid ${isOpen ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
        background: isOpen ? 'rgba(99, 102, 241, 0.12)' : '#111113',
        color: DEFAULT_THEME.textColor,
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#a1a1aa', fontSize: '11px', lineHeight: 1.4 }}>{meta}</span>
    </button>
  );
}

interface ViewButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function ViewButton({ label, active, onClick }: ViewButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: '36px',
        padding: '0 12px',
        borderRadius: '999px',
        border: `1px solid ${active ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
        background: active ? DEFAULT_THEME.accentColor : '#18181b',
        color: active ? '#ffffff' : '#d4d4d8',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

export const secondaryButtonStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#18181b',
  color: '#f4f4f5',
  fontSize: '12px',
  fontWeight: 600,
};
