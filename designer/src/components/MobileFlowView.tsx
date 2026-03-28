import { useState } from 'react';
import type { Project, ScreenshotNode, Connection } from '../types';

interface MobileFlowViewProps {
  project: Project;
  screenshots: ScreenshotNode[];
  connections: Connection[];
  onBack: () => void;
  onExport: () => void;
}

export function MobileFlowView({
  project,
  screenshots,
  connections,
  onBack,
  onExport,
}: MobileFlowViewProps) {
  const [copied, setCopied] = useState(false);

  const connectionMap = new Map<string, string[]>();
  const screenshotMap = new Map(screenshots.map((s) => [s.id, s]));

  for (const conn of connections) {
    const existing = connectionMap.get(conn.source_id) || [];
    existing.push(conn.target_id);
    connectionMap.set(conn.source_id, existing);
  }

  // Sort by sequence, then alphabetically
  const sorted = [...screenshots].sort((a, b) => {
    if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
    if (a.sequence !== null) return -1;
    if (b.sequence !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleExport = () => {
    onExport();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mobile-flow">
      <header className="mobile-flow-header">
        <button className="toolbar-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1>{project.name}</h1>
        <button className="toolbar-btn" onClick={handleExport}>
          {copied ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      </header>

      <div className="mobile-flow-info">
        <span>{screenshots.length} screens</span>
        <span>{connections.length} flows</span>
        <span className="mobile-flow-badge">Read-only on mobile</span>
      </div>

      <div className="mobile-flow-list">
        {sorted.map((screenshot, index) => {
          const targets = connectionMap.get(screenshot.id) || [];
          return (
            <div key={screenshot.id} className="mobile-flow-card">
              <div className="mobile-flow-card-image">
                {screenshot.image_url ? (
                  <img src={screenshot.image_url} alt={screenshot.name} />
                ) : (
                  <div className="mobile-flow-card-placeholder">No image</div>
                )}
              </div>
              <div className="mobile-flow-card-info">
                <h3>
                  {screenshot.sequence !== null && (
                    <span className="mobile-flow-seq">{screenshot.sequence}.</span>
                  )}
                  {screenshot.name}
                </h3>
                {screenshot.group && (
                  <span className="mobile-flow-group">{screenshot.group}</span>
                )}
                {targets.length > 0 && (
                  <div className="mobile-flow-targets">
                    {targets.map((targetId) => {
                      const target = screenshotMap.get(targetId);
                      return target ? (
                        <span key={targetId} className="mobile-flow-arrow">
                          → {target.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              {index < sorted.length - 1 && targets.length > 0 && (
                <div className="mobile-flow-connector">
                  <svg width="2" height="24" viewBox="0 0 2 24">
                    <line x1="1" y1="0" x2="1" y2="24" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
