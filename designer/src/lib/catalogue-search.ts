// Client-side fuzzy search across Groups, Flows, and Screenshots.
// Runs entirely over the in-memory fullScopeScreenshots array — no
// network calls. Tokenises the query on whitespace; all tokens must
// match somewhere in the haystack (case-insensitive). Limited to N
// per category for the modal preview.

import { CATALOGUE_FLOW_LABEL_KEY } from './catalogue-families';
import type { ScreenshotNode } from '../types';

export const SEARCH_PREVIEW_PER_CATEGORY = 5;

export type SearchResultType = 'group' | 'flow' | 'screenshot';

export interface GroupResult {
  type: 'group';
  id: string;
  name: string;
  flowCount: number;
  screenCount: number;
}

export interface FlowResult {
  type: 'flow';
  id: string;
  name: string;
  group: string;
  screenCount: number;
}

export interface ScreenshotResult {
  type: 'screenshot';
  id: string;
  screenshot: ScreenshotNode;
  meta: string;
}

export type SearchResult = GroupResult | FlowResult | ScreenshotResult;

export interface SearchResults {
  groups: GroupResult[];
  flows: FlowResult[];
  screenshots: ScreenshotResult[];
  groupsTotal: number;
  flowsTotal: number;
  screenshotsTotal: number;
}

function getFlowLabel(screenshot: ScreenshotNode): string | null {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata[CATALOGUE_FLOW_LABEL_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getLabel(screenshot: ScreenshotNode): Record<string, unknown> | null {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== 'object') return null;
  const label = metadata.label;
  if (!label || typeof label !== 'object') return null;
  return label as Record<string, unknown>;
}

function collectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function getScreenshotHaystack(screenshot: ScreenshotNode): string {
  const parts: string[] = [];
  if (screenshot.name) parts.push(screenshot.name);
  if (screenshot.file_name) parts.push(screenshot.file_name);
  if (screenshot.group) parts.push(screenshot.group);
  const flow = getFlowLabel(screenshot);
  if (flow) parts.push(flow);

  const label = getLabel(screenshot);
  if (label) {
    const identity = label.identity as Record<string, unknown> | undefined;
    if (identity && typeof identity === 'object') {
      if (typeof identity.title === 'string') parts.push(identity.title);
      if (typeof identity.one_line_summary === 'string') parts.push(identity.one_line_summary);
      parts.push(...collectStringArray(identity.page_types));
    }
    const screenAnalysis = label.screen_analysis as Record<string, unknown> | undefined;
    if (screenAnalysis && typeof screenAnalysis === 'object') {
      parts.push(...collectStringArray(screenAnalysis.ui_elements));
      parts.push(...collectStringArray(screenAnalysis.ux_patterns));
    }
  }

  return parts.join(' ').toLowerCase();
}

function tokensFromQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  for (const token of tokens) {
    if (!haystack.includes(token)) return false;
  }
  return true;
}

function platformLabel(platform: string | null | undefined): string {
  if (platform === 'web') return 'Web';
  if (platform === 'mobile') return 'Mobile';
  return '—';
}

interface DeriveArgs {
  screenshots: ScreenshotNode[];
  query: string;
  perCategory?: number;
}

export function deriveSearchResults({ screenshots, query, perCategory = SEARCH_PREVIEW_PER_CATEGORY }: DeriveArgs): SearchResults {
  const tokens = tokensFromQuery(query);
  if (tokens.length === 0) {
    return {
      groups: [],
      flows: [],
      screenshots: [],
      groupsTotal: 0,
      flowsTotal: 0,
      screenshotsTotal: 0,
    };
  }

  // Index groups + flows from the haystack so we can compute counts cheaply.
  const groupIndex = new Map<string, { name: string; flows: Set<string>; screens: number }>();
  const flowIndex = new Map<string, { name: string; group: string; screens: number }>();

  for (const screenshot of screenshots) {
    const group = screenshot.group?.trim();
    if (!group) continue;
    const flow = getFlowLabel(screenshot);

    const groupEntry = groupIndex.get(group) ?? { name: group, flows: new Set<string>(), screens: 0 };
    groupEntry.screens += 1;
    if (flow) groupEntry.flows.add(flow);
    groupIndex.set(group, groupEntry);

    if (flow) {
      const flowKey = `${group}::${flow}`;
      const flowEntry = flowIndex.get(flowKey) ?? { name: flow, group, screens: 0 };
      flowEntry.screens += 1;
      flowIndex.set(flowKey, flowEntry);
    }
  }

  const matchedGroups: GroupResult[] = [];
  for (const [name, entry] of groupIndex) {
    if (matchesAllTokens(name.toLowerCase(), tokens)) {
      matchedGroups.push({
        type: 'group',
        id: name,
        name,
        flowCount: entry.flows.size,
        screenCount: entry.screens,
      });
    }
  }
  matchedGroups.sort((a, b) => a.name.localeCompare(b.name));

  const matchedFlows: FlowResult[] = [];
  for (const [id, entry] of flowIndex) {
    const haystack = `${entry.name} ${entry.group}`.toLowerCase();
    if (matchesAllTokens(haystack, tokens)) {
      matchedFlows.push({
        type: 'flow',
        id,
        name: entry.name,
        group: entry.group,
        screenCount: entry.screens,
      });
    }
  }
  matchedFlows.sort((a, b) => a.name.localeCompare(b.name));

  const matchedScreenshots: ScreenshotResult[] = [];
  for (const screenshot of screenshots) {
    const haystack = getScreenshotHaystack(screenshot);
    if (!matchesAllTokens(haystack, tokens)) continue;
    const flow = getFlowLabel(screenshot);
    const metaParts = [
      screenshot.group ?? '',
      flow ?? '',
      platformLabel(screenshot.platform),
    ].filter((part) => part.length > 0 && part !== '—');
    matchedScreenshots.push({
      type: 'screenshot',
      id: screenshot.id,
      screenshot,
      meta: metaParts.join(' · '),
    });
  }

  return {
    groups: matchedGroups.slice(0, perCategory),
    flows: matchedFlows.slice(0, perCategory),
    screenshots: matchedScreenshots.slice(0, perCategory),
    groupsTotal: matchedGroups.length,
    flowsTotal: matchedFlows.length,
    screenshotsTotal: matchedScreenshots.length,
  };
}

// ──────────── Recents ────────────

const RECENTS_KEY = 'agentux-catalogue-search-recents';
const RECENTS_LIMIT = 5;

export interface RecentEntry {
  query: string;
  ts: number;
}

export function loadRecents(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentEntry => entry && typeof entry.query === 'string' && typeof entry.ts === 'number')
      .slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecent(query: string): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  const trimmed = query.trim();
  if (!trimmed) return loadRecents();
  const current = loadRecents().filter((entry) => entry.query !== trimmed);
  const next: RecentEntry[] = [{ query: trimmed, ts: Date.now() }, ...current].slice(0, RECENTS_LIMIT);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or private-mode — silent no-op; recents will simply not persist.
  }
  return next;
}
