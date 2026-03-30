import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME } from '../constants';
import type { Journey } from '../types';

interface JourneyManagerProps {
  journeys: Journey[];
  activeJourneyId: string | null;
  onSelectJourney: (journeyId: string) => void;
  onCreateJourney: () => void;
  onRenameJourney: (journeyId: string, name: string) => void;
  savedAt?: string | null;
}

export function JourneyManager({
  journeys,
  activeJourneyId,
  onSelectJourney,
  onCreateJourney,
  onRenameJourney,
  savedAt,
}: JourneyManagerProps) {
  const activeJourney = useMemo(
    () => journeys.find((journey) => journey.id === activeJourneyId) ?? journeys[0] ?? null,
    [journeys, activeJourneyId],
  );
  const [draftName, setDraftName] = useState(activeJourney?.name ?? '');

  useEffect(() => {
    setDraftName(activeJourney?.name ?? '');
  }, [activeJourney?.id, activeJourney?.name]);

  return (
    <section style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'grid', gap: '4px' }}>
          <p style={eyebrowStyle}>Journeys</p>
          <h3 style={titleStyle}>Manage draft flows</h3>
        </div>
        <button type="button" onClick={onCreateJourney} style={actionButtonStyle}>
          New journey
        </button>
      </div>

      {journeys.length === 0 ? (
        <p style={bodyStyle}>
          No journey draft yet. Create one so devs can shape the intended flow before copying it
          back to AI.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)' }}>
            <label style={labelStyle}>
              Journey
              <select
                value={activeJourney?.id ?? ''}
                onChange={(event) => onSelectJourney(event.target.value)}
                style={selectStyle}
              >
                {journeys.map((journey) => (
                  <option key={journey.id} value={journey.id}>
                    {journey.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Name
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => activeJourney && onRenameJourney(activeJourney.id, draftName)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && activeJourney) {
                    onRenameJourney(activeJourney.id, draftName);
                  }
                }}
                placeholder="Name this journey"
                style={inputStyle}
              />
            </label>
          </div>

          {activeJourney && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <SummaryChip label={`${activeJourney.startRouteIds.length} starts`} />
              <SummaryChip label={`${activeJourney.endRouteIds.length} ends`} />
              <SummaryChip
                label={`${activeJourney.edgeChanges.filter((edge) => edge.change === 'add').length} added`}
              />
              <SummaryChip
                label={`${activeJourney.edgeChanges.filter((edge) => edge.change === 'remove').length} removed`}
              />
              <SummaryChip label={savedAt ? `Saved ${formatSavedAt(savedAt)}` : 'Not saved yet'} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryChip({ label }: { label: string }) {
  return <span style={summaryChipStyle}>{label}</span>;
}

function formatSavedAt(savedAt: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(savedAt));
  } catch {
    return 'recently';
  }
}

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  padding: '14px',
  borderRadius: '14px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#111113',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
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

const bodyStyle: React.CSSProperties = {
  margin: 0,
  color: '#a1a1aa',
  fontSize: '13px',
  lineHeight: 1.6,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px',
  color: '#71717a',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const selectStyle: React.CSSProperties = {
  minHeight: '38px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: DEFAULT_THEME.textColor,
  fontSize: '12px',
};

const inputStyle: React.CSSProperties = {
  minHeight: '38px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: DEFAULT_THEME.textColor,
  fontSize: '12px',
};

const actionButtonStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: DEFAULT_THEME.textColor,
  fontSize: '12px',
  fontWeight: 600,
};

const summaryChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '30px',
  padding: '0 10px',
  borderRadius: '999px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#09090b',
  color: '#d4d4d8',
  fontSize: '12px',
};
