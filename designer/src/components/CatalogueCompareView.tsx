import { useMemo } from 'react';

import { compareFlowSnapshots, type FlowCompareSnapshot } from '../lib/compare-flows';
import { getActiveFamilyVariant, type CatalogueFamilyView } from '../lib/catalogue-families';
import type { Connection, Flow, ScreenshotNode } from '../types';

interface CatalogueCompareViewProps {
  activeVariantKeys: Record<string, string>;
  families: CatalogueFamilyView[];
  flowLabel: string | null;
  primaryGroup: string | null;
  vsGroups: string[];
  onOpenPreview: (familyId: string) => void;
}

interface FlowStep {
  family: CatalogueFamilyView;
  screenshot: ScreenshotNode;
  sequence: number | null;
}

interface GroupInsights {
  extra: string[];
  missing: string[];
  similarityScore: number;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'group';
}

function sortSteps(left: FlowStep, right: FlowStep): number {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;

  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  return left.screenshot.name.localeCompare(right.screenshot.name);
}

function buildSnapshot(groupName: string, flowLabel: string, steps: FlowStep[]): FlowCompareSnapshot {
  const screenshots = steps.map((step) => step.screenshot);
  const projectId = screenshots[0]?.project_id ?? 'catalogue';
  const flowId = `catalogue-${toSlug(flowLabel)}-${toSlug(groupName)}`;

  const flow: Flow = {
    id: flowId,
    project_id: projectId,
    name: `${groupName} ${flowLabel}`,
    platform: null,
    created_at: '',
    updated_at: '',
  };

  const connections: Connection[] = steps.slice(0, -1).map((step, index) => ({
    id: `${flowId}-edge-${index}`,
    project_id: projectId,
    flow_id: flowId,
    source_id: step.screenshot.id,
    target_id: steps[index + 1].screenshot.id,
    type: 'auto',
    label: null,
    arrow_direction: 'forward',
    source_handle: null,
    target_handle: null,
  }));

  return { flow, screenshots, connections };
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(value);
  }

  return ordered;
}

function buildGroupOrder(
  groupsWithFlow: string[],
  primaryGroup: string | null,
  vsGroups: string[],
): string[] {
  const configured = [primaryGroup, ...vsGroups].filter((group): group is string => Boolean(group));
  const discovered = [...groupsWithFlow].sort((left, right) => left.localeCompare(right));
  const allGroups = uniqueValues([...configured, ...discovered]);

  if (!primaryGroup) return allGroups;

  const remaining = allGroups.filter((group) => group !== primaryGroup);
  const orderedVs = vsGroups.filter((group) => remaining.includes(group));
  const orderedOther = remaining.filter((group) => !orderedVs.includes(group));

  return [primaryGroup, ...orderedVs, ...orderedOther];
}

export function CatalogueCompareView({
  activeVariantKeys,
  families,
  flowLabel,
  primaryGroup,
  vsGroups,
  onOpenPreview,
}: CatalogueCompareViewProps) {
  const stepsByGroup = useMemo(() => {
    if (!flowLabel) return new Map<string, FlowStep[]>();

    const grouped = new Map<string, FlowStep[]>();

    for (const family of families) {
      if ((family.flow_label || '').trim().toLowerCase() !== flowLabel.trim().toLowerCase()) {
        continue;
      }

      const activeVariant = getActiveFamilyVariant(family, activeVariantKeys[family.id] ?? null);
      if (!activeVariant) continue;

      const groupName = family.group || 'Ungrouped';
      const nextStep: FlowStep = {
        family,
        screenshot: activeVariant.screenshot,
        sequence: activeVariant.screenshot.sequence,
      };

      const existing = grouped.get(groupName) || [];
      existing.push(nextStep);
      grouped.set(groupName, existing);
    }

    for (const [groupName, steps] of grouped.entries()) {
      grouped.set(groupName, [...steps].sort(sortSteps));
    }

    return grouped;
  }, [activeVariantKeys, families, flowLabel]);

  const orderedGroups = useMemo(
    () => buildGroupOrder([...stepsByGroup.keys()], primaryGroup, vsGroups),
    [primaryGroup, stepsByGroup, vsGroups],
  );

  const baselineGroup = useMemo(() => {
    if (primaryGroup && orderedGroups.includes(primaryGroup)) {
      return primaryGroup;
    }

    return orderedGroups[0] ?? null;
  }, [orderedGroups, primaryGroup]);

  const baselineSteps = baselineGroup ? stepsByGroup.get(baselineGroup) || [] : [];

  const insightsByGroup = useMemo(() => {
    const insights = new Map<string, GroupInsights>();

    if (!flowLabel || !baselineGroup) {
      return insights;
    }

    const baselineSnapshot = buildSnapshot(baselineGroup, flowLabel, baselineSteps);

    for (const groupName of orderedGroups) {
      if (groupName === baselineGroup) continue;

      const groupSteps = stepsByGroup.get(groupName) || [];
      const groupSnapshot = buildSnapshot(groupName, flowLabel, groupSteps);
      const comparison = compareFlowSnapshots(baselineSnapshot, groupSnapshot);

      insights.set(groupName, {
        missing: uniqueValues(comparison.onlyStepsA.map((step) => step.label)),
        extra: uniqueValues(comparison.onlyStepsB.map((step) => step.label)),
        similarityScore: comparison.similarityScore,
      });
    }

    return insights;
  }, [baselineGroup, baselineSteps, flowLabel, orderedGroups, stepsByGroup]);

  if (!flowLabel) {
    return (
      <div className="empty-state">
        <h2>Select a flow to compare</h2>
        <p>Enable compare mode and choose a flow from the toolbar.</p>
      </div>
    );
  }

  if (orderedGroups.length === 0) {
    return (
      <div className="empty-state">
        <h2>No screenshots for {flowLabel}</h2>
        <p>Assign this flow label to screenshots before comparing groups.</p>
      </div>
    );
  }

  return (
    <div className="catalogue-compare-view">
      {orderedGroups.map((groupName) => {
        const steps = stepsByGroup.get(groupName) || [];
        const isBaseline = baselineGroup === groupName;
        const insights = insightsByGroup.get(groupName) ?? null;
        const stepDiff = steps.length - baselineSteps.length;

        return (
          <section
            key={groupName}
            className={`catalogue-flow-strip ${isBaseline ? 'catalogue-flow-strip--primary' : ''}`}
          >
            <header className="catalogue-flow-strip__head">
              <div className="catalogue-flow-strip__title-row">
                <h3>{groupName}</h3>
                {groupName === primaryGroup && <span className="catalogue-badge catalogue-badge-primary">Primary</span>}
                {groupName !== primaryGroup && groupName !== baselineGroup && vsGroups.includes(groupName) && (
                  <span className="catalogue-badge catalogue-badge-vs">Vs</span>
                )}
                {groupName !== primaryGroup && groupName === baselineGroup && (
                  <span className="catalogue-badge">Reference</span>
                )}
              </div>

              <div className="catalogue-flow-strip__meta-row">
                <p>
                  {steps.length} step{steps.length === 1 ? '' : 's'}
                  {!isBaseline && stepDiff !== 0 && ` · ${stepDiff > 0 ? '+' : ''}${stepDiff} vs ${baselineGroup}`}
                </p>
                {!isBaseline && insights && (
                  <span className="catalogue-flow-strip__score">{insights.similarityScore}% match</span>
                )}
              </div>
            </header>

            <div className="catalogue-flow-strip__steps">
              {steps.length === 0 ? (
                <p className="catalogue-flow-strip__empty">No screens mapped to this flow in this group.</p>
              ) : (
                steps.map((step, index) => (
                  <div key={step.screenshot.id} className="catalogue-flow-step">
                    {index > 0 && <span className="catalogue-flow-step__arrow">→</span>}
                    <button
                      type="button"
                      className="catalogue-flow-step__card"
                      onClick={() => onOpenPreview(step.family.id)}
                    >
                      <div className="catalogue-flow-step__preview">
                        {step.screenshot.image_url ? (
                          <img src={step.screenshot.image_url} alt={step.screenshot.name} />
                        ) : (
                          <div className="catalogue-flow-step__placeholder">No preview</div>
                        )}
                        {step.sequence !== null && (
                          <span className="catalogue-flow-step__sequence">{step.sequence}</span>
                        )}
                      </div>
                      <span className="catalogue-flow-step__name">{step.screenshot.name}</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {!isBaseline && insights && (insights.missing.length > 0 || insights.extra.length > 0) && (
              <div className="catalogue-flow-strip__insights">
                {insights.missing.map((label) => (
                  <span key={`${groupName}-missing-${label}`} className="catalogue-flow-insight catalogue-flow-insight--missing">
                    {'⚠ Missing: '}
                    {label}
                  </span>
                ))}
                {insights.extra.map((label) => (
                  <span key={`${groupName}-extra-${label}`} className="catalogue-flow-insight catalogue-flow-insight--extra">
                    {'★ Extra: '}
                    {label}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
