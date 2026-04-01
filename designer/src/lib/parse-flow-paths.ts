export interface ParsedFlowGraph {
  nodeNames: string[];
  edges: [string, string][];
}

export function parseMultiPathFlow(text: string): ParsedFlowGraph {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // canonical lowercase -> first-seen casing
  const nameMap = new Map<string, string>();
  const edgeSet = new Set<string>();
  const edges: [string, string][] = [];

  for (const line of lines) {
    const steps = line.split('->').map((s) => s.trim()).filter(Boolean);

    for (const step of steps) {
      const key = step.toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, step);
      }
    }

    for (let i = 0; i < steps.length - 1; i++) {
      const srcKey = steps[i].toLowerCase();
      const tgtKey = steps[i + 1].toLowerCase();
      const edgeKey = `${srcKey}\0${tgtKey}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push([nameMap.get(srcKey)!, nameMap.get(tgtKey)!]);
      }
    }
  }

  return { nodeNames: Array.from(nameMap.values()), edges };
}
