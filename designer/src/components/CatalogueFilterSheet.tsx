import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueViewBy } from '../lib/catalogue-activity';

interface CatalogueFilterSheetProps {
  allFlows: string[];
  allMobileOs: { id: string; label: string }[];
  allWebPresets: { id: string; label: string }[];
  filterFlow: string | null;
  filterGroup: string | null;
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  groups: string[];
  isOpen: boolean;
  onApply: (filters: {
    flow: string | null;
    group: string | null;
    mobileOs: string | null;
    platform: string | null;
    theme: string | null;
    viewBy: CatalogueViewBy;
    webPreset: string | null;
  }) => void;
  onClose: () => void;
  viewBy: CatalogueViewBy;
}

export function CatalogueFilterSheet({
  allFlows,
  allMobileOs,
  allWebPresets,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterTheme,
  filterWebPreset,
  groups,
  isOpen,
  onApply,
  onClose,
  viewBy,
}: CatalogueFilterSheetProps) {
  const [draftGroup, setDraftGroup] = useState<string | null>(filterGroup);
  const [draftFlow, setDraftFlow] = useState<string | null>(filterFlow);
  const [draftPlatform, setDraftPlatform] = useState<string | null>(filterPlatform);
  const [draftTheme, setDraftTheme] = useState<string | null>(filterTheme);
  const [draftWebPreset, setDraftWebPreset] = useState<string | null>(filterWebPreset);
  const [draftMobileOs, setDraftMobileOs] = useState<string | null>(filterMobileOs);
  const [draftViewBy, setDraftViewBy] = useState<CatalogueViewBy>(viewBy);

  useEffect(() => {
    if (!isOpen) return;
    setDraftGroup(filterGroup);
    setDraftFlow(filterFlow);
    setDraftPlatform(filterPlatform);
    setDraftTheme(filterTheme);
    setDraftWebPreset(filterWebPreset);
    setDraftMobileOs(filterMobileOs);
    setDraftViewBy(viewBy);
  }, [isOpen, filterGroup, filterFlow, filterPlatform, filterTheme, filterWebPreset, filterMobileOs, viewBy]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (draftPlatform !== 'web') setDraftWebPreset(null);
    if (draftPlatform !== 'mobile') setDraftMobileOs(null);
  }, [draftPlatform]);

  if (!isOpen) return null;

  function handleClearAll() {
    setDraftGroup(null);
    setDraftFlow(null);
    setDraftPlatform(null);
    setDraftTheme(null);
    setDraftWebPreset(null);
    setDraftMobileOs(null);
    setDraftViewBy('all');
  }

  function handleApply() {
    onApply({
      group: draftGroup,
      flow: draftFlow,
      platform: draftPlatform,
      theme: draftTheme,
      webPreset: draftWebPreset,
      mobileOs: draftMobileOs,
      viewBy: draftViewBy,
    });
    onClose();
  }

  function toggleChip(current: string | null, value: string, setter: (v: string | null) => void) {
    setter(current === value ? null : value);
  }

  return createPortal(
    <div className="catalogue-filter-sheet-overlay" onClick={onClose}>
      <div className="catalogue-filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="catalogue-filter-sheet__grabber" />

        <div className="catalogue-filter-sheet__header">
          <h3>Filters</h3>
          <button type="button" className="catalogue-filter-sheet__clear" onClick={handleClearAll}>
            Clear all
          </button>
        </div>

        <div className="catalogue-filter-sheet__body">
          {groups.length > 0 && (
            <div className="catalogue-filter-sheet__section">
              <span className="catalogue-filter-sheet__section-label">Group</span>
              <div className="catalogue-filter-sheet__chips">
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`catalogue-filter-chip ${draftGroup === group ? 'is-active' : ''}`}
                    onClick={() => toggleChip(draftGroup, group, setDraftGroup)}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          )}

          {allFlows.length > 0 && (
            <div className="catalogue-filter-sheet__section">
              <span className="catalogue-filter-sheet__section-label">Flow</span>
              <div className="catalogue-filter-sheet__chips">
                {allFlows.map((flow) => (
                  <button
                    key={flow}
                    type="button"
                    className={`catalogue-filter-chip ${draftFlow === flow ? 'is-active' : ''}`}
                    onClick={() => toggleChip(draftFlow, flow, setDraftFlow)}
                  >
                    {flow}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="catalogue-filter-sheet__section">
            <span className="catalogue-filter-sheet__section-label">Platform</span>
            <div className="catalogue-filter-sheet__chips">
              <button
                type="button"
                className={`catalogue-filter-chip ${draftPlatform === null ? 'is-active' : ''}`}
                onClick={() => setDraftPlatform(null)}
              >
                All
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftPlatform === 'web' ? 'is-active' : ''}`}
                onClick={() => setDraftPlatform(draftPlatform === 'web' ? null : 'web')}
              >
                Web
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftPlatform === 'mobile' ? 'is-active' : ''}`}
                onClick={() => setDraftPlatform(draftPlatform === 'mobile' ? null : 'mobile')}
              >
                Mobile
              </button>
            </div>
          </div>

          <div className="catalogue-filter-sheet__section">
            <span className="catalogue-filter-sheet__section-label">Theme</span>
            <div className="catalogue-filter-sheet__chips">
              <button
                type="button"
                className={`catalogue-filter-chip ${draftTheme === null ? 'is-active' : ''}`}
                onClick={() => setDraftTheme(null)}
              >
                All
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftTheme === 'light' ? 'is-active' : ''}`}
                onClick={() => setDraftTheme(draftTheme === 'light' ? null : 'light')}
              >
                Light
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftTheme === 'dark' ? 'is-active' : ''}`}
                onClick={() => setDraftTheme(draftTheme === 'dark' ? null : 'dark')}
              >
                Dark
              </button>
            </div>
          </div>

          {draftPlatform === 'web' && allWebPresets.length > 0 && (
            <div className="catalogue-filter-sheet__section">
              <span className="catalogue-filter-sheet__section-label">Web Preset</span>
              <div className="catalogue-filter-sheet__chips">
                {allWebPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`catalogue-filter-chip ${draftWebPreset === preset.id ? 'is-active' : ''}`}
                    onClick={() => toggleChip(draftWebPreset, preset.id, setDraftWebPreset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draftPlatform === 'mobile' && (
            <div className="catalogue-filter-sheet__section">
              <span className="catalogue-filter-sheet__section-label">Mobile OS</span>
              <div className="catalogue-filter-sheet__chips">
                {allMobileOs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`catalogue-filter-chip ${draftMobileOs === item.id ? 'is-active' : ''}`}
                    onClick={() => toggleChip(draftMobileOs, item.id, setDraftMobileOs)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="catalogue-filter-sheet__section">
            <span className="catalogue-filter-sheet__section-label">View</span>
            <div className="catalogue-filter-sheet__chips">
              <button
                type="button"
                className={`catalogue-filter-chip ${draftViewBy === 'all' ? 'is-active' : ''}`}
                onClick={() => setDraftViewBy('all')}
              >
                All screen families
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftViewBy === 'comments-added' ? 'is-active' : ''}`}
                onClick={() => setDraftViewBy('comments-added')}
              >
                Comments added
              </button>
              <button
                type="button"
                className={`catalogue-filter-chip ${draftViewBy === 'annotations-added' ? 'is-active' : ''}`}
                onClick={() => setDraftViewBy('annotations-added')}
              >
                Annotations added
              </button>
            </div>
          </div>
        </div>

        <div className="catalogue-filter-sheet__footer">
          <button type="button" className="btn-primary catalogue-filter-sheet__apply" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
