import type { SupabaseClient } from '@supabase/supabase-js';
import type { Connection, ScreenshotNode } from '../types';

export interface GraphSnapshot {
  screenshots: ScreenshotNode[];
  connections: Connection[];
}

interface ApplyGraphSnapshotParams {
  supabase: SupabaseClient;
  flowId: string;
  projectId: string;
  currentScreenshots: ScreenshotNode[];
  snapshot: GraphSnapshot;
}

function cloneScreenshots(items: ScreenshotNode[]): ScreenshotNode[] {
  return items.map((item) => ({ ...item }));
}

function cloneConnections(items: Connection[]): Connection[] {
  return items.map((item) => ({ ...item }));
}

export function createGraphSnapshot(
  screenshots: ScreenshotNode[],
  connections: Connection[],
): GraphSnapshot {
  return {
    screenshots: cloneScreenshots(screenshots),
    connections: cloneConnections(connections),
  };
}

function toScreenshotRow(item: ScreenshotNode, flowId: string, projectId: string) {
  return {
    id: item.id,
    project_id: item.project_id || projectId,
    flow_id: flowId,
    name: item.name,
    file_name: item.file_name || '',
    storage_path: item.storage_path || '',
    sequence: item.sequence,
    group: item.group,
    platform: item.platform,
    theme: item.theme,
    reference_url: item.reference_url,
    reference_storage_path: item.reference_storage_path,
    reference_label: item.reference_label,
    position_x: item.position_x,
    position_y: item.position_y,
    metadata: item.metadata || {},
  };
}

function toConnectionRow(item: Connection, flowId: string, projectId: string) {
  return {
    id: item.id,
    project_id: item.project_id || projectId,
    flow_id: flowId,
    source_id: item.source_id,
    target_id: item.target_id,
    type: item.type,
    label: item.label,
    arrow_direction: item.arrow_direction,
    source_handle: item.source_handle,
    target_handle: item.target_handle,
  };
}

function withPublicUrls(
  supabase: SupabaseClient,
  screenshots: ScreenshotNode[],
): ScreenshotNode[] {
  return screenshots.map((item) => ({
    ...item,
    image_url: item.storage_path
      ? supabase.storage.from('screenshots').getPublicUrl(item.storage_path).data.publicUrl
      : '',
  }));
}

export async function applyGraphSnapshot({
  supabase,
  flowId,
  projectId,
  currentScreenshots,
  snapshot,
}: ApplyGraphSnapshotParams): Promise<GraphSnapshot> {
  const snapshotIds = new Set(snapshot.screenshots.map((item) => item.id));
  const idsToDelete = currentScreenshots
    .map((item) => item.id)
    .filter((id) => !snapshotIds.has(id));

  if (idsToDelete.length > 0) {
    const clauses = idsToDelete.map((id) => `source_id.eq.${id},target_id.eq.${id}`);
    await supabase.from('connections').delete().or(clauses.join(','));
  }

  if (snapshot.screenshots.length > 0) {
    const { error: screenshotUpsertError } = await supabase
      .from('screenshots')
      .upsert(
        snapshot.screenshots.map((item) => toScreenshotRow(item, flowId, projectId)),
        { onConflict: 'id' },
      );

    if (screenshotUpsertError) {
      throw screenshotUpsertError;
    }
  }

  if (idsToDelete.length > 0) {
    const { error: screenshotDeleteError } = await supabase
      .from('screenshots')
      .delete()
      .in('id', idsToDelete);

    if (screenshotDeleteError) {
      throw screenshotDeleteError;
    }
  }

  const { error: connectionDeleteError } = await supabase
    .from('connections')
    .delete()
    .eq('flow_id', flowId);

  if (connectionDeleteError) {
    throw connectionDeleteError;
  }

  let restoredConnections: Connection[] = [];
  if (snapshot.connections.length > 0) {
    const { data, error: connectionInsertError } = await supabase
      .from('connections')
      .insert(
        snapshot.connections.map((item) => toConnectionRow(item, flowId, projectId)),
      )
      .select('*');

    if (connectionInsertError) {
      throw connectionInsertError;
    }

    restoredConnections = (data || []) as Connection[];
  }

  const restoredScreenshots = withPublicUrls(
    supabase,
    snapshot.screenshots.map((item) => ({ ...item, flow_id: flowId })),
  );

  return {
    screenshots: restoredScreenshots,
    connections: restoredConnections,
  };
}
