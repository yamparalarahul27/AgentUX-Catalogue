import { useState } from 'react';

export type ToolMode = 'pointer' | 'hand';

interface ToolbarProps {
  flowName: string;
  screenshotCount: number;
  connectionCount: number;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onUploadClick: () => void;
  onAddFlow: () => void;
  onAutoConnect: () => void;
  onRelayout: () => void;
  onCatalogueAdd: () => void;
  onExport: () => void;
  onBack: () => void;
}

export function Toolbar({
  flowName,
  screenshotCount,
  connectionCount,
  toolMode,
  onToolModeChange,
  onUploadClick,
  onAddFlow,
  onCatalogueAdd,
  onAutoConnect,
  onRelayout,
  onExport,
  onBack,
}: ToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    onExport();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="toolbar-btn toolbar-btn-back" onClick={onBack} title="Back to flows">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="toolbar-mode-toggle">
          <button
            className={`toolbar-mode-btn ${toolMode === 'pointer' ? 'active' : ''}`}
            onClick={() => onToolModeChange('pointer')}
            title="Pointer tool (V)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>
          <button
            className={`toolbar-mode-btn ${toolMode === 'hand' ? 'active' : ''}`}
            onClick={() => onToolModeChange('hand')}
            title="Hand tool (H)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 11V6a2 2 0 00-4 0v2" />
              <path d="M14 10V4a2 2 0 00-4 0v6" />
              <path d="M10 10.5V6a2 2 0 00-4 0v8" />
              <path d="M18 8a2 2 0 014 0v7a8 8 0 01-8 8h-2c-2.83 0-5.27-1.17-6.83-3L2 16" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <h2 className="toolbar-title">{flowName}</h2>
        <span className="toolbar-stats">
          {screenshotCount} screens · {connectionCount} flows
        </span>
      </div>

      <div className="toolbar-right">
        <button className="toolbar-btn" onClick={onUploadClick} title="Upload screenshots">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </button>

        <button className="toolbar-btn" onClick={onCatalogueAdd} title="Add screenshots from catalogue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Add from Catalogue
        </button>

        <button className="toolbar-btn" onClick={onAddFlow} title="Add flow from text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Flow
        </button>

        <button className="toolbar-btn" onClick={onAutoConnect} title="Auto-connect based on naming">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Auto-Connect
        </button>

        <button className="toolbar-btn" onClick={onRelayout} title="Re-layout nodes">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Layout
        </button>

        <button
          className={`toolbar-btn ${copied ? 'toolbar-btn-copied' : ''}`}
          onClick={handleExport}
          title="Export as Markdown"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Export
            </>
          )}
        </button>
      </div>
    </div>
  );
}
