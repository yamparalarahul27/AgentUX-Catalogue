import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  addEdge,
  type Connection as FlowConnection,
  type Edge,
  type Node,
  type NodeChange,
  MarkerType,
} from '@xyflow/react';
import type { Flow, Connection, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { generateDesignerMarkdown } from '../lib/export-markdown';
import { CANVAS_THEME, NODE_WIDTH, RANK_SEP, layoutElements, type ArrowDirection } from '../lib/canvas-graph';
import {
  createPlaceholderNode,
  insertFlowFromText,
  insertPlaceholderBetweenConnection,
  uploadFilesToFlow,
} from '../lib/canvas-operations';

interface UseCanvasActionsParams {
  flowId?: string;
  projectId?: string;
  userId: string;
  userEmail?: string | null;
  flow: Flow | null;
  screenshots: ScreenshotNode[];
  connections: Connection[];
  nodes: Node[];
  edges: Edge[];
  selectedEdge: { edgeId: string; x: number; y: number } | null;
  selectedNodeIds: Set<string>;
  onNodesChange: (changes: NodeChange[]) => void;
  pushUndoSnapshot: () => void;
  markLocalEdit: () => void;
  touchFlow: () => Promise<void>;
  saveTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setScreenshots: Dispatch<SetStateAction<ScreenshotNode[]>>;
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEdge: Dispatch<SetStateAction<{ edgeId: string; x: number; y: number } | null>>;
  setShowUpload: Dispatch<SetStateAction<boolean>>;
  setShowFlowInput: Dispatch<SetStateAction<boolean>>;
  setShowBulkDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setToast: Dispatch<SetStateAction<{ message: string; type: 'error' | 'success' | 'info' } | null>>;
}

function getPlaceholderPosition(nodes: Node[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 120, y: 120 };
  }

  const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
  const avgY = nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length;

  return {
    x: maxX + RANK_SEP,
    y: avgY,
  };
}

function getNextPlaceholderName(screenshots: ScreenshotNode[]): string {
  const placeholderCount = screenshots.filter((item) =>
    item.name.toLowerCase().startsWith('placeholder'),
  ).length;

  return `Placeholder ${placeholderCount + 1}`;
}

export function useCanvasActions({
  flowId,
  projectId,
  userId,
  userEmail,
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
  saveTimeoutRef,
  setScreenshots,
  setConnections,
  setNodes,
  setEdges,
  setSelectedNodeIds,
  setSelectedEdge,
  setShowUpload,
  setShowFlowInput,
  setShowBulkDeleteConfirm,
  setUploading,
  setToast,
}: UseCanvasActionsParams) {
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      const selectChanges = changes.filter((change) => change.type === 'select');
      if (selectChanges.length > 0) {
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);

          for (const change of selectChanges) {
            if ('selected' in change) {
              if (change.selected) next.add(change.id);
              else next.delete(change.id);
            }
          }

          return next;
        });
      }

      const removeChanges = changes.filter((change) => change.type === 'remove');
      if (removeChanges.length > 0) {
        pushUndoSnapshot();
        markLocalEdit();

        for (const change of removeChanges) {
          supabase
            .from('connections')
            .delete()
            .or(`source_id.eq.${change.id},target_id.eq.${change.id}`)
            .then(() => {
              supabase.from('screenshots').delete().eq('id', change.id).then(() => {});
            });

          setScreenshots((prev) => prev.filter((item) => item.id !== change.id));
          setConnections((prev) =>
            prev.filter((item) => item.source_id !== change.id && item.target_id !== change.id),
          );
        }

        void touchFlow();
      }

      const positionChanges = changes.filter(
        (change) => change.type === 'position' && 'position' in change && change.position,
      );

      if (positionChanges.length === 0) return;

      markLocalEdit();

      const positionMap = new Map(
        positionChanges
          .map((change) => {
            if (!('position' in change) || !change.position) return null;
            return [change.id, change.position] as const;
          })
          .filter((entry): entry is readonly [string, { x: number; y: number }] => Boolean(entry)),
      );

      setScreenshots((prev) =>
        prev.map((item) => {
          const position = positionMap.get(item.id);
          if (!position) return item;
          return { ...item, position_x: position.x, position_y: position.y };
        }),
      );

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        for (const [id, position] of positionMap.entries()) {
          supabase
            .from('screenshots')
            .update({ position_x: position.x, position_y: position.y })
            .eq('id', id)
            .then(() => {});
        }

        void touchFlow();
      }, 500);
    },
    [
      markLocalEdit,
      onNodesChange,
      pushUndoSnapshot,
      saveTimeoutRef,
      setConnections,
      setScreenshots,
      setSelectedNodeIds,
      touchFlow,
    ],
  );

  const handleConnect = useCallback(
    async (connection: FlowConnection) => {
      if (!flowId || !projectId || !connection.source || !connection.target) return;

      pushUndoSnapshot();
      markLocalEdit();

      const { data, error } = await supabase
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

      if (error || !data) {
        setToast({ message: 'Unable to create connection', type: 'error' });
        return;
      }

      setConnections((prev) => [...prev, data as Connection]);
      setEdges((prev) =>
        addEdge(
          {
            ...connection,
            id: data.id,
            type: 'connectionEdge',
            markerEnd: { type: MarkerType.ArrowClosed, color: CANVAS_THEME.accent },
            data: { type: 'manual', label: '' },
          },
          prev,
        ),
      );

      await touchFlow();
    },
    [flowId, markLocalEdit, projectId, pushUndoSnapshot, setConnections, setEdges, setToast, touchFlow],
  );

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge, toolMode: 'pointer' | 'hand') => {
      if (toolMode !== 'pointer') return;
      setSelectedEdge({
        edgeId: edge.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [setSelectedEdge],
  );

  const handleEdgeArrowChange = useCallback(
    (direction: ArrowDirection) => {
      if (!selectedEdge) return;

      pushUndoSnapshot();
      markLocalEdit();

      supabase
        .from('connections')
        .update({ arrow_direction: direction })
        .eq('id', selectedEdge.edgeId)
        .then(() => {});

      setConnections((prev) =>
        prev.map((item) =>
          item.id === selectedEdge.edgeId ? { ...item, arrow_direction: direction } : item,
        ),
      );

      void touchFlow();
    },
    [markLocalEdit, pushUndoSnapshot, selectedEdge, setConnections, touchFlow],
  );

  const handleEdgeLabelChange = useCallback(
    (label: string) => {
      if (!selectedEdge) return;

      pushUndoSnapshot();
      markLocalEdit();

      const nextLabel = label || null;

      supabase
        .from('connections')
        .update({ label: nextLabel })
        .eq('id', selectedEdge.edgeId)
        .then(() => {});

      setConnections((prev) =>
        prev.map((item) => (item.id === selectedEdge.edgeId ? { ...item, label: nextLabel } : item)),
      );

      void touchFlow();
    },
    [markLocalEdit, pushUndoSnapshot, selectedEdge, setConnections, touchFlow],
  );

  const handleEdgeDelete = useCallback(() => {
    if (!selectedEdge) return;

    pushUndoSnapshot();
    markLocalEdit();

    supabase.from('connections').delete().eq('id', selectedEdge.edgeId).then(() => {});

    setConnections((prev) => prev.filter((item) => item.id !== selectedEdge.edgeId));
    setEdges((prev) => prev.filter((item) => item.id !== selectedEdge.edgeId));
    setSelectedEdge(null);

    void touchFlow();
  }, [markLocalEdit, pushUndoSnapshot, selectedEdge, setConnections, setEdges, setSelectedEdge, touchFlow]);

  const handleEdgeInsertPlaceholder = useCallback(async () => {
    if (!selectedEdge || !flowId || !projectId) return;

    const connection = connections.find((item) => item.id === selectedEdge.edgeId);
    if (!connection) return;

    const sourceNode = nodes.find((item) => item.id === connection.source_id);
    const targetNode = nodes.find((item) => item.id === connection.target_id);
    if (!sourceNode || !targetNode) return;

    pushUndoSnapshot();
    markLocalEdit();

    try {
      const { placeholder, createdConnections } = await insertPlaceholderBetweenConnection({
        supabase,
        userId,
        userEmail,
        projectId,
        flowId,
        connection,
        sourceNode,
        targetNode,
        placeholderName: getNextPlaceholderName(screenshots),
      });

      setScreenshots((prev) => [...prev, placeholder]);
      setConnections((prev) => [
        ...prev.filter((item) => item.id !== connection.id),
        ...createdConnections,
      ]);
      setSelectedEdge(null);

      await touchFlow();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to insert placeholder';
      setToast({ message, type: 'error' });
    }
  }, [
    connections,
    flowId,
    markLocalEdit,
    nodes,
    projectId,
    pushUndoSnapshot,
    screenshots,
    selectedEdge,
    setConnections,
    setScreenshots,
    setSelectedEdge,
    setToast,
    touchFlow,
    userId,
    userEmail,
  ]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!flowId || !projectId) return;

      pushUndoSnapshot();
      markLocalEdit();
      setUploading(true);
      setShowUpload(false);

      try {
        const { added, failed } = await uploadFilesToFlow({
          supabase,
          userId,
          userEmail,
          projectId,
          flowId,
          files,
        });

        if (added.length > 0) {
          setScreenshots((prev) => [...prev, ...added]);
          setToast({
            message: `Added ${added.length} screenshot${added.length > 1 ? 's' : ''}`,
            type: 'success',
          });
        }

        if (failed > 0) {
          setToast({
            message: `${failed} upload${failed > 1 ? 's' : ''} failed`,
            type: 'error',
          });
        }

        await touchFlow();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setToast({ message, type: 'error' });
      } finally {
        setUploading(false);
      }
    },
    [flowId, markLocalEdit, projectId, pushUndoSnapshot, setScreenshots, setShowUpload, setToast, setUploading, touchFlow, userEmail, userId],
  );

  const handleFlowInsert = useCallback(
    async (text: string) => {
      if (!flowId || !projectId) return;

      setShowFlowInput(false);
      pushUndoSnapshot();
      markLocalEdit();

      try {
        const { newScreenshots, newConnections } = await insertFlowFromText({
          supabase,
          userId,
          userEmail,
          projectId,
          flowId,
          text,
          existingScreenshots: screenshots,
          existingConnections: connections,
          currentNodes: nodes,
        });

        if (newScreenshots.length === 0 && newConnections.length === 0) {
          setToast({ message: 'No new nodes or connections were added', type: 'info' });
          return;
        }

        if (newScreenshots.length > 0) {
          setScreenshots((prev) => [...prev, ...newScreenshots]);
        }

        if (newConnections.length > 0) {
          setConnections((prev) => [...prev, ...newConnections]);
        }

        await touchFlow();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to insert flow';
        setToast({ message, type: 'error' });
      }
    },
    [
      connections,
      flowId,
      markLocalEdit,
      nodes,
      projectId,
      pushUndoSnapshot,
      screenshots,
      setConnections,
      setScreenshots,
      setShowFlowInput,
      setToast,
      touchFlow,
      userEmail,
      userId,
    ],
  );

  const handleAddPlaceholderNode = useCallback(async () => {
    if (!flowId || !projectId) return;

    pushUndoSnapshot();
    markLocalEdit();

    const position = getPlaceholderPosition(nodes);

    try {
      const placeholder = await createPlaceholderNode({
        supabase,
        userId,
        userEmail,
        projectId,
        flowId,
        name: getNextPlaceholderName(screenshots),
        positionX: position.x,
        positionY: position.y,
      });

      setScreenshots((prev) => [...prev, placeholder]);
      setToast({ message: 'Added placeholder node', type: 'success' });

      await touchFlow();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add placeholder node';
      setToast({ message, type: 'error' });
    }
  }, [flowId, markLocalEdit, nodes, projectId, pushUndoSnapshot, screenshots, setScreenshots, setToast, touchFlow, userEmail, userId]);

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/'),
      );

      if (files.length === 0) {
        setToast({ message: 'Only image files can be dropped on the canvas', type: 'error' });
        return;
      }

      void handleFilesSelected(files);
    },
    [handleFilesSelected, setToast],
  );

  const handleCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleRelayout = useCallback(() => {
    pushUndoSnapshot();
    markLocalEdit();

    const laid = layoutElements(nodes, edges);
    setNodes(laid.nodes);
    setEdges(laid.edges);

    const positionMap = new Map(laid.nodes.map((item) => [item.id, item.position]));

    setScreenshots((prev) =>
      prev.map((item) => {
        const position = positionMap.get(item.id);
        if (!position) return item;
        return { ...item, position_x: position.x, position_y: position.y };
      }),
    );

    for (const node of laid.nodes) {
      supabase
        .from('screenshots')
        .update({ position_x: node.position.x, position_y: node.position.y })
        .eq('id', node.id)
        .then(() => {});
    }

    void touchFlow();
  }, [edges, markLocalEdit, nodes, pushUndoSnapshot, setEdges, setNodes, setScreenshots, touchFlow]);

  const handleBulkDeleteNodes = useCallback(async () => {
    const ids = Array.from(selectedNodeIds);
    if (ids.length === 0) return;

    pushUndoSnapshot();
    markLocalEdit();

    const toDelete = screenshots.filter((item) => ids.includes(item.id));

    await supabase
      .from('connections')
      .delete()
      .or(ids.map((id) => `source_id.eq.${id},target_id.eq.${id}`).join(','));

    await supabase.from('screenshots').delete().in('id', ids);

    const paths = toDelete.map((item) => item.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from('screenshots').remove(paths);
    }

    setScreenshots((prev) => prev.filter((item) => !selectedNodeIds.has(item.id)));
    setConnections((prev) =>
      prev.filter(
        (item) => !selectedNodeIds.has(item.source_id) && !selectedNodeIds.has(item.target_id),
      ),
    );
    setNodes((prev) => prev.filter((item) => !selectedNodeIds.has(item.id)));
    setEdges((prev) =>
      prev.filter(
        (item) => !selectedNodeIds.has(item.source) && !selectedNodeIds.has(item.target),
      ),
    );

    setSelectedNodeIds(new Set());
    setShowBulkDeleteConfirm(false);

    await touchFlow();
  }, [
    markLocalEdit,
    pushUndoSnapshot,
    screenshots,
    selectedNodeIds,
    setConnections,
    setEdges,
    setNodes,
    setScreenshots,
    setSelectedNodeIds,
    setShowBulkDeleteConfirm,
    touchFlow,
  ]);

  const handleExport = useCallback(async () => {
    if (!flow) return;

    const project = {
      id: flow.project_id,
      name: flow.name,
      user_id: '',
      primary_group: null,
      vs_groups: null,
      created_at: '',
      updated_at: '',
    };

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
  }, [connections, flow, screenshots]);

  return {
    handleNodesChange,
    handleConnect,
    handleEdgeClick,
    handleEdgeArrowChange,
    handleEdgeLabelChange,
    handleEdgeDelete,
    handleEdgeInsertPlaceholder,
    handleFilesSelected,
    handleFlowInsert,
    handleAddPlaceholderNode,
    handleCanvasDrop,
    handleCanvasDragOver,
    handleRelayout,
    handleBulkDeleteNodes,
    handleExport,
  };
}
