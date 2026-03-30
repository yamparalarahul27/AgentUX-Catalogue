import { useState, useRef, useEffect } from 'react';
import type { Comparison } from '../types';
import { supabase } from '../lib/supabase';

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
  const [uploading, setUploading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load existing comparisons
  useEffect(() => {
    loadComparisons();
  }, [screenshotId]);

  useEffect(() => {
    if (showNameInput && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showNameInput]);

  async function loadComparisons() {
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
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPendingFile(file);
      setNewName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      setShowNameInput(true);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function commitUpload() {
    if (!pendingFile || !newName.trim()) return;
    setUploading(true);
    setShowNameInput(false);

    const safeName = pendingFile.name.replace(/\s+/g, '-');
    const storagePath = `${userId}/${projectId}/comparisons/${screenshotId}/${safeName}`;

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

    setPendingFile(null);
    setNewName('');
    setUploading(false);
  }

  async function deleteComparison(id: string) {
    const comp = comparisons.find((c) => c.id === id);
    if (!comp) return;

    if (comp.storage_path) {
      await supabase.storage.from('screenshots').remove([comp.storage_path]);
    }
    await supabase.from('comparisons').delete().eq('id', id);

    setComparisons((prev) => prev.filter((c) => c.id !== id));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, comparisons.length - 2)));
  }

  const activeComp = comparisons[activeIndex] || null;

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
          {/* Left side — current screenshot */}
          <div className="compare-side">
            <div className="compare-label">Current</div>
            <div className="compare-image">
              <img src={screenshotUrl} alt={screenshotName} />
            </div>
            <p className="compare-name">{screenshotName}</p>
          </div>

          <div className="compare-divider">
            <span className="compare-vs">VS</span>
          </div>

          {/* Right side — comparison images */}
          <div className="compare-side">
            <div className="compare-label">
              Compare {comparisons.length > 0 && `(${activeIndex + 1}/${comparisons.length})`}
            </div>

            {activeComp ? (
              <>
                <div className="compare-image">
                  <img src={activeComp.image_url} alt={activeComp.name} />
                </div>
                <div className="compare-name">
                  <span>{activeComp.name}</span>
                  <button
                    className="compare-change"
                    onClick={() => deleteComparison(activeComp.id)}
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : showNameInput ? (
              <div className="compare-name-form">
                <p className="compare-name-prompt">Name this comparison:</p>
                <input
                  ref={nameInputRef}
                  className="compare-name-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitUpload();
                    if (e.key === 'Escape') { setShowNameInput(false); setPendingFile(null); }
                  }}
                  placeholder="e.g., New Login Design"
                />
                <div className="compare-name-actions">
                  <button className="btn-primary" onClick={commitUpload} disabled={!newName.trim() || uploading}>
                    {uploading ? 'Uploading...' : 'Save'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowNameInput(false); setPendingFile(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
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
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {/* Circular nav dots + add button */}
            {(comparisons.length > 0) && (
              <div className="compare-nav">
                {comparisons.map((c, i) => (
                  <button
                    key={c.id}
                    className={`compare-nav-dot ${i === activeIndex ? 'active' : ''}`}
                    onClick={() => setActiveIndex(i)}
                    title={c.name}
                  />
                ))}
                <button
                  className="compare-nav-add"
                  onClick={() => fileInputRef.current?.click()}
                  title="Add comparison"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
