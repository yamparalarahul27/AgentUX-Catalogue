import { normalizeFlowStep } from './flow-step-normalizer';

export interface ParsedFlowGraph {
  nodeNames: string[];
  edges: [string, string][];
}

export function parseMultiPathFlow(text: string): ParsedFlowGraph {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // canonical normalized key -> first-seen display casing
  const nameMap = new Map<string, string>();
  const edgeSet = new Set<string>();
  const edges: [string, string][] = [];

  for (const line of lines) {
    const steps = line.split('->').map((s) => s.trim()).filter(Boolean);
    const normalizedSteps = steps.map(normalizeFlowStep);

    for (const { display, key } of normalizedSteps) {
      if (!nameMap.has(key)) {
        nameMap.set(key, display);
      }
    }

    for (let i = 0; i < normalizedSteps.length - 1; i++) {
      const srcKey = normalizedSteps[i].key;
      const tgtKey = normalizedSteps[i + 1].key;
      const edgeKey = `${srcKey}\0${tgtKey}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push([nameMap.get(srcKey)!, nameMap.get(tgtKey)!]);
      }
    }
  }

  return { nodeNames: Array.from(nameMap.values()), edges };
}
