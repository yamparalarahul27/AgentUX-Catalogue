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
import type { Project, ScreenshotNode, Connection } from '../types';
import { supabase } from '../lib/supabase';
import { parseScreenshotName } from '../lib/naming';
import { autoConnect } from '../lib/auto-connect';
import { generateDesignerMarkdown } from '../lib/export-markdown';
import { ScreenshotNodeComponent } from './ScreenshotNode';
import { ConnectionEdgeComponent } from './ConnectionEdge';
import { Toolbar } from './Toolbar';
import { UploadZone } from './UploadZone';
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
      type: 'connectionEdge',
      animated: c.type === 'auto',
      markerEnd: { type: MarkerType.ArrowClosed, color: THEME.accent },
      data: { type: c.type },
    }));

  // Only apply dagre layout if no saved positions
  const hasPositions = screenshots.some((s) => s.position_x !== null && s.position_y !== null);
  if (hasPositions) {
    return { nodes: rawNodes, edges: rawEdges };
  }
  return layoutElements(rawNodes, rawEdges);
}

export function Canvas({ user }: CanvasProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [relayoutKey, setRelayoutKey] = useState(0);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile detection
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Load project data
  useEffect(() => {
    if (!projectId) return;
    loadProjectData();
  }, [projectId]);

  async function loadProjectData() {
    setLoading(true);

    const [projectRes, screenshotRes, connectionRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('screenshots').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('connections').select('*').eq('project_id', projectId),
    ]);

    if (projectRes.data) setProject(projectRes.data);

    if (screenshotRes.data) {
      // Generate public URLs for images
      const withUrls = screenshotRes.data.map((s: ScreenshotNode) => ({
        ...s,
        image_url: supabase.storage.from('screenshots').getPublicUrl(s.storage_path).data.publicUrl,
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

  // Listen for delete-screenshot events from node delete buttons
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id } = (evt as CustomEvent).detail;
      // Delete from Supabase
      supabase
        .from('connections')
        .delete()
        .or(`source_id.eq.${id},target_id.eq.${id}`)
        .then(() => {
          supabase.from('screenshots').delete().eq('id', id).then(() => {});
        });
      // Delete from local state
      setScreenshots((prev) => prev.filter((s) => s.id !== id));
      setConnections((prev) => prev.filter((c) => c.source_id !== id && c.target_id !== id));
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    };
    window.addEventListener('delete-screenshot', handler);
    return () => window.removeEventListener('delete-screenshot', handler);
  }, [setNodes, setEdges]);

  // Listen for rename-screenshot events from node inline edit
  useEffect(() => {
    const handler = (evt: Event) => {
      const { id, name } = (evt as CustomEvent).detail;
      // Update in Supabase
      supabase.from('screenshots').update({ name }).eq('id', id).then(() => {});
      // Update local state
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

  // Save position changes (debounced)
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Handle node removals — delete from Supabase
      const removeChanges = changes.filter((c) => c.type === 'remove');
      for (const change of removeChanges) {
        // Delete associated connections first, then the screenshot
        supabase
          .from('connections')
          .delete()
          .or(`source_id.eq.${change.id},target_id.eq.${change.id}`)
          .then(() => {
            supabase.from('screenshots').delete().eq('id', change.id).then(() => {});
          });

        // Also remove from local screenshots state
        setScreenshots((prev) => prev.filter((s) => s.id !== change.id));
        // Remove associated connections from local state
        setConnections((prev) =>
          prev.filter((c) => c.source_id !== change.id && c.target_id !== change.id),
        );
      }

      // Debounce position saves
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const positionChanges = changes.filter(
          (c) => c.type === 'position' && 'position' in c && c.position,
        );
        for (const change of positionChanges) {
          if ('position' in change && change.position) {
            supabase
              .from('screenshots')
              .update({
                position_x: change.position.x,
                position_y: change.position.y,
              })
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
      if (!projectId || !connection.source || !connection.target) return;

      const { data } = await supabase
        .from('connections')
        .insert({
          project_id: projectId,
          source_id: connection.source,
          target_id: connection.target,
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
              data: { type: 'manual' },
            },
            eds,
          ),
        );
      }
    },
    [projectId, setEdges],
  );

  // Delete edge on click
  const handleEdgeClick = useCallback(
    async (_: React.MouseEvent, edge: Edge) => {
      if (!confirm('Delete this connection?')) return;
      await supabase.from('connections').delete().eq('id', edge.id);
      setConnections((prev) => prev.filter((c) => c.id !== edge.id));
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [setEdges],
  );

  // Upload screenshots
  async function handleFilesSelected(files: File[]) {
    if (!projectId) return;
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
        console.error('Upload failed:', uploadError);
        continue;
      }

      const imageUrl = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath).data.publicUrl;

      const { data, error } = await supabase
        .from('screenshots')
        .insert({
          project_id: projectId,
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

    // Update project timestamp
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    setUploading(false);
  }

  // Auto-connect
  async function handleAutoConnect() {
    if (!projectId) return;

    // Delete existing auto connections
    await supabase
      .from('connections')
      .delete()
      .eq('project_id', projectId)
      .eq('type', 'auto');

    const newConnections = autoConnect(screenshots, projectId);

    if (newConnections.length > 0) {
      const { data } = await supabase
        .from('connections')
        .insert(
          newConnections.map((c) => ({
            project_id: c.project_id,
            source_id: c.source_id,
            target_id: c.target_id,
            type: c.type,
            label: c.label,
          })),
        )
        .select();

      if (data) {
        // Keep manual connections, replace auto ones
        setConnections((prev) => [
          ...prev.filter((c) => c.type !== 'auto'),
          ...data,
        ]);
      }
    } else {
      setConnections((prev) => prev.filter((c) => c.type !== 'auto'));
    }

    setRelayoutKey((k) => k + 1);
  }

  // Re-layout
  function handleRelayout() {
    const laid = layoutElements(nodes, edges);
    setNodes(laid.nodes);
    setEdges(laid.edges);
  }

  // Export markdown
  async function handleExport() {
    if (!project) return;
    const markdown = generateDesignerMarkdown(project, screenshots, connections);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // Fallback
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
        <p>Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="loading-screen">
        <p>Project not found.</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Back to Projects</button>
      </div>
    );
  }

  // Mobile: read-only view
  if (isMobile) {
    return (
      <MobileFlowView
        project={project}
        screenshots={screenshots}
        connections={connections}
        onBack={() => navigate('/')}
        onExport={handleExport}
      />
    );
  }

  return (
    <div className="canvas-page">
      <Toolbar
        projectName={project.name}
        screenshotCount={screenshots.length}
        connectionCount={connections.length}
        onUploadClick={() => setShowUpload(true)}
        onAutoConnect={handleAutoConnect}
        onRelayout={handleRelayout}
        onExport={handleExport}
        onBack={() => navigate('/')}
      />

      <div className="canvas-container">
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
              onConnect={handleConnect}
              onEdgeClick={handleEdgeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
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

            {showUpload && (
              <div className="canvas-upload-overlay" onClick={() => setShowUpload(false)}>
                <div className="canvas-upload-modal" onClick={(e) => e.stopPropagation()}>
                  <UploadZone onFilesSelected={handleFilesSelected} disabled={uploading} />
                </div>
              </div>
            )}
          </>
        )}

        {uploading && (
          <div className="canvas-uploading">
            <div className="loading-spinner" />
            Uploading screenshots...
          </div>
        )}
      </div>
    </div>
  );
}
