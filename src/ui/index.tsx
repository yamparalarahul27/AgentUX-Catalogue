"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppMapConfig, AppMapData, Workspace } from '../types';
import { DEFAULT_POSITION, DEFAULT_THEME } from '../constants';
import { BUTTON_SIZE, FloatingButton, type ButtonPosition } from './FloatingButton';
import { Modal, computeModalFrame } from './Modal';
import { Toolbar } from './Toolbar';
import { SetupGuide, type DataSourceStatus, type ProjectStructureStatus } from './SetupGuide';
import { JourneyManager } from './JourneyManager';
import { Legend } from './Legend';
import { CanvasEditBar, type CanvasEditMode } from './CanvasEditBar';
import { StructureTree } from './StructureTree';
import { AppMapCanvas } from '../visualization';
import { generateJson, generateMarkdown, copyToClipboard } from '../export';
import { useRuntimeRoutes } from '../runtime';
import { mergeAppMapData } from '../merge';
import { RouteDetailsPanel } from './RouteDetails';
import {
  analyzeAppMap,
  filterAppMapData,
  getRouteDetails,
  type AppMapFilter,
} from '../utils/flow-insights';
import {
  addJourney,
  createJourney,
  deriveJourneyGraph,
  getJourney,
  getJourneyRouteState,
  renameJourney,
  syncWorkspaceBaseData,
  toggleJourneyBoundary,
  toggleJourneyEdgeChange,
} from '../workspace';
import { loadPersistedWorkspace, savePersistedWorkspace } from '../workspace/storage';

interface AppMapProps extends AppMapConfig {}
type AppMapView = 'flow' | 'structure';
const DEFAULT_SCAN_COMMAND = 'npx agentux scan';
const DOCK_OFFSET = 8;
const BUTTON_RADIUS = BUTTON_SIZE / 2;

/** Main AppMap component — renders a floating button that opens an interactive app map */
export function AppMap({
  data: staticData,
  workspace: providedWorkspace,
  position = DEFAULT_POSITION,
  staticAnalysis = true,
  runtimeDetection = true,
  devOnly = true,
}: AppMapProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [relayoutKey, setRelayoutKey] = useState(0);
  const [buttonPos, setButtonPos] = useState<ButtonPosition | null>(null);
  const [currentFilter, setCurrentFilter] = useState<AppMapFilter>('all');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<Workspace | null>(providedWorkspace ?? null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(providedWorkspace?.savedAt ?? null);
  const [canvasEditMode, setCanvasEditMode] = useState<CanvasEditMode>('inspect');
  const [isGuideVisible, setIsGuideVisible] = useState(true);
  const [isJourneyManagerVisible, setIsJourneyManagerVisible] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(false);
  const [activeView, setActiveView] = useState<AppMapView>('flow');
  const [runtimeRefreshKey, setRuntimeRefreshKey] = useState(0);
  const [resolvedStaticData, setResolvedStaticData] = useState<AppMapData | null>(staticData ?? null);
  const [projectStructureStatus, setProjectStructureStatus] = useState<ProjectStructureStatus>(
    staticData ? 'loaded' : staticAnalysis ? 'idle' : 'idle',
  );
  const [projectStructureMessage, setProjectStructureMessage] = useState(
    staticData
      ? `Loaded ${staticData.routes.length} scanned screens from component data.`
      : 'Run `npx agentux scan` in your app root, then load `public/agentux.json` here.',
  );
  const [staticReloadKey, setStaticReloadKey] = useState(0);
  const hydratedWorkspaceRef = useRef(false);

  // Runtime route detection — must be called before any conditional returns (Rules of Hooks)
  const runtimeData = useRuntimeRoutes(runtimeDetection, runtimeRefreshKey);

  useEffect(() => {
    if (staticData) {
      setResolvedStaticData(staticData);
      setProjectStructureStatus('loaded');
      setProjectStructureMessage(`Loaded ${staticData.routes.length} scanned screens from component data.`);
      return;
    }

    if (!staticAnalysis || typeof window === 'undefined') {
      setResolvedStaticData(null);
      setProjectStructureStatus('idle');
      setProjectStructureMessage(
        staticAnalysis
          ? 'Open the app to start runtime capture, or run `npx agentux scan` for a fuller map.'
          : 'Static project-structure loading is disabled for this AgentUX instance.',
      );
      return;
    }

    let cancelled = false;
    setProjectStructureStatus('loading');
    setProjectStructureMessage('Loading `public/agentux.json` for the full project structure...');

    fetch(`/agentux.json?ts=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('missing');
          }
          throw new Error(`Request failed with ${response.status}`);
        }

        return response.json();
      })
      .then((payload: unknown) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !Array.isArray((payload as AppMapData).routes) ||
          !Array.isArray((payload as AppMapData).edges)
        ) {
          throw new Error('invalid');
        }

        if (cancelled) return;

        const nextStaticData = payload as AppMapData;
        setResolvedStaticData(nextStaticData);
        setProjectStructureStatus('loaded');
        setProjectStructureMessage(
          `Loaded ${nextStaticData.routes.length} screens from \`public/agentux.json\`.`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setResolvedStaticData(null);

        if (error instanceof Error && error.message === 'missing') {
          setProjectStructureStatus('missing');
          setProjectStructureMessage(
            'No `public/agentux.json` found yet. Run `npx agentux scan` in your app root, then click Load agentux.json.',
          );
          return;
        }

        setProjectStructureStatus('error');
        setProjectStructureMessage(
          'AgentUX could not load `public/agentux.json`. Re-run `npx agentux scan` and try again.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [staticData, staticAnalysis, staticReloadKey]);

  // Merge static + runtime data
  const mergedData: AppMapData | null = useMemo(() => {
    if (!resolvedStaticData && (!runtimeData.routes.length)) {
      return null;
    }

    if (!runtimeDetection || !runtimeData.routes.length) {
      return resolvedStaticData || null;
    }

    return mergeAppMapData(
      resolvedStaticData || null,
      runtimeData.routes,
      runtimeData.edges,
    );
  }, [resolvedStaticData, runtimeData, runtimeDetection]);

  const insights = useMemo(
    () => (mergedData ? analyzeAppMap(mergedData) : null),
    [mergedData],
  );

  const filteredData = useMemo(
    () => (mergedData ? filterAppMapData(mergedData, currentFilter) : null),
    [mergedData, currentFilter],
  );

  const activeSelectedRouteId = useMemo(() => {
    if (!mergedData || !selectedRouteId) return null;
    return mergedData.routes.some((route) => route.id === selectedRouteId) ? selectedRouteId : null;
  }, [mergedData, selectedRouteId]);

  const selectedCanvasRouteId = useMemo(() => {
    if (!filteredData || !selectedRouteId) return null;
    return filteredData.routes.some((route) => route.id === selectedRouteId) ? selectedRouteId : null;
  }, [filteredData, selectedRouteId]);

  const selectedRouteDetails = useMemo(
    () => (mergedData && insights ? getRouteDetails(mergedData, insights, activeSelectedRouteId) : null),
    [mergedData, insights, activeSelectedRouteId],
  );

  const filterCounts = useMemo(() => {
    if (!mergedData || !insights) {
      return {
        all: 0,
        'runtime-only': 0,
        'dead-ends': 0,
        orphaned: 0,
      } as Record<AppMapFilter, number>;
    }

    return {
      all: mergedData.routes.length,
      'runtime-only': insights.runtimeOnlyRouteIds.length,
      'dead-ends': insights.deadEndRouteIds.length,
      orphaned: insights.orphanedRouteIds.length,
    } as Record<AppMapFilter, number>;
  }, [mergedData, insights]);

  useEffect(() => {
    if (!mergedData) return;

    if (providedWorkspace) {
      const nextWorkspace = syncWorkspaceBaseData(providedWorkspace, mergedData);
      setWorkspaceState(nextWorkspace);
      setSelectedJourneyId((currentJourneyId) => currentJourneyId ?? nextWorkspace.journeys[0]?.id ?? null);
      setLastSavedAt(nextWorkspace.savedAt ?? null);
      hydratedWorkspaceRef.current = true;
      return;
    }

    if (!hydratedWorkspaceRef.current) {
      hydratedWorkspaceRef.current = true;
      const persisted = loadPersistedWorkspace(mergedData);

      if (persisted) {
        const nextWorkspace = syncWorkspaceBaseData(persisted.workspace, mergedData);
        setWorkspaceState(nextWorkspace);
        setSelectedJourneyId(persisted.selectedJourneyId ?? nextWorkspace.journeys[0]?.id ?? null);
        setLastSavedAt(nextWorkspace.savedAt ?? null);
        return;
      }
    }

    setWorkspaceState((currentWorkspace) => {
      const nextWorkspace = syncWorkspaceBaseData(currentWorkspace, mergedData);
      setLastSavedAt(nextWorkspace.savedAt ?? null);
      return nextWorkspace;
    });
  }, [mergedData, providedWorkspace]);

  useEffect(() => {
    if (!mergedData || !workspaceState || providedWorkspace) return;

    const saved = savePersistedWorkspace(mergedData, {
      workspace: workspaceState,
      selectedJourneyId: selectedJourneyId ?? workspaceState.journeys[0]?.id ?? null,
    });

    if (saved) {
      setLastSavedAt(workspaceState.savedAt ?? new Date().toISOString());
    }
  }, [mergedData, workspaceState, selectedJourneyId, providedWorkspace]);

  const activeJourney = useMemo(
    () => getJourney(workspaceState, selectedJourneyId),
    [workspaceState, selectedJourneyId],
  );

  const selectedJourneyRouteState = useMemo(
    () =>
      workspaceState && activeJourney && activeSelectedRouteId
        ? getJourneyRouteState(workspaceState, activeJourney.id, activeSelectedRouteId)
        : null,
    [workspaceState, activeJourney, activeSelectedRouteId],
  );

  const graphView = useMemo(
    () =>
      filteredData && workspaceState && activeJourney
        ? deriveJourneyGraph(filteredData, workspaceState, activeJourney.id)
        : null,
    [filteredData, workspaceState, activeJourney],
  );

  const dataSourceStatus = useMemo<DataSourceStatus>(() => {
    if (!mergedData) {
      return 'no-data';
    }

    const hasStatic = mergedData.routes.some(
      (route) => route.source === 'static' || route.source === 'both',
    );
    const hasRuntime = mergedData.routes.some(
      (route) => route.source === 'runtime' || route.source === 'both',
    );

    if (hasStatic && hasRuntime) {
      return 'static-plus-runtime';
    }

    return hasStatic ? 'static-only' : 'runtime-only';
  }, [mergedData]);

  const handleExportMarkdown = useCallback(() => {
    if (!mergedData) return;
    const markdown = generateMarkdown(mergedData, {
      workspace: workspaceState,
      journeyId: activeJourney?.id ?? selectedJourneyId,
    });
    copyToClipboard(markdown);
  }, [mergedData, workspaceState, activeJourney, selectedJourneyId]);

  const handleExportJson = useCallback(() => {
    if (!mergedData) return;
    const json = generateJson(mergedData, {
      workspace: workspaceState,
      journeyId: activeJourney?.id ?? selectedJourneyId,
    });
    copyToClipboard(json);
  }, [mergedData, workspaceState, activeJourney, selectedJourneyId]);

  const handleRelayout = useCallback(() => {
    setRelayoutKey((k) => k + 1);
  }, []);

  const handleButtonPositionChange = useCallback((pos: ButtonPosition) => {
    setButtonPos(pos);
  }, []);

  const handleInspectFirstVisible = useCallback(() => {
    if (!filteredData || filteredData.routes.length === 0) return;
    setSelectedRouteId(filteredData.routes[0].id);
  }, [filteredData]);

  const handleCreateJourneyDraft = useCallback(() => {
    if (!mergedData) return;

    const nextJourneyNumber = (workspaceState?.journeys.length ?? 0) + 1;
    const journey = createJourney(nextJourneyNumber === 1 ? 'Main Journey' : `Journey ${nextJourneyNumber}`);
    setSelectedJourneyId(journey.id);
    setCanvasEditMode('connect');
    setWorkspaceState((currentWorkspace) => {
      const baseWorkspace = syncWorkspaceBaseData(currentWorkspace, mergedData);
      return addJourney(baseWorkspace, journey);
    });
  }, [mergedData, workspaceState]);

  const handleSelectJourney = useCallback((journeyId: string) => {
    setSelectedJourneyId(journeyId);
  }, []);

  const handleRenameJourney = useCallback(
    (journeyId: string, name: string) => {
      setWorkspaceState((currentWorkspace) =>
        currentWorkspace ? renameJourney(currentWorkspace, journeyId, name) : currentWorkspace,
      );
    },
    [],
  );

  useEffect(() => {
    if (!activeJourney && canvasEditMode !== 'inspect') {
      setCanvasEditMode('inspect');
    }
  }, [activeJourney, canvasEditMode]);

  const handleToggleJourneyBoundary = useCallback(
    (routeId: string, boundary: 'start' | 'end') => {
      if (!activeJourney) return;
      setWorkspaceState((currentWorkspace) =>
        currentWorkspace
          ? toggleJourneyBoundary(currentWorkspace, activeJourney.id, routeId, boundary)
          : currentWorkspace,
      );
    },
    [activeJourney],
  );

  const handleToggleJourneyEdgeChange = useCallback(
    (sourceRouteId: string, targetRouteId: string, change: 'add' | 'remove') => {
      if (!activeJourney) return;
      setWorkspaceState((currentWorkspace) =>
        currentWorkspace
          ? toggleJourneyEdgeChange(
              currentWorkspace,
              activeJourney.id,
              sourceRouteId,
              targetRouteId,
              change,
            )
          : currentWorkspace,
      );
    },
    [activeJourney],
  );

  const handleCanvasConnect = useCallback(
    (sourceRouteId: string, targetRouteId: string) => {
      if (!activeJourney || sourceRouteId === targetRouteId) return;
      handleToggleJourneyEdgeChange(sourceRouteId, targetRouteId, 'add');
      setSelectedRouteId(targetRouteId);
    },
    [activeJourney, handleToggleJourneyEdgeChange],
  );

  const handleCanvasEdgeToggle = useCallback(
    (edge: { sourceRouteId: string; targetRouteId: string; state: 'current' | 'intended' | 'removed' }) => {
      if (!activeJourney) return;

      if (edge.state === 'intended') {
        handleToggleJourneyEdgeChange(edge.sourceRouteId, edge.targetRouteId, 'add');
        return;
      }

      handleToggleJourneyEdgeChange(edge.sourceRouteId, edge.targetRouteId, 'remove');
    },
    [activeJourney, handleToggleJourneyEdgeChange],
  );

  const structureRoutes = useMemo(
    () => resolvedStaticData?.routes ?? mergedData?.routes ?? [],
    [resolvedStaticData, mergedData],
  );

  const graphData = graphView?.data ?? filteredData ?? null;
  const dockedButtonPos = useMemo(() => {
    if (!isOpen || !buttonPos) return null;

    const frame = computeModalFrame(buttonPos);
    const buttonCenterX = buttonPos.x + BUTTON_RADIUS;
    const buttonCenterY = buttonPos.y + BUTTON_RADIUS;
    const edges = [
      {
        edge: 'left' as const,
        distance: Math.abs(buttonCenterX - frame.left),
      },
      {
        edge: 'right' as const,
        distance: Math.abs(buttonCenterX - (frame.left + frame.width)),
      },
      {
        edge: 'top' as const,
        distance: Math.abs(buttonCenterY - frame.top),
      },
      {
        edge: 'bottom' as const,
        distance: Math.abs(buttonCenterY - (frame.top + frame.height)),
      },
    ];

    const nearestEdge = edges.sort((left, right) => left.distance - right.distance)[0]?.edge ?? 'right';
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    switch (nearestEdge) {
      case 'left':
        return {
          x: frame.left - BUTTON_RADIUS,
          y: clamp(
            buttonCenterY - BUTTON_RADIUS,
            frame.top + DOCK_OFFSET,
            frame.top + frame.height - BUTTON_SIZE - DOCK_OFFSET,
          ),
        };
      case 'top':
        return {
          x: clamp(
            buttonCenterX - BUTTON_RADIUS,
            frame.left + DOCK_OFFSET,
            frame.left + frame.width - BUTTON_SIZE - DOCK_OFFSET,
          ),
          y: frame.top - BUTTON_RADIUS,
        };
      case 'bottom':
        return {
          x: clamp(
            buttonCenterX - BUTTON_RADIUS,
            frame.left + DOCK_OFFSET,
            frame.left + frame.width - BUTTON_SIZE - DOCK_OFFSET,
          ),
          y: frame.top + frame.height - BUTTON_RADIUS,
        };
      case 'right':
      default:
        return {
          x: frame.left + frame.width - BUTTON_RADIUS,
          y: clamp(
            buttonCenterY - BUTTON_RADIUS,
            frame.top + DOCK_OFFSET,
            frame.top + frame.height - BUTTON_SIZE - DOCK_OFFSET,
          ),
        };
    }
  }, [buttonPos, isOpen]);

  const handleRunProjectStructure = useCallback(() => {
    setStaticReloadKey((current) => current + 1);
    setActiveView('structure');
  }, []);

  const handleCopyScanCommand = useCallback(() => {
    copyToClipboard(DEFAULT_SCAN_COMMAND);
  }, []);

  const handleRestartRuntime = useCallback(() => {
    if (!runtimeDetection) return;
    setRuntimeRefreshKey((current) => current + 1);
    setActiveView('flow');
  }, [runtimeDetection]);

  const handleRefreshAll = useCallback(() => {
    setStaticReloadKey((current) => current + 1);
    if (runtimeDetection) {
      setRuntimeRefreshKey((current) => current + 1);
    }
  }, [runtimeDetection]);

  // Dev-only guard — after all hooks
  if (devOnly && typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return null;
  }

  return (
    <>
      <FloatingButton
        onClick={() => setIsOpen(!isOpen)}
        isOpen={isOpen}
        position={position}
        onPositionChange={handleButtonPositionChange}
        dockedPosition={dockedButtonPos}
      />

      <Modal isOpen={isOpen} buttonPosition={buttonPos}>
        <Toolbar
          onExportMarkdown={handleExportMarkdown}
          onExportJson={handleExportJson}
          onRelayout={handleRelayout}
          routeCount={graphData?.routes.length ?? 0}
          edgeCount={graphData?.edges.length ?? 0}
          currentFilter={currentFilter}
          onFilterChange={setCurrentFilter}
          filterCounts={filterCounts}
          activeJourneyName={activeJourney?.name ?? null}
          onCreateJourneyDraft={mergedData ? handleCreateJourneyDraft : undefined}
          dataSourceLabel={formatDataSourceLabel(dataSourceStatus)}
          isGuideVisible={isGuideVisible}
          onToggleGuideVisibility={() => setIsGuideVisible((current) => !current)}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              flex: '1 1 420px',
              minHeight: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              overflowX: 'hidden',
              overscrollBehavior: 'contain',
            }}
          >
            {isGuideVisible && (
              <SetupGuide
                dataSourceStatus={dataSourceStatus}
                projectStructureStatus={projectStructureStatus}
                projectStructureMessage={projectStructureMessage}
                runtimeRouteCount={runtimeData.routes.length}
                runtimeDetection={runtimeDetection}
                onRunProjectStructure={handleRunProjectStructure}
                onCopyScanCommand={handleCopyScanCommand}
                onRestartRuntime={handleRestartRuntime}
                onRefreshAll={handleRefreshAll}
                onDismiss={() => setIsGuideVisible(false)}
              />
            )}
            {mergedData && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #1f1f23',
                    background: '#0f0f10',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <PanelToggleButton
                      label={activeJourney ? `Journey: ${activeJourney.name}` : 'Journey manager'}
                      meta={
                        activeJourney
                          ? `${activeJourney.startRouteIds.length} starts · ${activeJourney.endRouteIds.length} ends`
                          : 'Create and manage intended journeys'
                      }
                      isOpen={isJourneyManagerVisible}
                      onClick={() => setIsJourneyManagerVisible((current) => !current)}
                    />
                    <PanelToggleButton
                      label="Legend"
                      meta="Current, intended, removed, entry, dead end"
                      isOpen={isLegendVisible}
                      onClick={() => setIsLegendVisible((current) => !current)}
                    />
                  </div>

                  {isJourneyManagerVisible && (
                    <JourneyManager
                      journeys={workspaceState?.journeys ?? []}
                      activeJourneyId={activeJourney?.id ?? null}
                      onSelectJourney={handleSelectJourney}
                      onCreateJourney={handleCreateJourneyDraft}
                      onRenameJourney={handleRenameJourney}
                      savedAt={lastSavedAt}
                    />
                  )}

                  {isLegendVisible && <Legend />}
                </div>
                <CanvasEditBar
                  mode={canvasEditMode}
                  onModeChange={setCanvasEditMode}
                  hasJourneyDraft={Boolean(activeJourney)}
                />
              </>
            )}
            <div
              style={{
                flex: 1,
                minHeight: 220,
                padding: '12px 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'grid', gap: '2px' }}>
                  <p style={{ margin: 0, color: '#f4f4f5', fontSize: '14px', fontWeight: 700 }}>
                    {activeView === 'flow' ? 'UX flow map' : 'Project structure'}
                  </p>
                  <p style={{ margin: 0, color: '#a1a1aa', fontSize: '12px', lineHeight: 1.5 }}>
                    {activeView === 'flow'
                      ? `${graphData?.routes.length ?? 0} visible screens. Click a node to inspect it or switch to Add Flow to draft the next journey.`
                      : `${structureRoutes.length} scanned screen${structureRoutes.length === 1 ? '' : 's'} grouped by main screens and sub-screens.`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <ViewButton
                    label="Flow"
                    active={activeView === 'flow'}
                    onClick={() => setActiveView('flow')}
                  />
                  <ViewButton
                    label="Structure"
                    active={activeView === 'structure'}
                    onClick={() => setActiveView('structure')}
                  />
                  {activeView === 'flow' && currentFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setCurrentFilter('all')}
                      style={secondaryButtonStyle}
                    >
                      Show all screens
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  borderRadius: '14px',
                  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
                  background: '#09090b',
                  overflow: 'hidden',
                }}
              >
                {activeView === 'structure' ? (
                  <StructureTree
                    routes={structureRoutes}
                    selectedRouteId={activeSelectedRouteId}
                    onSelectRoute={setSelectedRouteId}
                  />
                ) : !graphData || graphData.routes.length === 0 ? (
                  <div
                    style={{
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      padding: '24px',
                      color: DEFAULT_THEME.textColor,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gap: '12px',
                        maxWidth: '360px',
                        textAlign: 'center',
                      }}
                    >
                      <h3 style={{ margin: 0, color: '#f4f4f5', fontSize: '20px' }}>
                        No map yet
                      </h3>
                      <p style={{ margin: 0, color: '#a1a1aa', lineHeight: 1.6 }}>
                        Run `npx agentux scan` and load `public/agentux.json`, or navigate your app to
                        let runtime capture build the first flow.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleRunProjectStructure}
                          style={secondaryButtonStyle}
                        >
                          Load agentux.json
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyScanCommand}
                          style={secondaryButtonStyle}
                        >
                          Copy npx agentux scan
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <AppMapCanvas
                    key={`${relayoutKey}-${currentFilter}`}
                    data={graphData}
                    insights={insights!}
                    selectedRouteId={selectedCanvasRouteId}
                    onRouteSelect={setSelectedRouteId}
                    edgeStatesById={graphView?.edgeStatesById}
                    canvasEditMode={canvasEditMode}
                    onCanvasConnect={handleCanvasConnect}
                    onCanvasEdgeToggle={handleCanvasEdgeToggle}
                  />
                )}
              </div>
            </div>
          </div>

          {insights && mergedData && (
            <RouteDetailsPanel
              details={selectedRouteDetails}
              insights={insights}
              onInspectFirstVisible={handleInspectFirstVisible}
              visibleRouteCount={graphData?.routes.length ?? 0}
              routes={mergedData.routes}
              journey={activeJourney}
              journeyRouteState={selectedJourneyRouteState}
              onCreateJourneyDraft={handleCreateJourneyDraft}
              onToggleJourneyBoundary={handleToggleJourneyBoundary}
              onToggleJourneyEdgeChange={handleToggleJourneyEdgeChange}
            />
          )}
        </div>
      </Modal>
    </>
  );
}

function formatDataSourceLabel(status: DataSourceStatus): string {
  switch (status) {
    case 'static-plus-runtime':
      return 'Static + Runtime';
    case 'static-only':
      return 'Static only';
    case 'no-data':
      return 'No data yet';
    default:
      return 'Runtime only';
  }
}

function PanelToggleButton({
  label,
  meta,
  isOpen,
  onClick,
}: {
  label: string;
  meta: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={onClick}
      style={{
        display: 'grid',
        gap: '4px',
        minWidth: 220,
        padding: '10px 12px',
        borderRadius: '12px',
        border: `1px solid ${isOpen ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
        background: isOpen ? 'rgba(99, 102, 241, 0.12)' : '#111113',
        color: DEFAULT_THEME.textColor,
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#a1a1aa', fontSize: '11px', lineHeight: 1.4 }}>{meta}</span>
    </button>
  );
}

function ViewButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: '36px',
        padding: '0 12px',
        borderRadius: '999px',
        border: `1px solid ${active ? DEFAULT_THEME.accentColor : DEFAULT_THEME.nodeBorderColor}`,
        background: active ? DEFAULT_THEME.accentColor : '#18181b',
        color: active ? '#ffffff' : '#d4d4d8',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: '10px',
  border: `1px solid ${DEFAULT_THEME.nodeBorderColor}`,
  background: '#18181b',
  color: '#f4f4f5',
  fontSize: '12px',
  fontWeight: 600,
};
