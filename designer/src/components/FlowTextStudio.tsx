import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Connection, Flow, ScreenshotNode } from '../types';
import { supabase } from '../lib/supabase';
import { buildFlowElements } from '../lib/canvas-graph';
import { insertFlowFromText, touchFlowUpdatedAt } from '../lib/canvas-operations';

interface FlowTextStudioProps {
  user: User;
}

interface LoadOptions {
  preserveLocalDraft?: boolean;
  showLoading?: boolean;
}

const DRAFT_STORAGE_PREFIX = 'flow-text-studio:draft';

function getDraftStorageKey(flowId: string) {
  return `${DRAFT_STORAGE_PREFIX}:${flowId}`;
}

function readStoredDraft(flowId: string): string | null {
  try {
    return window.localStorage.getItem(getDraftStorageKey(flowId));
  } catch {
    return null;
  }
}

function writeStoredDraft(flowId: string, draft: string) {
  try {
    window.localStorage.setItem(getDraftStorageKey(flowId), draft);
  } catch {
    // Ignore storage quota or privacy errors.
  }
}

function compareNodes(a: ScreenshotNode, b: ScreenshotNode) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function graphToFlowText(screenshots: ScreenshotNode[], connections: Connection[]) {
  const nodesById = new Map(screenshots.map((item) => [item.id, item]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>(screenshots.map((item) => [item.id, 0]));

  for (const connection of connections) {
    if (!nodesById.has(connection.source_id) || !nodesById.has(connection.target_id)) {
      continue;
    }

    const targets = outgoing.get(connection.source_id) ?? [];
    targets.push(connection.target_id);
    outgoing.set(connection.source_id, targets);
    incoming.set(connection.target_id, (incoming.get(connection.target_id) ?? 0) + 1);
  }

  for (const [sourceId, targets] of outgoing.entries()) {
    const uniqueTargets = [...new Set(targets)];
    uniqueTargets.sort((left, right) => {
      const leftNode = nodesById.get(left);
      const rightNode = nodesById.get(right);
      return (leftNode?.name ?? '').localeCompare(rightNode?.name ?? '') || left.localeCompare(right);
    });
    outgoing.set(sourceId, uniqueTargets);
  }

  const lines = new Set<string>();
  const covered = new Set<string>();
  const roots = screenshots.filter((item) => (incoming.get(item.id) ?? 0) === 0).sort(compareNodes);

  const visit = (nodeId: string, path: string[], seen: Set<string>) => {
    covered.add(nodeId);
    const nextIds = outgoing.get(nodeId) ?? [];

    if (nextIds.length === 0) {
      lines.add(path.join(' -> '));
      return;
    }

    let expanded = false;
    for (const nextId of nextIds) {
      const nextNode = nodesById.get(nextId);
      if (!nextNode) {
        continue;
      }

      if (seen.has(nextId)) {
        lines.add([...path, nextNode.name].join(' -> '));
        continue;
      }

      expanded = true;
      const nextSeen = new Set(seen);
      nextSeen.add(nextId);
      visit(nextId, [...path, nextNode.name], nextSeen);
    }

    if (!expanded) {
      lines.add(path.join(' -> '));
    }
  };

  if (roots.length > 0) {
    for (const root of roots) {
      visit(root.id, [root.name], new Set([root.id]));
    }
  }

  for (const screenshot of [...screenshots].sort(compareNodes)) {
    if (!covered.has(screenshot.id)) {
      lines.add(screenshot.name);
    }
  }

  if (lines.size === 0) {
    return '';
  }

  return Array.from(lines).join('\n');
}

export function TextFlowStudio({ user }: FlowTextStudioProps) {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  const navigate = useNavigate();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  const draftOriginRef = useRef<'graph' | 'local'>('graph');
  const loadedFlowIdRef = useRef<string | null>(null);

  const currentGraph = useMemo(() => buildFlowElements(screenshots, connections), [connections, screenshots]);

  const loadFlowData = useCallback(
    async (options?: LoadOptions) => {
      if (!flowId) return;

      if (loadedFlowIdRef.current !== flowId) {
        draftOriginRef.current = 'graph';
        loadedFlowIdRef.current = flowId;
      }

      const showLoading = options?.showLoading ?? true;
      if (showLoading) {
        setLoading(true);
      }
      setStatus(null);

      try {
        const [flowRes, screenshotRes, connectionRes] = await Promise.all([
          supabase.from('flows').select('*').eq('id', flowId).single(),
          supabase.from('screenshots').select('*').eq('flow_id', flowId).order('created_at'),
          supabase.from('connections').select('*').eq('flow_id', flowId),
        ]);

        if (flowRes.error) throw flowRes.error;
        if (screenshotRes.error) throw screenshotRes.error;
        if (connectionRes.error) throw connectionRes.error;

        setFlow(flowRes.data as Flow | null);

        const screenshotRows = (screenshotRes.data || []) as ScreenshotNode[];
        const screenshotWithUrls = screenshotRows.map((item) => ({
          ...item,
          image_url: item.storage_path
            ? supabase.storage.from('screenshots').getPublicUrl(item.storage_path).data.publicUrl
            : '',
        }));

        const connectionRows = (connectionRes.data || []) as Connection[];

        setScreenshots(screenshotWithUrls);
        setConnections(connectionRows);

        const graphDraft = graphToFlowText(screenshotWithUrls, connectionRows);
        const storedDraft = options?.preserveLocalDraft === false ? null : readStoredDraft(flowId);

        if (storedDraft !== null) {
          draftOriginRef.current = 'local';
          setDraft(storedDraft);
        } else if (draftOriginRef.current !== 'local') {
          draftOriginRef.current = 'graph';
          setDraft(graphDraft);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load flow';
        setStatus({ type: 'error', message });
        return false;
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }

      return true;
    },
    [flowId],
  );

  useEffect(() => {
    void loadFlowData();
  }, [loadFlowData]);

  useEffect(() => {
    if (!flowId || loading) return;
    writeStoredDraft(flowId, draft);
  }, [draft, flowId, loading]);

  const handleChange = useCallback((value: string) => {
    draftOriginRef.current = 'local';
    setDraft(value);
  }, []);

  const handlePublish = useCallback(async () => {
    if (!flowId || !projectId) return;

    const text = draft.trim();
    if (!text) {
      setStatus({ type: 'error', message: 'Add at least one flow path before publishing.' });
      return;
    }

    setPublishing(true);
    setStatus(null);

    try {
      const { newScreenshots, newConnections } = await insertFlowFromText({
        supabase,
        userId: user.id,
        projectId,
        flowId,
        text,
        existingScreenshots: screenshots,
        existingConnections: connections,
        currentNodes: currentGraph.nodes,
      });

      await touchFlowUpdatedAt(supabase, flowId);
      const refreshed = await loadFlowData({ preserveLocalDraft: false, showLoading: false });
      if (!refreshed) {
        return;
      }

      setStatus({
        type: 'success',
        message:
          newScreenshots.length === 0 && newConnections.length === 0
            ? 'Nothing new was published.'
            : `Published ${newScreenshots.length} node${newScreenshots.length === 1 ? '' : 's'} and ${newConnections.length} connection${newConnections.length === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to publish flow';
      setStatus({ type: 'error', message });
    } finally {
      setPublishing(false);
    }
  }, [connections, currentGraph.nodes, draft, flowId, loadFlowData, projectId, screenshots, user.id]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading Text Flow Studio...</p>
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

  return (
    <div className="flow-text-studio" style={{ minHeight: '100vh', background: '#0f0f10', color: '#e4e4e7', padding: 24 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <button className="btn-secondary" onClick={() => navigate(`/project/${projectId}`)}>
            Back to Flows
          </button>
          <h1 style={{ margin: '12px 0 4px', fontSize: 28 }}>{flow.name}</h1>
          <p style={{ margin: 0, color: '#a1a1aa' }}>
            Text Flow Studio for {user.email || user.id}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => navigate(`/project/${projectId}/flow/${flowId}`)}>
            Open Canvas
          </button>
          <button className="btn-primary" onClick={() => void handlePublish()} disabled={publishing}>
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 0.9fr)' }}>
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Draft</h2>
              <p style={{ margin: '4px 0 0', color: '#a1a1aa' }}>
                Autosaves locally in your browser until you press Publish.
              </p>
            </div>
            <span style={{ color: '#a1a1aa' }}>{draft.split(/\r?\n/).filter(Boolean).length} path{draft.split(/\r?\n/).filter(Boolean).length === 1 ? '' : 's'}</span>
          </div>
          <textarea
            aria-label="Flow draft"
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            spellCheck={false}
            rows={18}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 12,
              border: '1px solid #3f3f46',
              background: '#0b0b0c',
              color: '#f4f4f5',
              padding: 16,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              lineHeight: 1.5,
              resize: 'vertical',
            }}
            placeholder="Login > Enter email > OTP > Home"
          />
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Current graph</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', margin: '12px 0 0' }}>
              <dt style={{ color: '#a1a1aa' }}>Screens</dt>
              <dd style={{ margin: 0 }}>{screenshots.length}</dd>
              <dt style={{ color: '#a1a1aa' }}>Connections</dt>
              <dd style={{ margin: 0 }}>{connections.length}</dd>
              <dt style={{ color: '#a1a1aa' }}>Preview paths</dt>
              <dd style={{ margin: 0 }}>{graphToFlowText(screenshots, connections).split(/\r?\n/).filter(Boolean).length}</dd>
            </dl>
          </div>

          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Publish rules</h2>
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: '#d4d4d8', lineHeight: 1.6 }}>
              <li>Typing never writes to the database.</li>
              <li>Drafts are saved per flow in localStorage.</li>
              <li>Both `-&gt;` and `&gt;` connectors are supported.</li>
              <li>Publish reuses the same graph insert logic as the canvas.</li>
            </ul>
          </div>
        </aside>
      </section>

      {status && (
        <div
          role="status"
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: status.type === 'error' ? '#451a1a' : status.type === 'success' ? '#052e16' : '#1e1b4b',
            color: '#f4f4f5',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
