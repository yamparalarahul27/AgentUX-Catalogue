import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

export interface PrototypeRecord {
  id: string;
  title: string;
  filename: string;
  storagePath: string;
  uploaderUserId: string;
  uploaderEmail: string | null;
  visibility: 'private' | 'public';
  createdAt: string;
  updatedAt: string;
}

interface PrototypeRow {
  id: string;
  title: string;
  filename: string;
  storage_path: string;
  uploader_user_id: string;
  uploader_email: string | null;
  visibility: 'private' | 'public';
  created_at: string;
  updated_at: string;
}

function toRecord(row: PrototypeRow): PrototypeRecord {
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    storagePath: row.storage_path,
    uploaderUserId: row.uploader_user_id,
    uploaderEmail: row.uploader_email,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Derive a readable title from a filename like:
//   mockup-2026-05-18-feedback-modal.html  → "Feedback modal"
//   foo.html                                → "Foo"
// User can rename inline after upload.
function deriveTitleFromFilename(filename: string): string {
  let base = filename.replace(/\.html?$/i, '');
  // Strip an opening `mockup-YYYY-MM-DD-` prefix if present.
  base = base.replace(/^mockup-\d{4}-\d{2}-\d{2}-/, '');
  // Strip a bare leading `YYYY-MM-DD-` if present.
  base = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const words = base.replace(/[-_]+/g, ' ').trim();
  if (!words) return filename;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function sanitizeFilenameSegment(filename: string): string {
  // Keep alphanumerics, dots, hyphens, underscores. Collapse anything
  // else into underscores so the storage path stays simple.
  return filename.replace(/[^a-z0-9.\-_]/gi, '_');
}

interface UseCataloguePrototypesArgs {
  userEmail: string;
}

export function useCataloguePrototypes({ userEmail }: UseCataloguePrototypesArgs) {
  const [prototypes, setPrototypes] = useState<PrototypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      // RLS filters this to (uploader_user_id = me) OR (visibility = 'public'),
      // so we get our own private + everyone's public in one query.
      const { data, error } = await supabase
        .from('catalogue_prototypes')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setPrototypes((data ?? []).map((row) => toRecord(row as PrototypeRow)));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadPrototype = useCallback(async (file: File): Promise<PrototypeRecord> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) throw new Error('You need to be signed in to upload prototypes.');
    const userId = userData.user.id;

    const id = crypto.randomUUID();
    const safeName = sanitizeFilenameSegment(file.name);
    const storagePath = `${userId}/${id}-${safeName}`;

    // Re-wrap as a Blob with explicit `text/html` type. Browsers
    // sometimes assign File.type = '' (no detection) or
    // 'application/octet-stream' (Windows file picker), which the
    // Supabase JS client can prefer over the `contentType` option —
    // and the file then serves as plain text in the browser instead
    // of rendering as HTML.
    const htmlBlob = new Blob([file], { type: 'text/html' });

    // Two-stage: storage upload first, then row insert. If the row
    // insert fails (RLS / network), remove the just-uploaded blob so
    // we don't leak orphans in storage.
    const { error: uploadErr } = await supabase.storage
      .from('prototypes')
      .upload(storagePath, htmlBlob, { contentType: 'text/html', upsert: false });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const insertTitle = deriveTitleFromFilename(file.name);
    const { data: row, error: insertErr } = await supabase
      .from('catalogue_prototypes')
      .insert({
        id,
        title: insertTitle,
        filename: file.name,
        storage_path: storagePath,
        uploader_user_id: userId,
        uploader_email: userEmail,
        visibility: 'private',
      })
      .select('*')
      .single();
    if (insertErr || !row) {
      void supabase.storage.from('prototypes').remove([storagePath]);
      throw new Error(insertErr?.message ?? 'Could not save the prototype.');
    }

    const record = toRecord(row as PrototypeRow);
    setPrototypes((prev) => [record, ...prev]);
    return record;
  }, [userEmail]);

  const deletePrototype = useCallback(async (id: string) => {
    const target = prototypes.find((p) => p.id === id);
    if (!target) return;
    // Optimistic: remove from local state immediately.
    setPrototypes((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from('catalogue_prototypes').delete().eq('id', id);
    if (error) {
      // Rollback if the DB delete failed (RLS, etc.).
      setPrototypes((prev) => [target, ...prev]);
      throw new Error(error.message);
    }
    // Best-effort storage cleanup. RLS already confirmed ownership via
    // the row delete, so this should always succeed for our own files.
    void supabase.storage.from('prototypes').remove([target.storagePath]);
  }, [prototypes]);

  const toggleVisibility = useCallback(async (id: string) => {
    const target = prototypes.find((p) => p.id === id);
    if (!target) return;
    const next: 'private' | 'public' = target.visibility === 'public' ? 'private' : 'public';
    setPrototypes((prev) => prev.map((p) => (p.id === id ? { ...p, visibility: next } : p)));
    const { error } = await supabase
      .from('catalogue_prototypes')
      .update({ visibility: next })
      .eq('id', id);
    if (error) {
      setPrototypes((prev) => prev.map((p) => (p.id === id ? target : p)));
      throw new Error(error.message);
    }
  }, [prototypes]);

  const reuploadPrototype = useCallback(async (id: string, file: File) => {
    const target = prototypes.find((p) => p.id === id);
    if (!target) return;
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) throw new Error('You need to be signed in.');
    const userId = userData.user.id;

    const safeName = sanitizeFilenameSegment(file.name);
    const newStoragePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

    // Same `text/html` Blob re-wrap as the initial upload path —
    // see comment there for why this matters.
    const htmlBlob = new Blob([file], { type: 'text/html' });
    const { error: uploadErr } = await supabase.storage
      .from('prototypes')
      .upload(newStoragePath, htmlBlob, { contentType: 'text/html', upsert: false });
    if (uploadErr) throw new Error(`Reupload failed: ${uploadErr.message}`);

    const { error: updateErr } = await supabase
      .from('catalogue_prototypes')
      .update({ filename: file.name, storage_path: newStoragePath })
      .eq('id', id);
    if (updateErr) {
      void supabase.storage.from('prototypes').remove([newStoragePath]);
      throw new Error(updateErr.message);
    }

    const oldPath = target.storagePath;
    setPrototypes((prev) => prev.map((p) => (p.id === id
      ? { ...p, filename: file.name, storagePath: newStoragePath, updatedAt: new Date().toISOString() }
      : p)));
    void supabase.storage.from('prototypes').remove([oldPath]);
  }, [prototypes]);

  const renamePrototype = useCallback(async (id: string, title: string) => {
    const target = prototypes.find((p) => p.id === id);
    if (!target) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === target.title) return;
    setPrototypes((prev) => prev.map((p) => (p.id === id ? { ...p, title: trimmed } : p)));
    const { error } = await supabase
      .from('catalogue_prototypes')
      .update({ title: trimmed })
      .eq('id', id);
    if (error) {
      setPrototypes((prev) => prev.map((p) => (p.id === id ? target : p)));
      throw new Error(error.message);
    }
  }, [prototypes]);

  return {
    prototypes,
    loading,
    loadError,
    uploadPrototype,
    deletePrototype,
    toggleVisibility,
    reuploadPrototype,
    renamePrototype,
  };
}
