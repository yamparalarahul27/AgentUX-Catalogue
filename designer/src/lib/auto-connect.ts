import type { ScreenshotNode, Connection } from '../types';
import { parseScreenshotName } from './naming';

/**
 * Auto-connect screenshots based on their naming convention.
 *
 * Algorithm (priority order):
 * 1. Sequential: numeric prefixes → connect in order (01 → 02 → 03)
 * 2. Group-based: same group → connect within group sequentially
 * 3. Group transitions: last of group N → first of group N+1
 * 4. Hierarchical: "dashboard-portfolio-details" is child of "dashboard-portfolio"
 *
 * Fallback: alphabetical order if no numbering.
 */
export function autoConnect(
  screenshots: ScreenshotNode[],
  projectId: string,
): Connection[] {
  if (screenshots.length < 2) return [];

  const parsed = screenshots.map((s) => ({
    screenshot: s,
    ...parseScreenshotName(s.file_name),
  }));

  const hasSequences = parsed.some((p) => p.sequence !== null);
  const hasGroups = parsed.some((p) => p.group !== null);

  // Sort by sequence if available, otherwise alphabetically by filename
  const sorted = [...parsed].sort((a, b) => {
    if (hasSequences && a.sequence !== null && b.sequence !== null) {
      return a.sequence - b.sequence;
    }
    return a.screenshot.file_name.localeCompare(b.screenshot.file_name);
  });

  const connections: Connection[] = [];
  const connectionSet = new Set<string>();

  function addConnection(sourceId: string, targetId: string) {
    const key = `${sourceId}→${targetId}`;
    if (connectionSet.has(key) || sourceId === targetId) return;
    connectionSet.add(key);
    connections.push({
      id: `auto-${sourceId}-${targetId}`,
      project_id: projectId,
      source_id: sourceId,
      target_id: targetId,
      type: 'auto',
      label: null,
    });
  }

  if (hasGroups) {
    // Group-based connection
    const groups = new Map<string, typeof sorted>();
    const ungrouped: typeof sorted = [];

    for (const item of sorted) {
      if (item.group) {
        const g = groups.get(item.group) || [];
        g.push(item);
        groups.set(item.group, g);
      } else {
        ungrouped.push(item);
      }
    }

    // Connect within each group sequentially
    const groupOrder: string[] = [];
    for (const [groupName, groupItems] of groups) {
      groupOrder.push(groupName);
      for (let i = 0; i < groupItems.length - 1; i++) {
        addConnection(groupItems[i].screenshot.id, groupItems[i + 1].screenshot.id);
      }

      // Hierarchical: connect parent → child within group
      for (let i = 0; i < groupItems.length; i++) {
        for (let j = i + 1; j < groupItems.length; j++) {
          if (
            groupItems[j].depth > groupItems[i].depth &&
            groupItems[j].name.toLowerCase().startsWith(groupItems[i].name.toLowerCase())
          ) {
            addConnection(groupItems[i].screenshot.id, groupItems[j].screenshot.id);
          }
        }
      }
    }

    // Connect group transitions: last of group N → first of group N+1
    const orderedGroups = groupOrder.map((name) => groups.get(name)!);
    for (let i = 0; i < orderedGroups.length - 1; i++) {
      const lastOfCurrent = orderedGroups[i][orderedGroups[i].length - 1];
      const firstOfNext = orderedGroups[i + 1][0];
      addConnection(lastOfCurrent.screenshot.id, firstOfNext.screenshot.id);
    }

    // Connect ungrouped sequentially
    for (let i = 0; i < ungrouped.length - 1; i++) {
      addConnection(ungrouped[i].screenshot.id, ungrouped[i + 1].screenshot.id);
    }
  } else {
    // Simple sequential connection
    for (let i = 0; i < sorted.length - 1; i++) {
      addConnection(sorted[i].screenshot.id, sorted[i + 1].screenshot.id);
    }
  }

  return connections;
}
