import type { Project, ScreenshotNode, Connection } from '../types';
import { parseScreenshotName } from './naming';

/**
 * Generate AI-optimized Markdown from a designer flow project.
 */
export function generateDesignerMarkdown(
  project: Project,
  screenshots: ScreenshotNode[],
  connections: Connection[],
): string {
  const lines: string[] = [];

  lines.push(`# UX Flow: ${project.name}`);
  lines.push('');

  // Screens section
  lines.push('## Screens');
  lines.push('');

  const screenshotMap = new Map(screenshots.map((s) => [s.id, s]));

  // Sort by sequence, then alphabetically
  const sorted = [...screenshots].sort((a, b) => {
    if (a.sequence !== null && b.sequence !== null) return a.sequence - b.sequence;
    if (a.sequence !== null) return -1;
    if (b.sequence !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const parsed = parseScreenshotName(s.file_name);

    lines.push(`### ${i + 1}. ${s.name}`);
    if (parsed.group) {
      lines.push(`- **Group**: ${parsed.group}`);
    }
    lines.push(`- **Screenshot**: ${s.file_name}`);
    lines.push('');
  }

  // Navigation Flows section
  lines.push('## Navigation Flows');
  lines.push('');

  for (const conn of connections) {
    const source = screenshotMap.get(conn.source_id);
    const target = screenshotMap.get(conn.target_id);
    if (source && target) {
      lines.push(`- ${source.name} → ${target.name} (${conn.type})`);
    }
  }
  lines.push('');

  // Summary section
  const groups = new Map<string, number>();
  for (const s of screenshots) {
    const parsed = parseScreenshotName(s.file_name);
    if (parsed.group) {
      groups.set(parsed.group, (groups.get(parsed.group) || 0) + 1);
    }
  }

  lines.push('## Flow Summary');
  lines.push(`- **Total screens**: ${screenshots.length}`);
  lines.push(`- **Total connections**: ${connections.length}`);
  if (groups.size > 0) {
    const groupStr = [...groups.entries()]
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');
    lines.push(`- **Groups**: ${groupStr}`);
  }
  lines.push(`- **Generated**: ${new Date().toISOString()}`);
  lines.push('');

  return lines.join('\n');
}
