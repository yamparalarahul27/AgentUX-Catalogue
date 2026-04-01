import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { User } from '@supabase/supabase-js';
import type { Flow, ScreenshotNode, Connection } from '../types';
import { supabase } from '../lib/supabase';
import {
  CANVAS_THEME,
  buildFlowElements,
} from '../lib/canvas-graph';
import {
  applyGraphSnapshot,
  createGraphSnapshot,
  type GraphSnapshot,
} from '../lib/canvas-history';
import { useCanvasNodeEvents } from '../hooks/use-canvas-node-events';
import { useCanvasActions } from '../hooks/use-canvas-actions';
import { ScreenshotNodeComponent } from './ScreenshotNode';
import { ConnectionEdgeComponent } from './ConnectionEdge';
import { Toolbar, type ToolMode } from './Toolbar';
import { UploadZone } from './UploadZone';
import { FlowInput } from './FlowInput';
import { EdgePopup } from './EdgePopup';
import { Toast } from './Toast';
import { CataloguePicker } from './CataloguePicker';
import { CompareModal } from './CompareModal';
import { MobileFlowView } from './MobileFlowView';
import { ConfirmModal } from './ConfirmModal';

const nodeTypes = { screenshotNode: ScreenshotNodeComponent };
const edgeTypes = { connectionEdge: ConnectionEdgeComponent };

const UNDO_HISTORY_LIMIT = 60;
const AUTO_REFRESH_INTERVAL_MS = 3000;
const LOCAL_EDIT_LOCK_MS = 4000;

interface CanvasProps {
  user: User;
}

interface LoadFlowOptions {
  resetUndo?: boolean;
  showLoading?: boolean;
  preserveViewport?: boolean;
}

export function Canvas({ user }: CanvasProps) {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  const navigate = useNavigate();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showFlowInput, setShowFlowInput] = useState(false);
  const [showCataloguePicker, setShowCataloguePicker] = useState(false);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [relayoutKey, setRelayoutKey] = useState(0);

  const [toolMode, setToolMode] = useState<ToolMode>('pointer');
  const [selectedEdge, setSelectedEdge] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const undoStackRef = useRef<GraphSnapshot[]>([]);
  const applyingUndoRef = useRef(false);
  const localEditUntilRef = useRef(0);
  const lastRemoteUpdatedAtRef = useRef<string | null>(null);

  const markLocalEdit = useCallback(() => {
    localEditUntilRef.current = Date.now() + LOCAL_EDIT_LOCK_MS;
  }, []);

  const resetUndoHistory = useCallback(() => {
    undoStackRef.current = [];
    setUndoDepth(0);
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    if (!flowId || !projectId || applyingUndoRef.current) return;

    const snapshot = createGraphSnapshot(screenshots, connections);
    const nextStack = [...undoStackRef.current, snapshot].slice(-UNDO_HISTORY_LIMIT);

    undoStackRef.current = nextStack;
    setUndoDepth(nextStack.length);
  }, [connections, flowId, projectId, screenshots]);

  const touchFlow = useCallback(async () => {
    if (!flowId) return;

    const stamp = new Date().toISOString();
    lastRemoteUpdatedAtRef.current = stamp;

    await supabase
      .from('flows')
      .update({ updated_at: stamp })
      .eq('id', flowId);
  }, [flowId]);

  const loadFlowData = useCallback(
    async (options?: LoadFlowOptions) => {
      if (!flowId) return;

      const { resetUndo = true, showLoading = true, preserveViewport = false } = options || {};
      const previousViewport =
        preserveViewport && reactFlowRef.current
          ? reactFlowRef.current.getViewport()
          : null;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const [flowRes, screenshotRes, connectionRes] = await Promise.all([
          supabase.from('flows').select('*').eq('id', flowId).single(),
          supabase.from('screenshots').select('*').eq('flow_id', flowId).order('created_at'),
          supabase.from('connections').select('*').eq('flow_id', flowId),
        ]);

        if (flowRes.error) throw flowRes.error;
        if (screenshotRes.error) throw screenshotRes.error;
        if (connectionRes.error) throw connectionRes.error;

        if (flowRes.data) {
          setFlow(flowRes.data);
          lastRemoteUpdatedAtRef.current = flowRes.data.updated_at;
        }

        const screenshotRows = (screenshotRes.data || []) as ScreenshotNode[];
        const screenshotsWithUrls = screenshotRows.map((item) => ({
          ...item,
          image_url: item.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(item.storage_path).data.publicUrl
            : '',
        }));

        setScreenshots(screenshotsWithUrls);
        setConnections((connectionRes.data || []) as Connection[]);

        if (resetUndo) {
          resetUndoHistory();
        }

        if (previousViewport && reactFlowRef.current) {
          window.requestAnimationFrame(() => {
            reactFlowRef.current?.setViewport(previousViewport, { duration: 0 });
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load flow data';
        setToast({ message, type: 'error' });
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [flowId, resetUndoHistory],
  );

  useEffect(() => {
    if (!flowId) return;
    void loadFlowData({ resetUndo: true });
  }, [flowId, loadFlowData]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(screenshots, connections),
    [connections, relayoutKey, screenshots],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const screenshotKey = screenshots
    .map((item) => item.id)
    .sort()
    .join(',');

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, relayoutKey, screenshotKey, setNodes]);

  const { compareData, setCompareData } = useCanvasNodeEvents({
    supabase,
    flowId,
    projectId,
    userId: user.id,
    touchFlow,
    setScreenshots,
    setConnections,
    setNodes,
    setEdges,
    setToast,
    pushUndoSnapshot,
    markLocalEdit,
  });

  const handleUndo = useCallback(async () => {
    if (!flowId || !projectId || applyingUndoRef.current) return;
    if (undoStackRef.current.length === 0) return;

    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    const nextStack = undoStackRef.current.slice(0, -1);
    undoStackRef.current = nextStack;
    setUndoDepth(nextStack.length);

    applyingUndoRef.current = true;
    markLocalEdit();

    try {
      const restored = await applyGraphSnapshot({
        supabase,
        flowId,
        projectId,
        currentScreenshots: screenshots,
        snapshot,
      });

      setScreenshots(restored.screenshots);
      setConnections(restored.connections);
      setRelayoutKey((value) => value + 1);
      await touchFlow();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Undo failed';
      setToast({ message: `Undo failed: ${message}`, type: 'error' });
    } finally {
      applyingUndoRef.current = false;
    }
  }, [flowId, markLocalEdit, projectId, screenshots, touchFlow]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void handleUndo();
        return;
      }

      if (event.key === 'h' || event.key === 'H') setToolMode('hand');
      if (event.key === 'v' || event.key === 'V') setToolMode('pointer');
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo]);

  useEffect(() => {
    if (!flowId) return;

    let cancelled = false;
    let inFlight = false;

    const intervalId = window.setInterval(async () => {
      if (cancelled || inFlight || loading || applyingUndoRef.current) return;
      if (Date.now() < localEditUntilRef.current) return;

      inFlight = true;

      try {
        const { data, error } = await supabase
          .from('flows')
          .select('updated_at')
          .eq('id', flowId)
          .single();

        if (error || !data?.updated_at) return;
        if (data.updated_at === lastRemoteUpdatedAtRef.current) return;

        await loadFlowData({ resetUndo: true, showLoading: false, preserveViewport: true });
        if (!cancelled) {
          setToast({ message: 'Canvas auto-refreshed with latest updates', type: 'info' });
        }
      } finally {
        inFlight = false;
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [flowId, loadFlowData, loading]);

  const {
    handleNodesChange,
    handleConnect,
    handleEdgeClick,
    handleEdgeArrowChange,
    handleEdgeLabelChange,
    handleEdgeDelete,
    handleEdgeInsertPlaceholder,
    handleFilesSelected,
    handleAddFromCatalogue,
    handleFlowInsert,
    handleAddPlaceholderNode,
    handleCanvasDrop,
    handleCanvasDragOver,
    handleRelayout,
    handleBulkDeleteNodes,
    handleExport,
  } = useCanvasActions({
    flowId,
    projectId,
    userId: user.id,
    flow,
    screenshots,
    connections,
    nodes,
    edges,
    selectedEdge,
    selectedNodeIds,
    onNodesChange,
    pushUndoSnapshot,
    markLocalEdit,
    touchFlow,
    saveTimeoutRef: saveTimeout,
    setScreenshots,
    setConnections,
    setNodes,
    setEdges,
    setSelectedNodeIds,
    setSelectedEdge,
    setShowUpload,
    setShowFlowInput,
    setShowCataloguePicker,
    setShowBulkDeleteConfirm,
    setUploading,
    setToast,
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading flow...</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="loading-screen">
        <p>Flow not found.</p>
        <button className="btn-primary" onClick={() => navigate(`/project/${projectId}`)}>
          Back to Flows
        </button>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileFlowView
        project={{
          id: flow.project_id,
          name: flow.name,
          user_id: '',
          primary_group: null,
          vs_groups: null,
          created_at: '',
          updated_at: '',
        }}
        screenshots={screenshots}
        connections={connections}
        onBack={() => navigate(`/project/${projectId}`)}
        onExport={handleExport}
      />
    );
  }

  const isHand = toolMode === 'hand';
  const selectedConnection = selectedEdge
    ? connections.find((item) => item.id === selectedEdge.edgeId)
    : null;

  return (
    <div className="canvas-page">
      <Toolbar
        flowName={flow.name}
        screenshotCount={screenshots.length}
        connectionCount={connections.length}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        onUploadClick={() => setShowUpload(true)}
        onCatalogueAdd={() => setShowCataloguePicker(true)}
        onAddFlow={() => setShowFlowInput(true)}
        onAddPlaceholder={handleAddPlaceholderNode}
        canUndo={undoDepth > 0}
        onUndo={() => void handleUndo()}
        onRelayout={handleRelayout}
        onExport={handleExport}
        onBack={() => navigate(`/project/${projectId}`)}
      />

      <div
        className={`canvas-container ${isHand ? 'canvas-hand' : ''}`}
        onDrop={handleCanvasDrop}
        onDragOver={handleCanvasDragOver}
      >
        {screenshots.length === 0 ? (
          <div className="canvas-empty">
            <UploadZone onFilesSelected={handleFilesSelected} disabled={uploading} />
            <p className="canvas-empty-hint">
              Tip: Start with placeholder nodes, then click them later to attach screenshots.
            </p>
            <div className="canvas-empty-actions">
              <button className="btn-secondary" onClick={() => setShowCataloguePicker(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Add from Catalogue
              </button>
              <button className="btn-secondary" onClick={() => setShowFlowInput(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Text Flow
              </button>
              <button className="btn-secondary" onClick={() => void handleAddPlaceholderNode()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                </svg>
                Add Placeholder Node
              </button>
            </div>
          </div>
        ) : (
          <>
            <ReactFlow
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={isHand ? undefined : handleConnect}
              onEdgeClick={
                isHand ? undefined : (event, edge) => handleEdgeClick(event, edge, toolMode)
              }
              onPaneClick={() => {
                setSelectedEdge(null);
                setSelectedNodeIds(new Set());
              }}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={!isHand}
              nodesConnectable={!isHand}
              elementsSelectable={!isHand}
              panOnDrag={isHand}
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.1}
              maxZoom={2}
              defaultEdgeOptions={{ type: 'connectionEdge' }}
              style={{ background: CANVAS_THEME.bg }}
            >
              <Controls
                style={{
                  background: CANVAS_THEME.nodeBg,
                  border: `1px solid ${CANVAS_THEME.nodeBorder}`,
                  borderRadius: '8px',
                }}
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color={CANVAS_THEME.nodeBorder}
              />
            </ReactFlow>

            {selectedEdge && selectedConnection && (
              <EdgePopup
                x={selectedEdge.x}
                y={selectedEdge.y}
                label={selectedConnection.label || ''}
                arrowDirection={selectedConnection.arrow_direction || 'forward'}
                onChangeArrow={handleEdgeArrowChange}
                onChangeLabel={handleEdgeLabelChange}
                onInsertPlaceholder={() => void handleEdgeInsertPlaceholder()}
                onDelete={handleEdgeDelete}
                onClose={() => setSelectedEdge(null)}
              />
            )}

            {showUpload && (
              <div className="canvas-upload-overlay" onClick={() => setShowUpload(false)}>
                <div className="canvas-upload-modal" onClick={(event) => event.stopPropagation()}>
                  <UploadZone onFilesSelected={handleFilesSelected} disabled={uploading} />
                </div>
              </div>
            )}

            {showFlowInput && (
              <FlowInput
                onInsert={handleFlowInsert}
                onCancel={() => setShowFlowInput(false)}
              />
            )}
          </>
        )}

        {screenshots.length === 0 && showFlowInput && (
          <FlowInput
            onInsert={handleFlowInsert}
            onCancel={() => setShowFlowInput(false)}
          />
        )}

        {selectedNodeIds.size > 1 && (
          <div className="canvas-bulk-bar">
            <span className="canvas-bulk-count">{selectedNodeIds.size} selected</span>
            <button
              className="canvas-bulk-btn canvas-bulk-btn-danger"
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete
            </button>
            <button
              className="canvas-bulk-btn"
              onClick={() => setSelectedNodeIds(new Set())}
            >
              Clear
            </button>
          </div>
        )}

        {showBulkDeleteConfirm && (
          <ConfirmModal
            title={`Delete ${selectedNodeIds.size} Screenshots`}
            message={`This will permanently delete ${selectedNodeIds.size} screenshots and their connections from this flow.`}
            onConfirm={() => void handleBulkDeleteNodes()}
            onCancel={() => setShowBulkDeleteConfirm(false)}
          />
        )}

        {showCataloguePicker && projectId && flowId && (
          <CataloguePicker
            projectId={projectId}
            flowId={flowId}
            userId={user.id}
            onAdd={handleAddFromCatalogue}
            onClose={() => setShowCataloguePicker(false)}
          />
        )}

        {uploading && (
          <div className="canvas-uploading">
            <div className="loading-spinner" />
            Uploading screenshots...
          </div>
        )}

        {compareData && (
          <CompareModal
            screenshotId={compareData.id}
            screenshotUrl={compareData.imageUrl}
            screenshotName={compareData.name}
            projectId={projectId || ''}
            userId={user.id}
            onClose={() => setCompareData(null)}
          />
        )}

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
}
