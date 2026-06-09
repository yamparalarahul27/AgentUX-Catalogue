import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import { useCataloguePrototypes, type PrototypeRecord } from '../hooks/use-catalogue-prototypes';
import { getPrototypeUrl } from '../lib/prototype-urls';
import { formatRelative } from '../lib/catalogue-relative-time';
import { supabase } from '../lib/supabase';
import { DotLoader } from './DotLoader';

interface CataloguePrototypesProps {
  canEdit?: boolean;
  onRequireAuth?: () => void;
  userEmail: string;
}

function shortAuthor(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function CataloguePrototypes({
  canEdit = true,
  onRequireAuth,
  userEmail,
}: CataloguePrototypesProps) {
  // Resolve own user id once so we can render Edit / Delete affordances
  // only on cards the viewer owns. RLS gates the server-side calls
  // regardless — this is just a UI affordance.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setCurrentUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);
  const {
    prototypes,
    loading,
    loadError,
    uploadPrototype,
    deletePrototype,
    toggleVisibility,
    reuploadPrototype,
    renamePrototype,
  } = useCataloguePrototypes({ userEmail });

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [reuploadingId, setReuploadingId] = useState<string | null>(null);
  // Inline-rename UI: { id, draft } when active, null when not.
  const [renameState, setRenameState] = useState<{ id: string; draft: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);

  function ensureCanEdit(): boolean {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!ensureCanEdit()) return;
    const list = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith('.html') || name.endsWith('.htm');
    });
    if (list.length === 0) {
      setUploadError('Only .html files are supported.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of list) {
        await uploadPrototype(file);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, uploadPrototype]);

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files.length > 0) void handleUploadFiles(files);
    // Reset so picking the same file again still fires onChange.
    event.target.value = '';
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) void handleUploadFiles(files);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function triggerReupload(id: string) {
    if (!ensureCanEdit()) return;
    setReuploadingId(id);
    reuploadInputRef.current?.click();
  }

  async function handleReuploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !reuploadingId) {
      setReuploadingId(null);
      return;
    }
    try {
      await reuploadPrototype(reuploadingId, file);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Reupload failed.');
    } finally {
      setReuploadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!ensureCanEdit()) return;
    if (!window.confirm('Delete this prototype? This cannot be undone.')) return;
    try {
      await deletePrototype(id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  async function handleToggleVisibility(id: string) {
    if (!ensureCanEdit()) return;
    try {
      await toggleVisibility(id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not change visibility.');
    }
  }

  function startRename(record: PrototypeRecord) {
    if (!ensureCanEdit()) return;
    setRenameState({ id: record.id, draft: record.title });
  }

  async function commitRename() {
    if (!renameState) return;
    try {
      await renamePrototype(renameState.id, renameState.draft);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Rename failed.');
    } finally {
      setRenameState(null);
    }
  }

  const totalPrototypes = prototypes.length;

  return (
    <section className="catalogue-prototypes" aria-label="HTML prototypes">
      <header className="catalogue-prototypes__head">
        <div className="catalogue-prototypes__copy">
          <h2>HTML prototypes</h2>
          <p>Upload single-file HTML mockups. Files open in a new tab on the sandbox subdomain.</p>
        </div>
      </header>

      {loadError && <p className="catalogue-prototypes__error">{loadError}</p>}

      {canEdit && (
        <div
          className={`catalogue-prototypes__dropzone${isDragOver ? ' is-drag-over' : ''}${uploading ? ' is-uploading' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          {uploading ? (
            <>
              <DotLoader size="md" ariaLabel="Uploading" />
              <p>Uploading…</p>
            </>
          ) : (
            <>
              <Upload size={22} aria-hidden="true" />
              <p>
                <strong>Drop .html files here</strong> or click to pick
              </p>
              <span className="catalogue-prototypes__dropzone-hint">
                Each file becomes a prototype you can open in a new tab.
              </span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            multiple
            hidden
            onChange={handleFileInputChange}
          />
        </div>
      )}

      {/* Hidden input shared for the per-card reupload flow. */}
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".html,.htm,text/html"
        hidden
        onChange={handleReuploadFile}
      />

      {uploadError && <p className="catalogue-prototypes__error">{uploadError}</p>}

      {loading ? (
        <div className="catalogue-prototypes__loading">
          <DotLoader size="md" ariaLabel="Loading prototypes" />
        </div>
      ) : totalPrototypes === 0 ? (
        <p className="catalogue-prototypes__empty">
          No prototypes yet. Drop an .html file above to add one.
        </p>
      ) : (
        <div className="catalogue-prototypes__grid">
          {prototypes.map((proto) => {
            const isMine = Boolean(currentUserId && proto.uploaderUserId === currentUserId);
            const url = getPrototypeUrl(proto.storagePath);
            const author = shortAuthor(proto.uploaderEmail);
            const isRenaming = renameState?.id === proto.id;
            return (
              <article key={proto.id} className="catalogue-prototypes__card">
                <header className="catalogue-prototypes__card-head">
                  {isRenaming ? (
                    <input
                      className="catalogue-prototypes__card-title-input"
                      value={renameState.draft}
                      onChange={(event) => setRenameState({ id: proto.id, draft: event.target.value })}
                      onBlur={() => void commitRename()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void commitRename();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setRenameState(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="catalogue-prototypes__card-title"
                      onClick={() => (isMine ? startRename(proto) : undefined)}
                      title={isMine ? 'Click to rename' : proto.title}
                      disabled={!isMine}
                    >
                      {proto.title}
                    </button>
                  )}
                  <span
                    className={`catalogue-prototypes__visibility catalogue-prototypes__visibility--${proto.visibility}`}
                    title={proto.visibility === 'public' ? 'Visible to everyone' : 'Only you can see this'}
                  >
                    {proto.visibility === 'public' ? <Eye size={11} aria-hidden="true" /> : <EyeOff size={11} aria-hidden="true" />}
                    {proto.visibility === 'public' ? 'Public' : 'Private'}
                  </span>
                </header>

                <div className="catalogue-prototypes__card-meta">
                  {author && <span>{author}</span>}
                  <span>·</span>
                  <span title={new Date(proto.createdAt).toLocaleString()}>
                    {formatRelative(proto.createdAt)}
                  </span>
                </div>

                <footer className="catalogue-prototypes__card-actions">
                  <a
                    className="catalogue-prototypes__action catalogue-prototypes__action--primary"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    Open
                  </a>
                  {isMine && (
                    <>
                      <button
                        type="button"
                        className="catalogue-prototypes__action"
                        onClick={() => void handleToggleVisibility(proto.id)}
                        title={proto.visibility === 'public' ? 'Make private' : 'Make public'}
                      >
                        {proto.visibility === 'public' ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        className="catalogue-prototypes__action"
                        onClick={() => triggerReupload(proto.id)}
                        title="Replace with a new file"
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="catalogue-prototypes__action catalogue-prototypes__action--danger"
                        onClick={() => void handleDelete(proto.id)}
                        title="Delete prototype"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
