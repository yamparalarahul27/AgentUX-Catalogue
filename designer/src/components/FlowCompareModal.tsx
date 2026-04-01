import { useEffect, useState } from 'react';
import type { Flow } from '../types';
import { supabase } from '../lib/supabase';
import {
  loadFlowComparison,
  type FlowCompareSnapshot,
  type FlowCompareStep,
  type FlowCompareTransition,
  type FlowComparisonResult,
} from '../lib/compare-flows';

type LoadedComparison = {
  snapshotA: FlowCompareSnapshot;
  snapshotB: FlowCompareSnapshot;
  comparison: FlowComparisonResult;
};

interface FlowCompareModalProps {
  flowA: Flow;
  flowB: Flow;
  onClose: () => void;
}

function transitionArrow(transition: FlowCompareTransition): string {
  if (transition.arrowDirection === 'both') return '<->';
  if (transition.arrowDirection === 'backward') return '<-';
  return '->';
}

function StepTile({ step }: { step: FlowCompareStep }) {
  return (
    <article className="flow-compare-step">
      <div className="flow-compare-step-thumb">
        {step.screenshot.image_url ? (
          <img src={step.screenshot.image_url} alt={step.label} />
        ) : (
          <div className="flow-compare-step-thumb-placeholder">No preview</div>
        )}
      </div>
      <div className="flow-compare-step-meta">
        <div className="flow-compare-step-label">{step.label}</div>
        <div className="flow-compare-step-subtitle">
          {step.screenshot.sequence != null ? `Step ${step.screenshot.sequence}` : 'Unsequenced'}
        </div>
      </div>
    </article>
  );
}

function TransitionTile({ transition }: { transition: FlowCompareTransition }) {
  return (
    <li className="flow-compare-transition">
      <span className="flow-compare-transition-path">
        {transition.sourceLabel} <span className="flow-compare-transition-arrow">{transitionArrow(transition)}</span> {transition.targetLabel}
      </span>
      <div className="flow-compare-transition-meta">
        {transition.label && <span className="flow-compare-pill">{transition.label}</span>}
        <span className="flow-compare-pill flow-compare-pill-muted">{transition.type}</span>
      </div>
    </li>
  );
}

function ComparisonPanel({
  title,
  emptyText,
  items,
  kind,
}: {
  title: string;
  emptyText: string;
  items: FlowCompareStep[] | FlowCompareTransition[];
  kind: 'step' | 'transition';
}) {
  return (
    <section className="flow-compare-section">
      <div className="flow-compare-section-header">
        <h4>{title}</h4>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="flow-compare-empty">{emptyText}</p>
      ) : kind === 'step' ? (
        <div className="flow-compare-step-grid">
          {(items as FlowCompareStep[]).map((step) => <StepTile key={step.key} step={step} />)}
        </div>
      ) : (
        <ul className="flow-compare-transition-list">
          {(items as FlowCompareTransition[]).map((transition) => (
            <TransitionTile key={transition.key} transition={transition} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function FlowCompareModal({ flowA, flowB, onClose }: FlowCompareModalProps) {
  const [loaded, setLoaded] = useState<LoadedComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runComparison() {
      setLoading(true);
      setError(null);

      const { snapshotA, snapshotB, comparison } = await loadFlowComparison(supabase, flowA, flowB);
      if (cancelled) return;
      setLoaded({ snapshotA, snapshotB, comparison });
      setLoading(false);
    }

    runComparison().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : 'Unable to compare flows.';
      setError(message);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [flowA, flowB]);

  const comparison = loaded?.comparison ?? null;

  return (
    <div className="flow-compare-overlay" onClick={onClose}>
      <div className="flow-compare-modal" onClick={(event) => event.stopPropagation()}>
        <header className="flow-compare-header">
          <div>
            <p className="flow-compare-kicker">Flow comparison</p>
            <h3>{flowA.name} vs {flowB.name}</h3>
            <p className="flow-compare-subtitle">Built from screenshot steps and saved connections.</p>
          </div>
          <button className="flow-compare-close" onClick={onClose} aria-label="Close comparison">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {loading ? (
          <div className="flow-compare-loading">
            <div className="loading-spinner" />
            <span>Loading flow comparison...</span>
          </div>
        ) : error ? (
          <div className="flow-compare-error">
            <p>{error}</p>
          </div>
        ) : comparison && loaded ? (
          <>
            <section className="flow-compare-summary">
              <div className="flow-compare-score">
                <span>Similarity</span>
                <strong>{comparison.similarityScore}%</strong>
              </div>
              <div className="flow-compare-summary-grid">
                <div><span>Shared steps</span><strong>{comparison.sharedSteps.length}</strong></div>
                <div><span>Shared transitions</span><strong>{comparison.sharedTransitions.length}</strong></div>
                <div><span>Only in {loaded.snapshotA.flow.name}</span><strong>{comparison.onlyStepsA.length + comparison.onlyTransitionsA.length}</strong></div>
                <div><span>Only in {loaded.snapshotB.flow.name}</span><strong>{comparison.onlyStepsB.length + comparison.onlyTransitionsB.length}</strong></div>
              </div>
            </section>

            <div className="flow-compare-content">
              <ComparisonPanel
                title="Shared steps"
                emptyText="No shared steps found."
                items={comparison.sharedSteps}
                kind="step"
              />

              <div className="flow-compare-dual">
                <ComparisonPanel
                  title={`Only in ${loaded.snapshotA.flow.name}`}
                  emptyText="No unique steps."
                  items={comparison.onlyStepsA}
                  kind="step"
                />
                <ComparisonPanel
                  title={`Only in ${loaded.snapshotB.flow.name}`}
                  emptyText="No unique steps."
                  items={comparison.onlyStepsB}
                  kind="step"
                />
              </div>

              <ComparisonPanel
                title="Shared transitions"
                emptyText="No shared transitions found."
                items={comparison.sharedTransitions}
                kind="transition"
              />

              <div className="flow-compare-dual">
                <ComparisonPanel
                  title={`Transitions only in ${loaded.snapshotA.flow.name}`}
                  emptyText="No unique transitions."
                  items={comparison.onlyTransitionsA}
                  kind="transition"
                />
                <ComparisonPanel
                  title={`Transitions only in ${loaded.snapshotB.flow.name}`}
                  emptyText="No unique transitions."
                  items={comparison.onlyTransitionsB}
                  kind="transition"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
