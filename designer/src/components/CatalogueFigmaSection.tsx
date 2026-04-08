import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogueFigmaRequest, FigmaRequestStatus, Project } from '../types';
import { supabase } from '../lib/supabase';

interface CatalogueFigmaSectionProps {
  activeProjectId: string | null;
  canAdmin?: boolean;
  canEdit?: boolean;
  onRequireAuth?: () => void;
  projects: Project[];
  userEmail: string;
  userId: string;
}

interface CreateRequestDraft {
  htmlSnippet: string;
  projectId: string | null;
  referenceImageUrl: string;
  title: string;
}

interface AdminDraft {
  adminNotes: string;
  errorMessage: string;
  nodeUrl: string;
  status: FigmaRequestStatus;
}

interface UiNotice {
  message: string;
  tone: 'error' | 'info' | 'success';
}

const FIGMA_STATUS_LABEL: Record<FigmaRequestStatus, string> = {
  queued: 'Queued',
  parsing: 'Parsing',
  building: 'Building',
  review: 'Review',
  ready: 'Ready',
  failed: 'Failed',
};

const FIGMA_STATUS_PROGRESS: Partial<Record<FigmaRequestStatus, string>> = {
  queued: 'Component request received, queued for parsing.',
  parsing: 'Component request received, parsing in progress.',
  building: 'Component Request Received, Building in Progress.',
  review: 'Component build completed. Waiting for admin review.',
};

const FIGMA_STATUS_ORDER: FigmaRequestStatus[] = [
  'queued',
  'parsing',
  'building',
  'review',
  'ready',
  'failed',
];

function normalizeStatus(value: unknown): FigmaRequestStatus {
  if (typeof value !== 'string') return 'queued';
  if (FIGMA_STATUS_ORDER.includes(value as FigmaRequestStatus)) {
    return value as FigmaRequestStatus;
  }
  return 'queued';
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function toFigmaRequest(input: Record<string, unknown>): CatalogueFigmaRequest {
  return {
    id: String(input.id || ''),
    project_id: input.project_id ? String(input.project_id) : null,
    title: input.title ? String(input.title) : null,
    html_snippet: String(input.html_snippet || ''),
    reference_image_url: input.reference_image_url ? String(input.reference_image_url) : null,
    requested_by_user_id: String(input.requested_by_user_id || ''),
    requested_by_email: input.requested_by_email ? String(input.requested_by_email) : null,
    status: normalizeStatus(input.status),
    node_url: input.node_url ? String(input.node_url) : null,
    node_id: input.node_id ? String(input.node_id) : null,
    file_key: input.file_key ? String(input.file_key) : null,
    admin_notes: input.admin_notes ? String(input.admin_notes) : null,
    error_message: input.error_message ? String(input.error_message) : null,
    engine_payload: normalizePayload(input.engine_payload),
    created_at: String(input.created_at || new Date(0).toISOString()),
    updated_at: String(input.updated_at || new Date(0).toISOString()),
  };
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown date';
  return new Date(timestamp).toLocaleString();
}

function trimHtmlSnippet(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 300) return compact;
  return `${compact.slice(0, 300)}...`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.style.position = 'fixed';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.focus();
    holder.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(holder);
    return copied;
  } catch {
    return false;
  }
}

function createRequestDraft(activeProjectId: string | null): CreateRequestDraft {
  return {
    htmlSnippet: '',
    projectId: activeProjectId,
    referenceImageUrl: '',
    title: '',
  };
}

function buildAdminDraft(request: CatalogueFigmaRequest): AdminDraft {
  return {
    adminNotes: request.admin_notes || '',
    errorMessage: request.error_message || '',
    nodeUrl: request.node_url || '',
    status: request.status,
  };
}

function buildEnginePayload(request: CatalogueFigmaRequest, projectName: string | null): Record<string, unknown> {
  return {
    requestId: request.id,
    requestedAt: request.created_at,
    requestedBy: {
      email: request.requested_by_email,
      userId: request.requested_by_user_id,
    },
    project: {
      id: request.project_id,
      name: projectName,
    },
    input: {
      htmlSnippet: request.html_snippet,
      referenceImageUrl: request.reference_image_url,
      title: request.title,
    },
    target: {
      figmaFileKey: request.file_key,
      nodeId: request.node_id,
      nodeUrl: request.node_url,
    },
    status: request.status,
  };
}

function parseFigmaUrlIdentifiers(rawUrl: string): { fileKey: string | null; nodeId: string | null } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { fileKey: null, nodeId: null };

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const designIndex = segments.findIndex((segment) => segment === 'design' || segment === 'file' || segment === 'board');
    const fileKey = designIndex >= 0 && segments[designIndex + 1] ? segments[designIndex + 1] : null;

    const rawNodeId = parsed.searchParams.get('node-id');
    if (!rawNodeId) {
      return { fileKey, nodeId: null };
    }

    const decodedNodeId = decodeURIComponent(rawNodeId).replace(/-/g, ':');
    return { fileKey, nodeId: decodedNodeId };
  } catch {
    return { fileKey: null, nodeId: null };
  }
}

export function CatalogueFigmaSection({
  activeProjectId,
  canAdmin = false,
  canEdit = true,
  onRequireAuth,
  projects,
  userEmail,
  userId,
}: CatalogueFigmaSectionProps) {
  const [adminDraftById, setAdminDraftById] = useState<Record<string, AdminDraft>>({});
  const [createDraft, setCreateDraft] = useState<CreateRequestDraft>(createRequestDraft(activeProjectId));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [requests, setRequests] = useState<CatalogueFigmaRequest[]>([]);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const filteredRequests = useMemo(() => {
    if (!activeProjectId) return requests;
    return requests.filter((request) => request.project_id === activeProjectId);
  }, [activeProjectId, requests]);

  function ensureCanEdit() {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  function openCreateModal() {
    if (!ensureCanEdit()) return;
    setCreateDraft(createRequestDraft(activeProjectId));
    setShowCreateModal(true);
  }

  const loadRequests = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    let query = supabase
      .from('catalogue_figma_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!canAdmin) {
      query = query.eq('requested_by_user_id', userId);
    }

    const { data, error: loadError } = await query;
    if (loadError) {
      setError('Unable to load Figma requests. Run the latest SQL migration and retry.');
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    const mapped = (data || []).map((row) => toFigmaRequest(row as Record<string, unknown>));
    setRequests(mapped);
    if (!silent) {
      setLoading(false);
    }
  }, [canAdmin, userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      void loadRequests({ silent: true });
    }, 12000);
    return () => window.clearInterval(refreshTimer);
  }, [loadRequests]);

  useEffect(() => {
    setAdminDraftById((previous) => {
      const next: Record<string, AdminDraft> = {};

      for (const request of requests) {
        next[request.id] = previous[request.id] || buildAdminDraft(request);
      }

      return next;
    });
  }, [requests]);

  function updateAdminDraft(requestId: string, patch: Partial<AdminDraft>) {
    setAdminDraftById((previous) => ({
      ...previous,
      [requestId]: {
        ...(previous[requestId] || {
          adminNotes: '',
          errorMessage: '',
          nodeUrl: '',
          status: 'queued' as FigmaRequestStatus,
        }),
        ...patch,
      },
    }));
  }

  async function saveAdminUpdate(requestId: string) {
    const draft = adminDraftById[requestId];
    if (!draft) return;
    const identifiers = parseFigmaUrlIdentifiers(draft.nodeUrl);

    setSavingById((previous) => ({ ...previous, [requestId]: true }));
    const { data, error } = await supabase
      .from('catalogue_figma_requests')
      .update({
        admin_notes: draft.adminNotes.trim() || null,
        error_message: draft.errorMessage.trim() || null,
        file_key: identifiers.fileKey,
        node_id: identifiers.nodeId,
        node_url: draft.nodeUrl.trim() || null,
        status: draft.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single();
    setSavingById((previous) => ({ ...previous, [requestId]: false }));

    if (error || !data) {
      setNotice({ message: 'Unable to save admin update right now.', tone: 'error' });
      return;
    }

    const nextRequest = toFigmaRequest(data as Record<string, unknown>);
    setRequests((previous) => previous.map((request) => (request.id === requestId ? nextRequest : request)));
    setNotice({ message: 'Figma request updated.', tone: 'success' });
  }

  async function copyRequestHtml(request: CatalogueFigmaRequest) {
    const copied = await copyText(request.html_snippet);
    if (!copied) {
      setNotice({ message: 'Could not copy HTML. Try again.', tone: 'error' });
      return;
    }
    setNotice({ message: 'HTML snippet copied.', tone: 'success' });
  }

  async function copyEngineRequest(request: CatalogueFigmaRequest) {
    const payload = Object.keys(request.engine_payload || {}).length > 0
      ? request.engine_payload
      : buildEnginePayload(request, request.project_id ? projectNameById[request.project_id] || null : null);
    const copied = await copyText(JSON.stringify(payload, null, 2));
    if (!copied) {
      setNotice({ message: 'Could not copy build payload. Try again.', tone: 'error' });
      return;
    }
    setNotice({ message: 'Build payload copied.', tone: 'success' });
  }

  async function submitCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ensureCanEdit()) return;
    if (submitting) return;

    const htmlSnippet = createDraft.htmlSnippet.trim();
    if (htmlSnippet.length < 20) {
      setNotice({ message: 'Paste full HTML/Div code before submitting.', tone: 'error' });
      return;
    }

    const referenceImageUrl = createDraft.referenceImageUrl.trim();
    const title = createDraft.title.trim();
    setSubmitting(true);

    const { data, error } = await supabase
      .from('catalogue_figma_requests')
      .insert({
        admin_notes: null,
        engine_payload: {},
        error_message: null,
        file_key: null,
        html_snippet: htmlSnippet,
        node_id: null,
        node_url: null,
        project_id: createDraft.projectId || null,
        reference_image_url: referenceImageUrl || null,
        requested_by_email: userEmail,
        requested_by_user_id: userId,
        status: 'queued',
        title: title || null,
      })
      .select('*')
      .single();

    setSubmitting(false);

    if (error || !data) {
      setNotice({ message: 'Unable to submit request right now.', tone: 'error' });
      return;
    }

    const nextRequest = toFigmaRequest(data as Record<string, unknown>);
    setRequests((previous) => [nextRequest, ...previous]);
    setShowCreateModal(false);
    setNotice({ message: 'Component request received. Building in progress.', tone: 'success' });
  }

  return (
    <>
      <section className="catalogue-figma" aria-label="Figma components">
        <header className="catalogue-figma__head">
          <div className="catalogue-figma__copy">
            <h2>Figma Components</h2>
            <p>
              Submit HTML snippets and optional reference screenshots, then track conversion status until a Figma node
              link is attached.
            </p>
          </div>
          <div className="catalogue-figma__head-actions">
            <button type="button" className="catalogue-figma__refresh" onClick={() => void loadRequests()}>
              Refresh
            </button>
            <button type="button" className="catalogue-figma__create" onClick={openCreateModal}>
              Create New
            </button>
          </div>
        </header>

        {notice && (
          <p className={`catalogue-figma__notice is-${notice.tone}`}>
            {notice.message}
          </p>
        )}

        {error && <p className="catalogue-figma__notice is-error">{error}</p>}

        {loading ? (
          <p className="catalogue-figma__loading">Loading Figma component requests...</p>
        ) : filteredRequests.length === 0 ? (
          <div className="catalogue-figma__empty">
            <h3>No component requests yet</h3>
            <p>Create your first request by pasting HTML/Div code.</p>
            <button type="button" className="catalogue-figma__create" onClick={openCreateModal}>
              Create New
            </button>
          </div>
        ) : (
          <div className="catalogue-figma__grid">
            {filteredRequests.map((request) => {
              const draft = adminDraftById[request.id] || buildAdminDraft(request);
              const progressCopy = FIGMA_STATUS_PROGRESS[request.status];
              const projectName = request.project_id ? projectNameById[request.project_id] || 'Unknown project' : 'No project';

              return (
                <article key={request.id} className="catalogue-figma__card">
                  <header className="catalogue-figma__card-head">
                    <h3>{request.title || `Component Request ${request.id.slice(0, 8)}`}</h3>
                    <span className={`catalogue-figma__status is-${request.status}`}>
                      {FIGMA_STATUS_LABEL[request.status]}
                    </span>
                  </header>

                  <div className="catalogue-figma__meta">
                    <span>{projectName}</span>
                    <span>{formatTimestamp(request.created_at)}</span>
                  </div>

                  <pre className="catalogue-figma__snippet">{trimHtmlSnippet(request.html_snippet)}</pre>

                  {progressCopy && <p className="catalogue-figma__progress">{progressCopy}</p>}
                  {request.error_message && <p className="catalogue-figma__error">{request.error_message}</p>}
                  {request.admin_notes && <p className="catalogue-figma__notes">{request.admin_notes}</p>}

                  <div className="catalogue-figma__links">
                    {request.reference_image_url && (
                      <a href={request.reference_image_url} target="_blank" rel="noreferrer">
                        Reference Screenshot
                      </a>
                    )}
                    {request.node_url && (
                      <a href={request.node_url} target="_blank" rel="noreferrer">
                        Open Figma Node
                      </a>
                    )}
                  </div>

                  <div className="catalogue-figma__actions">
                    <button type="button" onClick={() => void copyRequestHtml(request)}>
                      Copy HTML
                    </button>
                    <button type="button" onClick={() => void copyEngineRequest(request)}>
                      Copy Build Payload
                    </button>
                  </div>

                  {canAdmin && (
                    <div className="catalogue-figma__admin">
                      <label>
                        Status
                        <select
                          value={draft.status}
                          onChange={(event) => updateAdminDraft(request.id, { status: normalizeStatus(event.target.value) })}
                        >
                          {FIGMA_STATUS_ORDER.map((status) => (
                            <option key={status} value={status}>
                              {FIGMA_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Figma Node Link
                        <input
                          type="url"
                          value={draft.nodeUrl}
                          placeholder="https://www.figma.com/design/..."
                          onChange={(event) => updateAdminDraft(request.id, { nodeUrl: event.target.value })}
                        />
                      </label>

                      <label>
                        Admin Notes
                        <textarea
                          rows={2}
                          value={draft.adminNotes}
                          placeholder="Internal status notes for this request"
                          onChange={(event) => updateAdminDraft(request.id, { adminNotes: event.target.value })}
                        />
                      </label>

                      {draft.status === 'failed' && (
                        <label>
                          Failure Reason
                          <input
                            type="text"
                            value={draft.errorMessage}
                            placeholder="Parsing failed due to missing token map..."
                            onChange={(event) => updateAdminDraft(request.id, { errorMessage: event.target.value })}
                          />
                        </label>
                      )}

                      <div className="catalogue-figma__admin-actions">
                        <button
                          type="button"
                          className="is-subtle"
                          onClick={() => updateAdminDraft(request.id, { status: 'building' })}
                        >
                          Mark Building
                        </button>
                        <button
                          type="button"
                          className="is-subtle"
                          onClick={() => updateAdminDraft(request.id, { status: 'ready' })}
                        >
                          Mark Ready
                        </button>
                        <button
                          type="button"
                          className="is-primary"
                          disabled={Boolean(savingById[request.id])}
                          onClick={() => void saveAdminUpdate(request.id)}
                        >
                          {savingById[request.id] ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="catalogue-figma-modal" role="dialog" aria-modal="true" onClick={() => setShowCreateModal(false)}>
          <div className="catalogue-figma-modal__panel" onClick={(event) => event.stopPropagation()}>
            <header className="catalogue-figma-modal__head">
              <h3>Create Figma Component Request</h3>
              <p>Paste Div/HTML code and optionally attach a screenshot URL for better visual fidelity.</p>
            </header>

            <form className="catalogue-figma-modal__form" onSubmit={submitCreateRequest}>
              <label>
                Component Name (optional)
                <input
                  type="text"
                  value={createDraft.title}
                  placeholder="Market Selector Dialog"
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, title: event.target.value }))}
                />
              </label>

              <label>
                Project (optional)
                <select
                  value={createDraft.projectId || ''}
                  onChange={(event) => setCreateDraft((previous) => ({
                    ...previous,
                    projectId: event.target.value || null,
                  }))}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Div / HTML Code
                <textarea
                  rows={12}
                  required
                  value={createDraft.htmlSnippet}
                  placeholder="<div role='dialog'>...</div>"
                  onChange={(event) => setCreateDraft((previous) => ({ ...previous, htmlSnippet: event.target.value }))}
                />
              </label>

              <label>
                Reference Screenshot URL (optional)
                <input
                  type="url"
                  value={createDraft.referenceImageUrl}
                  placeholder="https://example.com/screenshot.png"
                  onChange={(event) => setCreateDraft((previous) => ({
                    ...previous,
                    referenceImageUrl: event.target.value,
                  }))}
                />
              </label>

              <div className="catalogue-figma-modal__actions">
                <button type="button" className="is-subtle" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="is-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
