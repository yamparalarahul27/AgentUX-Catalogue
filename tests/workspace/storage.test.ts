import { beforeEach, describe, expect, it } from 'vitest';
import type { AppMapData } from '../../src/types';
import { createJourney, createWorkspace } from '../../src/workspace';
import {
  clearPersistedWorkspace,
  getWorkspaceStorageKey,
  loadPersistedWorkspace,
  savePersistedWorkspace,
} from '../../src/workspace/storage';

describe('Workspace storage', () => {
  const baseData: AppMapData = {
    routes: [
      { id: 'route-home', path: '/', name: 'Home', framework: 'nextjs-app', source: 'static' },
    ],
    edges: [],
    framework: 'nextjs-app',
    scannedAt: '2026-03-23T10:00:00.000Z',
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a persisted workspace state', () => {
    const journey = createJourney('Primary Journey', '2026-03-23T10:01:00.000Z');
    const workspace = createWorkspace(baseData, { journeys: [journey] });

    const saved = savePersistedWorkspace(baseData, {
      workspace,
      selectedJourneyId: journey.id,
    });
    const loaded = loadPersistedWorkspace(baseData);

    expect(saved).toBe(true);
    expect(loaded?.selectedJourneyId).toBe(journey.id);
    expect(loaded?.workspace.journeys[0].name).toBe('Primary Journey');
  });

  it('clears persisted workspace state', () => {
    const journey = createJourney('Primary Journey', '2026-03-23T10:01:00.000Z');
    const workspace = createWorkspace(baseData, { journeys: [journey] });

    savePersistedWorkspace(baseData, {
      workspace,
      selectedJourneyId: journey.id,
    });
    const cleared = clearPersistedWorkspace(baseData);

    expect(cleared).toBe(true);
    expect(window.localStorage.getItem(getWorkspaceStorageKey(baseData))).toBeNull();
  });
});
