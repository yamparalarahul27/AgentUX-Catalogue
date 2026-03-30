import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection as FlowConnection,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { User } from '@supabase/supabase-js';
import type { Flow, ScreenshotNode, Connection } from '../types';
import { supabase } from '../lib/supabase';
import { parseScreenshotName } from '../lib/naming';
import { autoConnect } from '../lib/auto-connect';
import { generateDesignerMarkdown } from '../lib/export-markdown';
import { ScreenshotNodeComponent } from './ScreenshotNode';
import { ConnectionEdgeComponent } from './ConnectionEdge';
import { Toolbar, type ToolMode } from './Toolbar';
import { UploadZone } from './UploadZone';
import { FlowInput } from './FlowInput';
import { EdgePopup, type ArrowDirection } from './EdgePopup';
import { Toast } from './Toast';
import { CompareModal } from './CompareModal';
import { MobileFlowView } from './MobileFlowView';

const THEME = {
  accent: '#6366f1',
  bg: '#0f0f10',
  nodeBg: '#18181b',
  nodeBorder: '#27272a',
  text: '#e4e4e7',
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 200;
const NODE_SEP = 80;
const RANK_SEP = 120;

const nodeTypes = { screenshotNode: ScreenshotNodeComponent };
const edgeTypes = { connectionEdge: ConnectionEdgeComponent };

interface CanvasProps {
  user: User;
}

function layoutElements(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      };
    }),
    edges,
  };
}

function buildEdgeMarkers(dir: ArrowDirection) {
  const markers: { markerEnd?: { type: MarkerType; color: string }; markerStart?: { type: MarkerType; color: string } } = {};
  if (dir === 'forward' || dir === 'both') {
    markers.markerEnd = { type: MarkerType.ArrowClosed, color: THEME.accent };
  }
  if (dir === 'backward' || dir === 'both') {
    markers.markerStart = { type: MarkerType.ArrowClosed, color: THEME.accent };
  }
  return markers;
}

function buildFlowElements(screenshots: ScreenshotNode[], connections: Connection[]) {
  const rawNodes: Node[] = screenshots.map((s) => ({
    id: s.id,
    type: 'screenshotNode',
    position: s.position_x !== null && s.position_y !== null
      ? { x: s.position_x, y: s.position_y }
      : { x: 0, y: 0 },
    data: {
      label: s.name,
      imageUrl: s.image_url || '',
      group: s.group,
      sequence: s.sequence,
    },
  }));

  const nodeIds = new Set(screenshots.map((s) => s.id));
  const rawEdges: Edge[] = connections
    .filter((c) => nodeIds.has(c.source_id) && nodeIds.has(c.target_id))
    .map((c) => ({
      id: c.id,
      source: c.source_id,
      target: c.target_id,
      sourceHandle: c.source_handle || undefined,
      targetHandle: c.target_handle || undefined,
      type: 'connectionEdge',
      animated: c.type === 'auto',
      ...buildEdgeMarkers(c.arrow_direction || 'forward'),
      data: { type: c.type, label: c.label || '' },
    }));

  const hasPositions = screenshots.some((s) => s.position_x !== null && s.position_y !== null);
  if (hasPositions) {
    return { nodes: rawNodes, edges: rawEdges };
  }
  return layoutElements(rawNodes, rawEdges);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [relayoutKey, setRelayoutKey] = useState(0);
  const [toolMode, setToolMode] = useState<ToolMode>('pointer');
  const [selectedEdge, setSelectedEdge] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [compareData, setCompareData] = useState<{ id: string; imageUrl: string; name: string } | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile detection
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Keyboard shortcuts for tool modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') setToolMode('hand');
      if (e.key === 'v' || e.key === 'V') setToolMode('pointer');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load flow data
  useEffect(() => {
    if (!flowId) return;
    loadFlowData();
  }, [flowId]);

  async function loadFlowData() {
    setLoading(true);

    const [flowRes, screenshotRes, connectionRes] = await Promise.all([
      supabase.from('flows').select('*').eq('id', flowId).single(),
      supabase.from('screenshots').select('*').eq('flow_id', flowId).order('created_at'),
      supabase.from('connections').select('*').eq('flow_id', flowId),
    ]);

    if (flowRes.data) setFlow(flowRes.data);

    if (screenshotRes.data) {
      const withUrls = screenshotRes.data.map((s: ScreenshotNode) => ({
        ...s,
        image_url: s.storage_path
          ? supabase.storage.from('screenshots').getPublicUrl(s.storage_path).data.publicUrl
          : '',
      }));
      setScreenshots(withUrls);
    }

    if (connectionRes.data) setConnections(connectionRes.data);
    setLoading(false);
  }

  // Build React Flow elements
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(screenshots, connections),
    [screenshots, connections, relayoutKey],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Listen for delete-screenshot events
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id } = (evt as CustomEvent).detail;
      supabase.from('connections').delete().or(`source_id.eq.${id},target_id.eq.${id}`).then(() => {
        supabase.from('screenshots').delete().eq('id', id).then(() => {});
      });
      setScreenshots((prev) => prev.filter((s) => s.id !== id));
      setConnections((prev) => prev.filter((c) => c.source_id !== id && c.target_id !== id));
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    };
    window.addEventListener('delete-screenshot', handler);
    return () => window.removeEventListener('delete-screenshot', handler);
  }, [setNodes, setEdges]);

  // Listen for rename-screenshot events
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id, name } = (evt as CustomEvent).detail;
      supabase.from('screenshots').update({ name }).eq('id', id).then(() => {});
      setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    };
    window.addEventListener('rename-screenshot', handler);
    return () => window.removeEventListener('rename-screenshot', handler);
  }, []);

  // Listen for rename-screenshot-group events
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id, group } = (evt as CustomEvent).detail;
      supabase.from('screenshots').update({ group }).eq('id', id).then(() => {});
      setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, group } : s)));
    };
    window.addEventListener('rename-screenshot-group', handler);
    return () => window.removeEventListener('rename-screenshot-group', handler);
  }, []);

  // Listen for attach-screenshot-image events
  useEffect(() => {
    const handler = async (evt: Event) => {
      const { id, file } = (evt as CustomEvent).detail;
      if (!flowId || !projectId) return;

      const safeName = file.name.replace(/\s+/g, '-');
      const storagePath = `${user.id}/${projectId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        setToast({ message: `Image attach failed: ${uploadError.message}`, type: 'error' });
        return;
      }

      const imageUrl = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath).data.publicUrl;

      await supabase
        .from('screenshots')
        .update({ storage_path: storagePath, file_name: file.name })
        .eq('id', id);

      setScreenshots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, storage_path: storagePath, file_name: file.name, image_url: imageUrl } : s)),
      );
    };
    window.addEventListener('attach-screenshot-image', handler);
    return () => window.removeEventListener('attach-screenshot-image', handler);
  }, [flowId, projectId, user.id]);

  // Listen for compare-screenshot events
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id, imageUrl, name } = (evt as CustomEvent).detail;
      setCompareData({ id, imageUrl, name });
    };
    window.addEventListener('compare-screenshot', handler);
    return () => window.removeEventListener('compare-screenshot', handler);
  }, []);

  // Save position changes (debounced)
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      const removeChanges = changes.filter((c) => c.type === 'remove');
      for (const change of removeChanges) {
        supabase.from('connections').delete().or(`source_id.eq.${change.id},target_id.eq.${change.id}`).then(() => {
          supabase.from('screenshots').delete().eq('id', change.id).then(() => {});
        });
        setScreenshots((prev) => prev.filter((s) => s.id !== change.id));
        setConnections((prev) => prev.filter((c) => c.source_id !== change.id && c.target_id !== change.id));
      }

      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const positionChanges = changes.filter(
          (c) => c.type === 'position' && 'position' in c && c.position,
        );
        for (const change of positionChanges) {
          if ('position' in change && change.position) {
            supabase
              .from('screenshots')
              .update({ position_x: change.position.x, position_y: change.position.y })
              .eq('id', change.id)
              .then(() => {});
          }
        }
      }, 500);
    },
    [onNodesChange],
  );

  // Manual edge drawing
  const handleConnect = useCallback(
    async (connection: FlowConnection) => {
      if (!flowId || !projectId || !connection.source || !connection.target) return;

      const { data } = await supabase
        .from('connections')
        .insert({
          project_id: projectId,
          flow_id: flowId,
          source_id: connection.source,
          target_id: connection.target,
          source_handle: connection.sourceHandle || null,
          target_handle: connection.targetHandle || null,
          type: 'manual',
        })
        .select()
        .single();

      if (data) {
        setConnections((prev) => [...prev, data]);
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: data.id,
              type: 'connectionEdge',
              markerEnd: { type: MarkerType.ArrowClosed, color: THEME.accent },
              data: { type: 'manual', label: '' },
            },
            eds,
          ),
        );
      }
    },
    [flowId, projectId, setEdges],
  );

  // Edge click — show popup in pointer mode
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, _edge: Edge) => {
      if (toolMode !== 'pointer') return;
      setSelectedEdge({
        edgeId: _edge.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [toolMode],
  );

  // Edge popup actions
  function handleEdgeArrowChange(dir: ArrowDirection) {
    if (!selectedEdge) return;
    supabase.from('connections').update({ arrow_direction: dir }).eq('id', selectedEdge.edgeId).then(() => {});
    setConnections((prev) => prev.map((c) => (c.id === selectedEdge.edgeId ? { ...c, arrow_direction: dir } : c)));
  }

  function handleEdgeLabelChange(label: string) {
    if (!selectedEdge) return;
    supabase.from('connections').update({ label: label || null }).eq('id', selectedEdge.edgeId).then(() => {});
    setConnections((prev) => prev.map((c) => (c.id === selectedEdge.edgeId ? { ...c, label: label || null } : c)));
  }

  function handleEdgeDelete() {
    if (!selectedEdge) return;
    supabase.from('connections').delete().eq('id', selectedEdge.edgeId).then(() => {});
    setConnections((prev) => prev.filter((c) => c.id !== selectedEdge.edgeId));
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.edgeId));
    setSelectedEdge(null);
  }

  // Upload screenshots
  async function handleFilesSelected(files: File[]) {
    if (!flowId || !projectId) return;
    setUploading(true);
    setShowUpload(false);

    const newScreenshots: ScreenshotNode[] = [];

    for (const file of files) {
      const parsed = parseScreenshotName(file.name);
      const safeName = file.name.replace(/\s+/g, '-');
      const storagePath = `${user.id}/${projectId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        setToast({ message: `Upload failed: ${uploadError.message}`, type: 'error' });
        continue;
      }

      const imageUrl = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath).data.publicUrl;

      const { data, error } = await supabase
        .from('screenshots')
        .insert({
          project_id: projectId,
          flow_id: flowId,
          name: parsed.name,
          file_name: file.name,
          storage_path: storagePath,
          sequence: parsed.sequence,
          group: parsed.group,
        })
        .select()
        .single();

      if (data && !error) {
        newScreenshots.push({ ...data, image_url: imageUrl });
      }
    }

    if (newScreenshots.length > 0) {
      setScreenshots((prev) => [...prev, ...newScreenshots]);
    }

    await supabase.from('flows').update({ updated_at: new Date().toISOString() }).eq('id', flowId);
    setUploading(false);
  }

  // Insert flow from text
  async function handleFlowInsert(text: string) {
    if (!flowId || !projectId) return;
    setShowFlowInput(false);

    const steps = text.split('->').map((s) => s.trim()).filter(Boolean);
    if (steps.length === 0) return;

    const newScreenshots: ScreenshotNode[] = [];

    for (let i = 0; i < steps.length; i++) {
      const { data, error } = await supabase
        .from('screenshots')
        .insert({
          project_id: projectId,
          flow_id: flowId,
          name: steps[i],
          file_name: '',
          storage_path: '',
          sequence: i + 1,
          group: null,
        })
        .select()
        .single();

      if (data && !error) {
        newScreenshots.push({ ...data, image_url: '' });
      }
    }

    const newConnections: Connection[] = [];
    for (let i = 0; i < newScreenshots.length - 1; i++) {
      const { data, error } = await supabase
        .from('connections')
        .insert({
          project_id: projectId,
          flow_id: flowId,
          source_id: newScreenshots[i].id,
          target_id: newScreenshots[i + 1].id,
          type: 'manual',
        })
        .select()
        .single();

      if (data && !error) {
        newConnections.push(data);
      }
    }

    setScreenshots((prev) => [...prev, ...newScreenshots]);
    setConnections((prev) => [...prev, ...newConnections]);
    setRelayoutKey((k) => k + 1);

    await supabase.from('flows').update({ updated_at: new Date().toISOString() }).eq('id', flowId);
  }

  // Auto-connect
  async function handleAutoConnect() {
    if (!flowId || !projectId) return;

    await supabase.from('connections').delete().eq('flow_id', flowId).eq('type', 'auto');

    const newConnections = autoConnect(screenshots, projectId);

    if (newConnections.length > 0) {
      const { data } = await supabase
        .from('connections')
        .insert(
          newConnections.map((c) => ({
            project_id: c.project_id,
            flow_id: flowId,
            source_id: c.source_id,
            target_id: c.target_id,
            type: c.type,
            label: c.label,
          })),
        )
        .select();

      if (data) {
        setConnections((prev) => [...prev.filter((c) => c.type !== 'auto'), ...data]);
      }
    } else {
      setConnections((prev) => prev.filter((c) => c.type !== 'auto'));
    }

    setRelayoutKey((k) => k + 1);
  }

  // Canvas drop to create node from image
  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      setToast({ message: 'Only image files can be dropped on the canvas', type: 'error' });
      return;
    }
    handleFilesSelected(files);
  }

  function handleCanvasDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  // Re-layout
  function handleRelayout() {
    const laid = layoutElements(nodes, edges);
    setNodes(laid.nodes);
    setEdges(laid.edges);
  }

  // Export markdown
  async function handleExport() {
    if (!flow) return;
    const project = { id: flow.project_id, name: flow.name, user_id: '', created_at: '', updated_at: '' };
    const markdown = generateDesignerMarkdown(project, screenshots, connections);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

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
        <button className="btn-primary" onClick={() => navigate(`/project/${projectId}`)}>Back to Flows</button>
      </div>
    );
  }

  // Mobile: read-only view
  if (isMobile) {
    return (
      <MobileFlowView
        project={{ id: flow.project_id, name: flow.name, user_id: '', created_at: '', updated_at: '' }}
        screenshots={screenshots}
        connections={connections}
        onBack={() => navigate(`/project/${projectId}`)}
        onExport={handleExport}
      />
    );
  }

  const isHand = toolMode === 'hand';
  const selectedConn = selectedEdge ? connections.find((c) => c.id === selectedEdge.edgeId) : null;

  return (
    <div className="canvas-page">
      <Toolbar
        flowName={flow.name}
        screenshotCount={screenshots.length}
        connectionCount={connections.length}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        onUploadClick={() => setShowUpload(true)}
        onAddFlow={() => setShowFlowInput(true)}
        onAutoConnect={handleAutoConnect}
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
              Tip: Name files like <code>01-auth-login.png</code> for auto-connection
            </p>
          </div>
        ) : (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={isHand ? undefined : handleConnect}
              onEdgeClick={isHand ? undefined : handleEdgeClick}
              onPaneClick={() => setSelectedEdge(null)}
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
              style={{ background: THEME.bg }}
            >
              <Controls
                style={{
                  background: THEME.nodeBg,
                  border: `1px solid ${THEME.nodeBorder}`,
                  borderRadius: '8px',
                }}
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color={THEME.nodeBorder}
              />
            </ReactFlow>

            {selectedEdge && selectedConn && (
              <EdgePopup
                x={selectedEdge.x}
                y={selectedEdge.y}
                label={selectedConn.label || ''}
                arrowDirection={selectedConn.arrow_direction || 'forward'}
                onChangeArrow={handleEdgeArrowChange}
                onChangeLabel={handleEdgeLabelChange}
                onDelete={handleEdgeDelete}
                onClose={() => setSelectedEdge(null)}
              />
            )}

            {showUpload && (
              <div className="canvas-upload-overlay" onClick={() => setShowUpload(false)}>
                <div className="canvas-upload-modal" onClick={(e) => e.stopPropagation()}>
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
