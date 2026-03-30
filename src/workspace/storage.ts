import type { AppMapData, Workspace } from '../types';

export interface PersistedWorkspaceState {
  workspace: Workspace;
  selectedJourneyId: string | null;
}

const STORAGE_KEY_PREFIX = 'agentux:workspace:v1';

export function getWorkspaceStorageKey(baseData: AppMapData): string {
  const origin =
    typeof window === 'undefined'
      ? 'server'
      : window.location.origin.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '-');

  return `${STORAGE_KEY_PREFIX}:${origin}:${baseData.framework}`;
}

export function loadPersistedWorkspace(baseData: AppMapData): PersistedWorkspaceState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getWorkspaceStorageKey(baseData));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PersistedWorkspaceState;
    if (!parsed || typeof parsed !== 'object' || !parsed.workspace) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedWorkspace(
  baseData: AppMapData,
  state: PersistedWorkspaceState,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(getWorkspaceStorageKey(baseData), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedWorkspace(baseData: AppMapData): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.removeItem(getWorkspaceStorageKey(baseData));
    return true;
  } catch {
    return false;
  }
}
