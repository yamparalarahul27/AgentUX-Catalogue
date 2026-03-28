import type { ParsedScreenshotName } from '../types';

/**
 * Parse a screenshot filename into structured metadata.
 *
 * Supported naming conventions:
 *   01-auth-login.png      → sequence=1, group="auth", name="Login"
 *   auth-login.png         → sequence=null, group="auth", name="Login"
 *   dashboard-home.png     → sequence=null, group="dashboard", name="Home"
 *   login.png              → sequence=null, group=null, name="Login"
 *   03-dashboard-portfolio-details.png → sequence=3, group="dashboard", name="Portfolio Details", depth=2
 */
export function parseScreenshotName(fileName: string): ParsedScreenshotName {
  // Strip extension
  const base = fileName.replace(/\.[^.]+$/, '');

  let remaining = base;
  let sequence: number | null = null;

  // Extract leading number prefix: "01-" or "1-"
  const seqMatch = remaining.match(/^(\d+)-(.+)$/);
  if (seqMatch) {
    sequence = parseInt(seqMatch[1], 10);
    remaining = seqMatch[2];
  }

  // Split into segments by dash
  const segments = remaining.split('-');

  let group: string | null = null;
  let nameParts: string[];

  if (segments.length >= 2) {
    // First segment is the group
    group = segments[0];
    nameParts = segments.slice(1);
  } else {
    nameParts = segments;
  }

  // Convert to human-readable name: "portfolio-details" → "Portfolio Details"
  const name = nameParts
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(' ');

  // Depth = number of name parts (after group extraction)
  const depth = nameParts.length;

  return { sequence, group, name, depth };
}

/**
 * Generate a clean display name from a filename.
 */
export function getDisplayName(fileName: string): string {
  return parseScreenshotName(fileName).name;
}
