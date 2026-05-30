// Client-side fuzzy search across Groups, Flows, and Screenshots.
// Runs entirely over the in-memory fullScopeScreenshots array — no
// network calls. Tokenises the query on whitespace; all tokens must
// match somewhere in the haystack (case-insensitive). Limited to N
// per category for the modal preview.

import { CATALOGUE_FLOW_LABEL_KEY } from './catalogue-families';
import { applyChipFilters, stripStopWords, type EntityChip } from './catalogue-search-entities';
import type { ScreenshotNode } from '../types';

// Preview cap per bucket inside the search modal. Tight so the modal
// stays a glanceable jump-to-result view; users hitting Enter (or
// the "View all" CTA) commit the query into the catalogue scope to
// see every match in the grid.
export const SEARCH_PREVIEW_PER_CATEGORY = 3;

export type SearchResultType = 'group' | 'flow' | 'screenshot';

export interface GroupResult {
  type: 'group';
  id: string;
  name: string;
  flowCount: number;
  screenCount: number;
  /** Higher = more relevant. Used for sort ordering within bucket. */
  score: number;
}

export interface FlowResult {
  type: 'flow';
  id: string;
  name: string;
  group: string;
  screenCount: number;
  score: number;
}

export interface ScreenshotResult {
  type: 'screenshot';
  id: string;
  screenshot: ScreenshotNode;
  meta: string;
  score: number;
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

// Exported so the search modal can use the same tokeniser to compute
// highlight ranges on result names.
export function tokensFromQuery(query: string): string[] {
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

// Returns the highest score across the candidate fields. Each field
// scores higher when it contains ALL tokens than just some.
// `tieredFields` is ordered most→least relevant; the first one that
// matches all tokens wins.
function scoreByField(tokens: string[], tieredFields: Array<{ value: string; weight: number }>): number {
  let best = 0;
  for (const { value, weight } of tieredFields) {
    if (!value) continue;
    const lc = value.toLowerCase();
    if (matchesAllTokens(lc, tokens)) {
      if (weight > best) best = weight;
    }
  }
  return best;
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
  // Entity chips accepted by the user pre-filter the screenshot list
  // before the text matcher runs. Empty / undefined → no chip filter
  // (original text-only search behavior).
  chips?: EntityChip[];
}

export function deriveSearchResults({ screenshots: inputScreenshots, query, perCategory = SEARCH_PREVIEW_PER_CATEGORY, chips = [] }: DeriveArgs): SearchResults {
  // Step 1: chip filtering — narrows the screenshot universe to ones
  // that satisfy every accepted chip BEFORE text matching runs.
  const screenshots = chips.length > 0 ? applyChipFilters(inputScreenshots, chips) : inputScreenshots;

  // Step 2: text matching — strip stop words so "screen in Weex" with
  // a Weex chip becomes "screen" instead of "screen in".
  const cleanedQuery = stripStopWords(query);
  const tokens = tokensFromQuery(cleanedQuery);

  // No tokens AND no chips → empty modal preview. (No tokens WITH
  // chips → fall through to the matcher; an empty token list passes
  // `matchesAllTokens` trivially, so every screenshot in the chip-
  // scoped set surfaces — gives "show me everything in Weex" with
  // no text typed.)
  if (tokens.length === 0 && chips.length === 0) {
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
        score: 100, // groups only match on name; score uniform
      });
    }
  }
  matchedGroups.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const matchedFlows: FlowResult[] = [];
  for (const [id, entry] of flowIndex) {
    const haystack = `${entry.name} ${entry.group}`.toLowerCase();
    if (matchesAllTokens(haystack, tokens)) {
      const score = scoreByField(tokens, [
        { value: entry.name, weight: 100 },
        { value: entry.group, weight: 50 },
      ]);
      matchedFlows.push({
        type: 'flow',
        id,
        name: entry.name,
        group: entry.group,
        screenCount: entry.screens,
        score,
      });
    }
  }
  matchedFlows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

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
    // Score from most→least visible: visible name first, then the
    // labelled title (often the AI-derived display name), then the
    // flow label / group, then less-visible signals.
    const label = getLabel(screenshot);
    const identity = label?.identity as Record<string, unknown> | undefined;
    const title = typeof identity?.title === 'string' ? identity.title : '';
    const summary = typeof identity?.one_line_summary === 'string' ? identity.one_line_summary : '';
    const score = scoreByField(tokens, [
      { value: screenshot.name ?? '', weight: 100 },
      { value: title, weight: 80 },
      { value: flow ?? '', weight: 60 },
      { value: screenshot.group ?? '', weight: 55 },
      { value: summary, weight: 40 },
      { value: screenshot.file_name ?? '', weight: 30 },
      // Tag-only matches (page_types / ui_elements / ux_patterns) fall
      // through to the floor — we still surface them so nothing is
      // hidden, but they sort below name / title / flow matches.
      { value: haystack, weight: 10 },
    ]);
    matchedScreenshots.push({
      type: 'screenshot',
      id: screenshot.id,
      screenshot,
      meta: metaParts.join(' · '),
      score,
    });
  }
  matchedScreenshots.sort((a, b) => b.score - a.score || a.screenshot.name.localeCompare(b.screenshot.name));

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
