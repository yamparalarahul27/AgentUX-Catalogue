import { useState, useRef, useEffect, useCallback } from 'react';
import type { Comparison } from '../types';
import { supabase } from '../lib/supabase';

function DraggableImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 50, posY: 50 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;

    function handleMove(e: MouseEvent) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const newX = Math.max(0, Math.min(100, dragStart.current.posX - (dx / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, dragStart.current.posY - (dy / rect.height) * 100));
      setPos({ x: newX, y: newY });
    }

    function handleUp() {
      setDragging(false);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      className="compare-image-draggable"
      onMouseDown={handleMouseDown}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
      />
    </div>
  );
}

interface CompareModalProps {
  screenshotId: string;
  screenshotUrl: string;
  screenshotName: string;
  projectId: string;
  userId: string;
  onClose: () => void;
}

export function CompareModal({
  screenshotId,
  screenshotUrl,
  screenshotName,
  projectId,
  userId,
  onClose,
}: CompareModalProps) {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingMode, setAddingMode] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadComparisons();
  }, [screenshotId]);

  useEffect(() => {
    if (addingMode && pendingFile && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [addingMode, pendingFile]);

  async function loadComparisons() {
    setLoading(true);
    const { data } = await supabase
      .from('comparisons')
      .select('*')
      .eq('screenshot_id', screenshotId)
      .order('created_at');

    if (data) {
      const withUrls = data.map((c: Comparison) => ({
        ...c,
        image_url: c.storage_path
          ? supabase.storage.from('screenshots').getPublicUrl(c.storage_path).data.publicUrl
          : '',
      }));
      setComparisons(withUrls);
    }
    setLoading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
      setNewName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      setAddingMode(true);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function cancelAdding() {
    setAddingMode(false);
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
    setNewName('');
  }

  async function commitUpload() {
    if (!pendingFile || !newName.trim()) return;
    setUploading(true);

    const safeName = pendingFile.name.replace(/\s+/g, '-');
    const storagePath = `${userId}/${projectId}/comparisons/${screenshotId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, pendingFile, { upsert: true });

    if (uploadError) {
      setUploading(false);
      return;
    }

    const imageUrl = supabase.storage
      .from('screenshots')
      .getPublicUrl(storagePath).data.publicUrl;

    const { data, error } = await supabase
      .from('comparisons')
      .insert({
        screenshot_id: screenshotId,
        name: newName.trim(),
        storage_path: storagePath,
      })
      .select()
      .single();

    if (data && !error) {
      const newComp = { ...data, image_url: imageUrl };
      setComparisons((prev) => {
        const updated = [...prev, newComp];
        setActiveIndex(updated.length - 1);
        return updated;
      });
    }

    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setNewName('');
    setAddingMode(false);
    setUploading(false);
  }

  async function deleteComparison(id: string) {
    const comp = comparisons.find((c) => c.id === id);
    if (!comp) return;

    if (comp.storage_path) {
      await supabase.storage.from('screenshots').remove([comp.storage_path]);
    }
    await supabase.from('comparisons').delete().eq('id', id);

    setComparisons((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      setActiveIndex((idx) => Math.max(0, Math.min(idx, updated.length - 1)));
      return updated;
    });
  }

  function startRename(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      await supabase.from('comparisons').update({ name: trimmed }).eq('id', renamingId);
      setComparisons((prev) => prev.map((c) => (c.id === renamingId ? { ...c, name: trimmed } : c)));
    }
    setRenamingId(null);
  }

  const activeComp = !addingMode ? comparisons[activeIndex] || null : null;

  function renderRightSide() {
    // Adding mode — show preview + name input
    if (addingMode) {
      return (
        <div className="compare-adding">
          {pendingPreview && (
            <div className="compare-image compare-image-preview">
              <img src={pendingPreview} alt="Preview" />
            </div>
          )}
          <div className="compare-name-form">
            <input
              ref={nameInputRef}
              className="compare-name-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitUpload();
                if (e.key === 'Escape') cancelAdding();
              }}
              placeholder="Name this comparison..."
              disabled={uploading}
            />
            <div className="compare-name-actions">
              <button className="btn-primary" onClick={commitUpload} disabled={!newName.trim() || uploading}>
                {uploading ? (
                  <>
                    <div className="loading-spinner-small" />
                    Saving...
                  </>
                ) : 'Save'}
              </button>
              <button className="btn-secondary" onClick={cancelAdding} disabled={uploading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Has saved comparisons — show active one
    if (activeComp) {
      return (
        <>
          <DraggableImage src={activeComp.image_url || ''} alt={activeComp.name} />
          <div className="compare-name">
            {renamingId === activeComp.id ? (
              <input
                ref={renameInputRef}
                className="compare-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <span
                onDoubleClick={() => startRename(activeComp.id, activeComp.name)}
                title="Double-click to rename"
                style={{ cursor: 'text' }}
              >
                {activeComp.name}
              </span>
            )}
            <button className="compare-change" onClick={() => deleteComparison(activeComp.id)}>
              Remove
            </button>
          </div>
        </>
      );
    }

    // Loading
    if (loading) {
      return (
        <div className="compare-upload">
          <div className="loading-spinner" />
          <span>Loading...</span>
        </div>
      );
    }

    // Empty — show upload area
    return (
      <div
        className="compare-upload"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>Upload screenshot to compare</span>
      </div>
    );
  }

  return (
    <div className="compare-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compare-header">
          <h3>Compare Screenshots</h3>
          <button className="compare-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="compare-body">
          <div className="compare-side">
            <div className="compare-label">Current</div>
            <DraggableImage src={screenshotUrl} alt={screenshotName} />
            <p className="compare-name">{screenshotName}</p>
          </div>

          <div className="compare-divider">
            <span className="compare-vs">VS</span>
          </div>

          <div className="compare-side">
            <div className="compare-label">
              Compare {comparisons.length > 0 && !addingMode && `(${activeIndex + 1}/${comparisons.length})`}
              {addingMode && '(adding new)'}
            </div>

            {renderRightSide()}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {(comparisons.length > 0 || addingMode) && (
              <div className="compare-nav">
                {comparisons.map((c, i) => (
                  <button
                    key={c.id}
                    className={`compare-nav-dot ${!addingMode && i === activeIndex ? 'active' : ''}`}
                    onClick={() => { setAddingMode(false); setActiveIndex(i); }}
                    title={c.name}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </button>
                ))}
                {!addingMode && (
                  <button
                    className="compare-nav-add"
                    onClick={() => fileInputRef.current?.click()}
                    title="Add comparison"
                  >
                    +
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
