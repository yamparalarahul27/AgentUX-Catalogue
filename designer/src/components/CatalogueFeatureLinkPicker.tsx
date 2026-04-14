import type { FeatureLogLinkType } from '../types';
import type { FeatureLogScreenshotCandidate } from '../hooks/use-feature-log-data';
import { Dropdown } from './Dropdown';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';

interface CatalogueFeatureLinkPickerProps {
  candidates: FeatureLogScreenshotCandidate[];
  error: string | null;
  flowQuery: string;
  groupQuery: string;
  isOpen: boolean;
  linkType: FeatureLogLinkType;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onFlowQueryChange: (value: string) => void;
  onGroupQueryChange: (value: string) => void;
  onLinkTypeChange: (value: FeatureLogLinkType) => void;
  onPlatformChange: (value: 'all' | 'mobile' | 'web') => void;
  onReload: () => void;
  onSearchQueryChange: (value: string) => void;
  onThemeChange: (value: 'all' | 'light' | 'dark') => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  platform: 'all' | 'mobile' | 'web';
  saving: boolean;
  searchQuery: string;
  selectedIds: Set<string>;
  theme: 'all' | 'light' | 'dark';
}

function formatCreatedAt(value: string | null): string {
  if (!value) {
    return 'Unknown date';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown date';
  }

  return new Date(parsed).toLocaleDateString();
}

export function CatalogueFeatureLinkPicker({
  candidates,
  error,
  flowQuery,
  groupQuery,
  isOpen,
  linkType,
  loading,
  onClose,
  onConfirm,
  onFlowQueryChange,
  onGroupQueryChange,
  onLinkTypeChange,
  onPlatformChange,
  onReload,
  onSearchQueryChange,
  onThemeChange,
  onToggleSelect,
  onToggleSelectAll,
  platform,
  saving,
  searchQuery,
  selectedIds,
  theme,
}: CatalogueFeatureLinkPickerProps) {
  if (!isOpen) {
    return null;
  }

  const selectableCount = candidates.filter((candidate) => !candidate.alreadyLinked).length;
  const selectedCount = selectedIds.size;

  return (
    <div className="catalogue-feature-log-picker-overlay" onClick={onClose}>
      <div className="catalogue-feature-log-picker" onClick={(event) => event.stopPropagation()}>
        <header className="catalogue-feature-log-picker__head">
          <div>
            <h3>Link Existing Screenshot</h3>
            <p>Global screenshot scope. Filter and select screenshots to link.</p>
          </div>
          <button type="button" className="catalogue-feature-log-editor__close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="catalogue-feature-log-picker__filters">
          <div className="catalogue-feature-log__search catalogue-feature-log-picker__search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search name, file, or group"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
          </div>

          <input
            type="text"
            className="catalogue-feature-log-picker__input"
            placeholder="Group contains…"
            value={groupQuery}
            onChange={(event) => onGroupQueryChange(event.target.value)}
          />

          <input
            type="text"
            className="catalogue-feature-log-picker__input"
            placeholder="Flow contains…"
            value={flowQuery}
            onChange={(event) => onFlowQueryChange(event.target.value)}
          />

          <Dropdown
            className="catalogue-feature-log-picker__dropdown"
            value={platform === 'all' ? null : platform}
            placeholder="All platforms"
            options={[
              { value: 'web', label: 'Web' },
              { value: 'mobile', label: 'Mobile' },
            ]}
            onChange={(value) => onPlatformChange((value ?? 'all') as 'all' | 'mobile' | 'web')}
          />

          <Dropdown
            className="catalogue-feature-log-picker__dropdown"
            value={theme === 'all' ? null : theme}
            placeholder="All themes"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(value) => onThemeChange((value ?? 'all') as 'all' | 'light' | 'dark')}
          />

          <Dropdown
            className="catalogue-feature-log-picker__dropdown"
            value={linkType}
            placeholder="Link as"
            options={[
              { value: 'design', label: 'Design' },
              { value: 'shipped', label: 'Shipped' },
            ]}
            onChange={(value) => onLinkTypeChange((value ?? 'design') as FeatureLogLinkType)}
          />
        </div>

        <div className="catalogue-feature-log-picker__toolbar">
          <button
            type="button"
            className="btn-secondary"
            onClick={onToggleSelectAll}
            disabled={loading || selectableCount === 0}
          >
            {selectedCount > 0 && selectedCount === selectableCount ? 'Deselect all visible' : 'Select all visible'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onReload}
            disabled={loading || saving}
          >
            Refresh
          </button>
          <span>{selectedCount} selected</span>
        </div>

        {error && (
          <div className="catalogue-feature-log__error">
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="catalogue-feature-log__loading">
            <div className="loading-spinner" />
            <span>Loading global screenshots…</span>
          </div>
        ) : candidates.length === 0 ? (
          <div className="catalogue-feature-log-picker__empty">No screenshots match these filters.</div>
        ) : (
          <div className="catalogue-feature-log-picker__grid">
            {candidates.map((candidate) => {
              const isSelected = selectedIds.has(candidate.id);
              const disabled = candidate.alreadyLinked;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={`catalogue-feature-log-picker__card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => !disabled && onToggleSelect(candidate.id)}
                  disabled={disabled}
                  title={disabled ? 'Already linked to this feature' : candidate.name}
                >
                  <div className="catalogue-feature-log-picker__image">
                    {candidate.image_url ? (
                      <img src={candidate.image_url} alt={candidate.name} loading="lazy" />
                    ) : (
                      <div className="catalogue-feature-log-picker__image-empty">No preview</div>
                    )}
                    <span className={`catalogue-feature-log-picker__check ${isSelected ? 'is-selected' : ''}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </div>

                  <div className="catalogue-feature-log-picker__card-copy">
                    <strong title={candidate.name}>{candidate.name}</strong>
                    <div className="catalogue-feature-log-picker__meta">
                      {candidate.group && (
                        <span>
                          <CatalogueGroupLabel group={candidate.group} projectId={candidate.project_id} />
                        </span>
                      )}
                      {candidate.flow_label && <span>{candidate.flow_label}</span>}
                      {candidate.platform && <span>{candidate.platform === 'web' ? 'Web' : 'Mobile'}</span>}
                      {candidate.theme && <span>{candidate.theme === 'light' ? 'Light' : 'Dark'}</span>}
                      <span>{formatCreatedAt(candidate.created_at)}</span>
                    </div>
                    {candidate.alreadyLinked && (
                      <span className="catalogue-feature-log-picker__linked">Already linked</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <footer className="catalogue-feature-log-picker__footer">
          <span>Showing latest {candidates.length} screenshots from full DB scope.</span>
          <div className="catalogue-feature-log-picker__footer-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onConfirm}
              disabled={saving || selectedCount === 0}
            >
              {saving ? 'Linking…' : `Link ${selectedCount} screenshot${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
