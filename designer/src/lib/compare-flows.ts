import type { SupabaseClient } from '@supabase/supabase-js';
import type { Connection, Flow, ScreenshotNode } from '../types';
import { normalizeFlowStep } from './flow-step-normalizer';

export interface FlowCompareSnapshot {
  flow: Flow;
  screenshots: ScreenshotNode[];
  connections: Connection[];
}

export interface FlowCompareStep {
  key: string;
  label: string;
  order: number;
  screenshot: ScreenshotNode;
}

export interface FlowCompareTransition {
  key: string;
  sourceKey: string;
  targetKey: string;
  sourceLabel: string;
  targetLabel: string;
  sourceOrder: number;
  targetOrder: number;
  label: string | null;
  type: Connection['type'];
  arrowDirection: Connection['arrow_direction'];
}

export interface FlowComparisonResult {
  sharedSteps: FlowCompareStep[];
  onlyStepsA: FlowCompareStep[];
  onlyStepsB: FlowCompareStep[];
  sharedTransitions: FlowCompareTransition[];
  onlyTransitionsA: FlowCompareTransition[];
  onlyTransitionsB: FlowCompareTransition[];
  similarityScore: number;
}

interface FlowIndex {
  stepsByKey: Map<string, FlowCompareStep>;
  stepKeyById: Map<string, string>;
  transitionsByKey: Map<string, FlowCompareTransition>;
}

function sortScreenshots(screenshots: ScreenshotNode[]): ScreenshotNode[] {
  return [...screenshots].sort((left, right) => {
    const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;

    const leftCreated = left.created_at ? Date.parse(left.created_at) : Number.MAX_SAFE_INTEGER;
    const rightCreated = right.created_at ? Date.parse(right.created_at) : Number.MAX_SAFE_INTEGER;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;

    return left.name.localeCompare(right.name);
  });
}

function normalizeTransitionLabel(label: string | null): string {
  return label ? label.trim().toLowerCase() : '';
}

function buildFlowIndex(snapshot: FlowCompareSnapshot): FlowIndex {
  const stepsByKey = new Map<string, FlowCompareStep>();
  const stepKeyById = new Map<string, string>();

  sortScreenshots(snapshot.screenshots).forEach((screenshot, index) => {
    const { key, display } = normalizeFlowStep(screenshot.name);
    stepKeyById.set(screenshot.id, key);
    if (!stepsByKey.has(key)) {
      stepsByKey.set(key, {
        key,
        label: display,
        order: index,
        screenshot,
      });
    }
  });

  const transitionsByKey = new Map<string, FlowCompareTransition>();
  const seen = new Set<string>();

  for (const connection of snapshot.connections) {
    const sourceKey = stepKeyById.get(connection.source_id);
    const targetKey = stepKeyById.get(connection.target_id);
    const sourceStep = sourceKey ? stepsByKey.get(sourceKey) : undefined;
    const targetStep = targetKey ? stepsByKey.get(targetKey) : undefined;

    if (!sourceKey || !targetKey || !sourceStep || !targetStep) continue;

    const label = connection.label?.trim() || null;
    const key = [
      sourceKey,
      targetKey,
      connection.type,
      connection.arrow_direction,
      normalizeTransitionLabel(label),
    ].join('\u0000');

    if (seen.has(key)) continue;
    seen.add(key);

    transitionsByKey.set(key, {
      key,
      sourceKey: sourceKey!,
      targetKey: targetKey!,
      sourceLabel: sourceStep.label,
      targetLabel: targetStep.label,
      sourceOrder: sourceStep.order,
      targetOrder: targetStep.order,
      label,
      type: connection.type,
      arrowDirection: connection.arrow_direction,
    });
  }

  return { stepsByKey, stepKeyById, transitionsByKey };
}

function sortSteps(left: FlowCompareStep, right: FlowCompareStep): number {
  if (left.order !== right.order) return left.order - right.order;
  return left.label.localeCompare(right.label);
}

function sortTransitions(left: FlowCompareTransition, right: FlowCompareTransition): number {
  if (left.sourceOrder !== right.sourceOrder) return left.sourceOrder - right.sourceOrder;
  if (left.targetOrder !== right.targetOrder) return left.targetOrder - right.targetOrder;
  return (left.label ?? '').localeCompare(right.label ?? '');
}

function buildComparison(
  left: FlowIndex,
  right: FlowIndex,
): FlowComparisonResult {
  const sharedStepKeys = [...left.stepsByKey.keys()].filter((key) => right.stepsByKey.has(key));
  const onlyStepKeysA = [...left.stepsByKey.keys()].filter((key) => !right.stepsByKey.has(key));
  const onlyStepKeysB = [...right.stepsByKey.keys()].filter((key) => !left.stepsByKey.has(key));

  const sharedTransitionKeys = [...left.transitionsByKey.keys()].filter((key) => right.transitionsByKey.has(key));
  const onlyTransitionKeysA = [...left.transitionsByKey.keys()].filter((key) => !right.transitionsByKey.has(key));
  const onlyTransitionKeysB = [...right.transitionsByKey.keys()].filter((key) => !left.transitionsByKey.has(key));

  const stepUnionSize = new Set([...left.stepsByKey.keys(), ...right.stepsByKey.keys()]).size;
  const transitionUnionSize = new Set([...left.transitionsByKey.keys(), ...right.transitionsByKey.keys()]).size;

  const stepScore = stepUnionSize === 0 ? 1 : sharedStepKeys.length / stepUnionSize;
  const transitionScore = transitionUnionSize === 0 ? 1 : sharedTransitionKeys.length / transitionUnionSize;

  return {
    sharedSteps: sharedStepKeys.map((key) => left.stepsByKey.get(key)!).sort(sortSteps),
    onlyStepsA: onlyStepKeysA.map((key) => left.stepsByKey.get(key)!).sort(sortSteps),
    onlyStepsB: onlyStepKeysB.map((key) => right.stepsByKey.get(key)!).sort(sortSteps),
    sharedTransitions: sharedTransitionKeys.map((key) => left.transitionsByKey.get(key)!).sort(sortTransitions),
    onlyTransitionsA: onlyTransitionKeysA.map((key) => left.transitionsByKey.get(key)!).sort(sortTransitions),
    onlyTransitionsB: onlyTransitionKeysB.map((key) => right.transitionsByKey.get(key)!).sort(sortTransitions),
    similarityScore: Math.round((stepScore * 0.6 + transitionScore * 0.4) * 100),
  };
}

export function compareFlowSnapshots(left: FlowCompareSnapshot, right: FlowCompareSnapshot): FlowComparisonResult {
  return buildComparison(buildFlowIndex(left), buildFlowIndex(right));
}

async function loadFlowSnapshot(client: SupabaseClient, flow: Flow): Promise<FlowCompareSnapshot> {
  const [screenshotsRes, connectionsRes] = await Promise.all([
    client.from('screenshots').select('*').eq('flow_id', flow.id),
    client.from('connections').select('*').eq('flow_id', flow.id),
  ]);

  const screenshots = (screenshotsRes.data ?? []).map((screenshot) => ({
    ...screenshot,
    image_url: screenshot.storage_path
      ? client.storage.from('screenshots').getPublicUrl(screenshot.storage_path).data.publicUrl
      : screenshot.image_url,
  })) as ScreenshotNode[];

  return {
    flow,
    screenshots,
    connections: (connectionsRes.data ?? []) as Connection[],
  };
}

export async function loadFlowComparison(client: SupabaseClient, left: Flow, right: Flow) {
  const [snapshotA, snapshotB] = await Promise.all([
    loadFlowSnapshot(client, left),
    loadFlowSnapshot(client, right),
  ]);

  return {
    snapshotA,
    snapshotB,
    comparison: compareFlowSnapshots(snapshotA, snapshotB),
  };
}
