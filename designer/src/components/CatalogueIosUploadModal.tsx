import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, RefreshCw, Smartphone, Trash2, X } from 'lucide-react';

import {
  getTokenStatus,
  revokeToken,
  setToken,
  type UploadTokenStatus,
} from '../lib/upload-token';

interface CatalogueIosUploadModalProps {
  isOpen: boolean;
  userEmail: string | null;
  onClose: () => void;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/shortcut-upload`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "iOS Upload" modal opened from the account menu. Manages the upload-only
// token a member pastes into their Apple Shortcut. The plaintext is shown
// once (only the hash is stored) — see lib/upload-token.ts.
export function CatalogueIosUploadModal({ isOpen, userEmail, onClose }: CatalogueIosUploadModalProps) {
  const [status, setStatus] = useState<UploadTokenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus(await getTokenStatus());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPlaintext(null);
    setCopied(false);
    setError(null);
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  async function handleGenerate() {
    if (!userEmail) return;
    setBusy(true);
    setError(null);
    try {
      const token = await setToken(userEmail);
      setPlaintext(token);
      setCopied(false);
      await refresh();
    } catch {
      setError('Could not generate a token. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!userEmail) return;
    setBusy(true);
    setError(null);
    try {
      await revokeToken(userEmail);
      setPlaintext(null);
      setStatus(null);
    } catch {
      setError('Could not revoke the token. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
    } catch {
      setError('Copy failed — select the token and copy it manually.');
    }
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className="catalogue-settings-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div
        className="catalogue-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-ios-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="catalogue-settings-modal__head">
          <div>
            <p className="catalogue-settings-modal__eyebrow">Personal settings</p>
            <h3 id="catalogue-ios-upload-title">
              <Smartphone size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />
              iOS Upload
            </h3>
          </div>
          <button type="button" className="catalogue-settings-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="catalogue-settings-section">
          <div className="catalogue-settings-section__head">
            <div>
              <p>
                Share screenshots and links from your iPhone with an Apple Shortcut. Images land in the{' '}
                <strong>&ldquo;iOS Inbox&rdquo;</strong> group; X posts and YouTube links go to Videos, other links to
                Links. Use the token below in your Shortcut.
              </p>
            </div>
          </div>

          {error && (
            <p className="catalogue-settings-toggle-group__hint" role="alert" style={{ color: 'var(--danger, #e5484d)' }}>
              {error}
            </p>
          )}

          {loading ? (
            <p className="catalogue-settings-toggle-group__hint">Loading…</p>
          ) : plaintext ? (
            <div className="catalogue-settings-toggle-group">
              <p className="catalogue-settings-toggle-group__title">Your token (shown once)</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                    wordBreak: 'break-all',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--surface-2, rgba(255,255,255,0.06))',
                  }}
                >
                  {plaintext}
                </code>
                <button type="button" className="catalogue-settings-toggle__btn" onClick={handleCopy} style={{ flex: '0 0 auto' }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span style={{ marginLeft: 6 }}>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="catalogue-settings-toggle-group__hint" style={{ marginTop: 8 }}>
                <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true" />
                Save this now — it won&rsquo;t be shown again. Only its hash is stored.
              </p>
            </div>
          ) : status ? (
            <div className="catalogue-settings-toggle-group">
              <p className="catalogue-settings-toggle-group__title">Token active</p>
              <p className="catalogue-settings-toggle-group__hint">
                Created {formatDate(status.createdAt)}
                {status.lastUsedAt ? ` · last used ${formatDate(status.lastUsedAt)}` : ' · not used yet'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="catalogue-settings-toggle__btn" onClick={handleGenerate} disabled={busy}>
                  <RefreshCw size={14} />
                  <span style={{ marginLeft: 6 }}>Regenerate</span>
                </button>
                <button type="button" className="catalogue-settings-toggle__btn" onClick={handleRevoke} disabled={busy}>
                  <Trash2 size={14} />
                  <span style={{ marginLeft: 6 }}>Revoke</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="catalogue-settings-toggle-group">
              <button type="button" className="catalogue-settings-toggle__btn is-on" onClick={handleGenerate} disabled={busy || !userEmail}>
                <span style={{ marginLeft: 0 }}>{busy ? 'Generating…' : 'Generate token'}</span>
              </button>
            </div>
          )}

          <div className="catalogue-settings-toggle-group">
            <p className="catalogue-settings-toggle-group__title">Shortcut endpoint</p>
            <code
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 12,
                wordBreak: 'break-all',
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--surface-2, rgba(255,255,255,0.06))',
              }}
            >
              {ENDPOINT}
            </code>
            <p className="catalogue-settings-toggle-group__hint" style={{ marginTop: 8 }}>
              POST the image as form field <code>image</code> (or a URL as <code>url</code>) with header{' '}
              <code>X-Upload-Token</code>. Full step-by-step in <code>docs/ios-shortcut-setup.md</code>.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
