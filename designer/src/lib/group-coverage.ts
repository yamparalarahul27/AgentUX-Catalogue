// Per-group coverage score (Mobile + Web), diversity-based.
//
// Formula: distinct flow_ids captured / target. Target = the highest
// distinct-flow count any group has on that platform (self-calibrating).
// +5% bonus if a group has all relevant variants captured (both iOS and
// Android for mobile; at least 3 web presets for web). Capped at 100%.
//
// All inputs come from the existing screenshots array — no schema additions.

interface ScreenshotLike {
  group?: string | null;
  platform?: 'mobile' | 'web' | null;
  flow_id?: string | null;
  mobile_os?: string | null;
  web_preset_key?: string | null;
}

export interface PlatformCoverage {
  pct: number;
  flowsCaptured: number;
  targetFlows: number;
  allVariants: boolean;
}

export interface GroupCoverage {
  mobile: PlatformCoverage | null;
  web: PlatformCoverage | null;
}

export interface CoverageTargets {
  targetMobile: number;
  targetWeb: number;
}

const MOBILE_OS_COUNT_FOR_BONUS = 2;
const WEB_PRESET_COUNT_FOR_BONUS = 3;
const VARIANT_BONUS = 0.05;

function normalizeGroupKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function distinctFlowsBy(
  shots: ScreenshotLike[],
  predicate: (shot: ScreenshotLike) => boolean,
): Set<string> {
  const flows = new Set<string>();
  for (const shot of shots) {
    if (!predicate(shot)) continue;
    if (shot.flow_id) flows.add(shot.flow_id);
  }
  return flows;
}

// Compute the target denominators across the entire catalogue. Pass the
// full-scope screenshot array (the unfiltered superset) so the targets
// reflect the real ceiling, not the current filter window.
export function computeCoverageTargets(allScreenshots: ScreenshotLike[]): CoverageTargets {
  const flowsByGroup = new Map<string, { mobile: Set<string>; web: Set<string> }>();
  for (const shot of allScreenshots) {
    const key = normalizeGroupKey(shot.group);
    if (!key) continue;
    let entry = flowsByGroup.get(key);
    if (!entry) {
      entry = { mobile: new Set(), web: new Set() };
      flowsByGroup.set(key, entry);
    }
    if (!shot.flow_id) continue;
    if (shot.platform === 'mobile') entry.mobile.add(shot.flow_id);
    else if (shot.platform === 'web') entry.web.add(shot.flow_id);
  }

  let targetMobile = 0;
  let targetWeb = 0;
  for (const { mobile, web } of flowsByGroup.values()) {
    if (mobile.size > targetMobile) targetMobile = mobile.size;
    if (web.size > targetWeb) targetWeb = web.size;
  }
  return { targetMobile, targetWeb };
}

function scorePct(captured: number, target: number, allVariants: boolean): number {
  if (target === 0) return 0;
  let raw = captured / target;
  if (allVariants) raw += VARIANT_BONUS;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100);
}

// Compute coverage for a single group. `groupShots` is the subset of
// screenshots belonging to one group (already filtered by caller).
// Returns null per-platform when the group has no screenshots on that
// platform — caller decides whether to render an empty row or hide.
export function computeGroupCoverage(
  groupShots: ScreenshotLike[],
  targets: CoverageTargets,
): GroupCoverage {
  const mobileShots = groupShots.filter((s) => s.platform === 'mobile');
  const webShots = groupShots.filter((s) => s.platform === 'web');

  const mobileFlows = distinctFlowsBy(mobileShots, () => true);
  const webFlows = distinctFlowsBy(webShots, () => true);

  const mobileOses = new Set<string>();
  for (const s of mobileShots) if (s.mobile_os) mobileOses.add(s.mobile_os);
  const webPresets = new Set<string>();
  for (const s of webShots) if (s.web_preset_key) webPresets.add(s.web_preset_key);

  const mobileAllVariants = mobileOses.size >= MOBILE_OS_COUNT_FOR_BONUS;
  const webAllVariants = webPresets.size >= WEB_PRESET_COUNT_FOR_BONUS;

  return {
    mobile: mobileShots.length === 0
      ? null
      : {
          pct: scorePct(mobileFlows.size, targets.targetMobile, mobileAllVariants),
          flowsCaptured: mobileFlows.size,
          targetFlows: targets.targetMobile,
          allVariants: mobileAllVariants,
        },
    web: webShots.length === 0
      ? null
      : {
          pct: scorePct(webFlows.size, targets.targetWeb, webAllVariants),
          flowsCaptured: webFlows.size,
          targetFlows: targets.targetWeb,
          allVariants: webAllVariants,
        },
  };
}
