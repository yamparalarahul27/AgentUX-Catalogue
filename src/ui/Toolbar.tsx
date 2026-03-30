import React, { useRef, useState } from 'react';
import { DEFAULT_THEME } from '../constants';
import type { AppMapFilter } from '../utils/flow-insights';

interface ToolbarProps {
  onExportMarkdown: () => void;
  onExportJson: () => void;
  onRelayout: () => void;
  routeCount: number;
  edgeCount: number;
  currentFilter: AppMapFilter;
  onFilterChange: (filter: AppMapFilter) => void;
  filterCounts: Record<AppMapFilter, number>;
  activeJourneyName?: string | null;
  onCreateJourneyDraft?: () => void;
  dataSourceLabel?: string;
  isGuideVisible: boolean;
  onToggleGuideVisibility: () => void;
}

/** Toolbar at the top of the App Map modal */
export function Toolbar({
  onExportMarkdown,
  onExportJson,
  onRelayout,
  routeCount,
  edgeCount,
  currentFilter,
  onFilterChange,
  filterCounts,
  activeJourneyName,
  onCreateJourneyDraft,
  dataSourceLabel,
  isGuideVisible,
  onToggleGuideVisibility,
}: ToolbarProps) {
  const [copiedFormat, setCopiedFormat] = useState<'markdown' | 'json' | null>(null);
  const filterOptions: Array<{ value: AppMapFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'runtime-only', label: 'Runtime' },
    { value: 'dead-ends', label: 'Dead Ends' },
    { value: 'orphaned', label: 'Orphaned' },
  ];

  const handleExport = (format: 'markdown' | 'json') => {
    if (format === 'markdown') {
      onExportMarkdown();
    } else {
      onExportJson();
    }

    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: '10px',
        padding: '10px 16px',
        background: DEFAULT_THEME.nodeBgColor,
        borderBottom: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: DEFAULT_THEME.textColor, fontWeight: 600, fontSize: '14px' }}>
            App Map
          </span>
          <span style={{ color: '#71717a', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            {routeCount} screens · {edgeCount} flows
          </span>
          {dataSourceLabel && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '24px',
                padding: '0 8px',
                borderRadius: '999px',
                background: '#111113',
                color: '#a1a1aa',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {dataSourceLabel}
            </span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '24px',
              padding: '0 8px',
              borderRadius: '999px',
              background: activeJourneyName ? 'rgba(99, 102, 241, 0.18)' : '#18181b',
              color: activeJourneyName ? '#c7d2fe' : '#71717a',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {activeJourneyName ? `Draft: ${activeJourneyName}` : 'No draft journey yet'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!activeJourneyName && onCreateJourneyDraft && (
            <ToolbarButton onClick={onCreateJourneyDraft} title="Start Draft">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </ToolbarButton>
          )}

          <ToolbarButton onClick={onRelayout} title="Re-layout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 019-9 9.75 9.75 0 017 3" />
              <path d="M21 3v6h-6" />
              <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-7-3" />
              <path d="M3 21v-6h6" />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => handleExport('markdown')}
            title={copiedFormat === 'markdown' ? 'Copied!' : 'Copy Markdown'}
          >
            {copiedFormat === 'markdown' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </ToolbarButton>

          <ToolbarButton
            onClick={() => handleExport('json')}
            title={copiedFormat === 'json' ? 'Copied!' : 'Copy JSON'}
          >
            {copiedFormat === 'json' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 6h8" />
                <path d="M8 12h8" />
                <path d="M8 18h8" />
                <path d="M4 6h.01" />
                <path d="M4 12h.01" />
                <path d="M4 18h.01" />
              </svg>
            )}
          </ToolbarButton>

          <ToolbarMenu
            isGuideVisible={isGuideVisible}
            onToggleGuideVisibility={onToggleGuideVisibility}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onFilterChange(option.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '34px',
              padding: '0 12px',
              borderRadius: '999px',
              border: `1px solid ${currentFilter === option.value ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
              background: currentFilter === option.value ? DEFAULT_THEME.accentColor : '#09090b',
              color: currentFilter === option.value ? '#fff' : '#a1a1aa',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <span>{option.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{filterCounts[option.value]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolbarMenu({
  isGuideVisible,
  onToggleGuideVisibility,
}: {
  isGuideVisible: boolean;
  onToggleGuideVisibility: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  return (
    <details
      ref={detailsRef}
      style={{
        position: 'relative',
      }}
    >
      <summary
        aria-label="Open AgentUX menu"
        style={{
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minHeight: '36px',
          padding: '0 12px',
          borderRadius: '6px',
          border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
          background: '#09090b',
          color: '#a1a1aa',
          cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
        <span style={{ fontSize: '12px', fontWeight: 600 }}>Menu</span>
      </summary>

      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: '220px',
          display: 'grid',
          gap: '6px',
          padding: '8px',
          borderRadius: '12px',
          border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
          background: '#09090b',
          boxShadow: '0 12px 24px rgba(0, 0, 0, 0.35)',
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={() => {
            onToggleGuideVisibility();
            detailsRef.current?.removeAttribute('open');
          }}
          style={{
            minHeight: '38px',
            padding: '0 12px',
            borderRadius: '10px',
            border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
            background: '#111113',
            color: DEFAULT_THEME.textColor,
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          {isGuideVisible ? 'Hide Run AgentUX' : 'Show Run AgentUX'}
        </button>
      </div>
    </details>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '6px',
        border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
        background: '#09090b',
        color: '#a1a1aa',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = DEFAULT_THEME.nodeBorderColor;
        e.currentTarget.style.color = DEFAULT_THEME.textColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#09090b';
        e.currentTarget.style.color = '#a1a1aa';
      }}
    >
      {children}
      <span>{title}</span>
    </button>
  );
}
