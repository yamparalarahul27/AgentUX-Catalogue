import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Edge, Node } from '@xyflow/react';
import type { Connection, ScreenshotNode } from '../types';

interface UseCanvasNodeEventsParams {
  supabase: SupabaseClient;
  flowId?: string;
  projectId?: string;
  userId: string;
  touchFlow: () => Promise<void>;
  setScreenshots: Dispatch<SetStateAction<ScreenshotNode[]>>;
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setToast: Dispatch<
    SetStateAction<{ message: string; type: 'error' | 'success' | 'info' } | null>
  >;
  pushUndoSnapshot: () => void;
  markLocalEdit: () => void;
}

export function useCanvasNodeEvents({
  supabase,
  flowId,
  projectId,
  userId,
  touchFlow,
  setScreenshots,
  setConnections,
  setNodes,
  setEdges,
  setToast,
  pushUndoSnapshot,
  markLocalEdit,
}: UseCanvasNodeEventsParams) {
  useEffect(() => {
    const handler = (event: Event) => {
      const { id } = (event as CustomEvent).detail as { id: string };
      pushUndoSnapshot();
      markLocalEdit();

      supabase
        .from('connections')
        .delete()
        .or(`source_id.eq.${id},target_id.eq.${id}`)
        .then(() => {
          supabase.from('screenshots').delete().eq('id', id).then(() => {});
        });

      setScreenshots((prev) => prev.filter((item) => item.id !== id));
      setConnections((prev) =>
        prev.filter((item) => item.source_id !== id && item.target_id !== id),
      );
      setNodes((prev) => prev.filter((item) => item.id !== id));
      setEdges((prev) => prev.filter((item) => item.source !== id && item.target !== id));
      void touchFlow();
    };

    window.addEventListener('delete-screenshot', handler);
    return () => window.removeEventListener('delete-screenshot', handler);
  }, [markLocalEdit, pushUndoSnapshot, setConnections, setEdges, setNodes, setScreenshots, supabase, touchFlow]);

  useEffect(() => {
    const handler = (event: Event) => {
      const { id, name } = (event as CustomEvent).detail as { id: string; name: string };
      pushUndoSnapshot();
      markLocalEdit();
      supabase.from('screenshots').update({ name }).eq('id', id).then(() => {});
      setScreenshots((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name } : item)),
      );
      void touchFlow();
    };

    window.addEventListener('rename-screenshot', handler);
    return () => window.removeEventListener('rename-screenshot', handler);
  }, [markLocalEdit, pushUndoSnapshot, setScreenshots, supabase, touchFlow]);

  useEffect(() => {
    const handler = (event: Event) => {
      const { id, group } = (event as CustomEvent).detail as {
        id: string;
        group: string | null;
      };
      pushUndoSnapshot();
      markLocalEdit();
      supabase.from('screenshots').update({ group }).eq('id', id).then(() => {});
      setScreenshots((prev) =>
        prev.map((item) => (item.id === id ? { ...item, group } : item)),
      );
      void touchFlow();
    };

    window.addEventListener('rename-screenshot-group', handler);
    return () => window.removeEventListener('rename-screenshot-group', handler);
  }, [markLocalEdit, pushUndoSnapshot, setScreenshots, supabase, touchFlow]);

  useEffect(() => {
    const handler = async (event: Event) => {
      const { id, file } = (event as CustomEvent).detail as { id: string; file: File };
      if (!flowId || !projectId) return;

      pushUndoSnapshot();
      markLocalEdit();

      const safeName = file.name.replace(/\s+/g, '-');
      const storagePath = `${userId}/${projectId}/${safeName}`;

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
        prev.map((item) =>
          item.id === id
            ? { ...item, storage_path: storagePath, file_name: file.name, image_url: imageUrl }
            : item,
        ),
      );
      void touchFlow();
    };

    window.addEventListener('attach-screenshot-image', handler);
    return () => window.removeEventListener('attach-screenshot-image', handler);
  }, [flowId, markLocalEdit, projectId, pushUndoSnapshot, setScreenshots, setToast, supabase, touchFlow, userId]);

}
