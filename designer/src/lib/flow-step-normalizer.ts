export interface NormalizedFlowStep {
  display: string;
  key: string;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeFlowStep(step: string): NormalizedFlowStep {
  const display = collapseWhitespace(step);
  return {
    display,
    key: display.toLowerCase(),
  };
}
