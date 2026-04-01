import type { SupabaseClient } from '@supabase/supabase-js';
import type { Node } from '@xyflow/react';
import { parseScreenshotName } from './naming';
import { parseMultiPathFlow } from './parse-flow-paths';
import { normalizeFlowStep } from './flow-step-normalizer';
import { layoutElements, NODE_WIDTH, RANK_SEP } from './canvas-graph';
import type { Connection, ScreenshotNode } from '../types';

interface FlowContext {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  flowId: string;
}

interface UploadFilesParams extends FlowContext {
  files: File[];
}

interface InsertFlowFromTextParams extends FlowContext {
  text: string;
  existingScreenshots: ScreenshotNode[];
  existingConnections: Connection[];
  currentNodes: Node[];
}

interface InsertPlaceholderBetweenParams extends FlowContext {
  connection: Connection;
  sourceNode: Node;
  targetNode: Node;
  placeholderName?: string;
}

interface CreatePlaceholderNodeParams {
  supabase: SupabaseClient;
  projectId: string;
  flowId: string;
  name: string;
  positionX: number;
  positionY: number;
}

function resolveImageUrl(supabase: SupabaseClient, storagePath: string): string {
  if (!storagePath) return '';
  return supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
}

export async function touchFlowUpdatedAt(
  supabase: SupabaseClient,
  flowId: string,
): Promise<void> {
  await supabase
    .from('flows')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', flowId);
}

export function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.82,
): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }

    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      if (img.width <= maxWidth && file.size < 300_000) {
        resolve(file);
        return;
      }

      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/webp' }) : file);
        },
        'image/webp',
        quality,
      );
    };

    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadFilesToFlow({
  supabase,
  userId,
  projectId,
  flowId,
  files,
}: UploadFilesParams): Promise<{ added: ScreenshotNode[]; failed: number }> {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const compressed = await compressImage(file);
      const parsed = parseScreenshotName(file.name);
      const safeName = file.name.replace(/\s+/g, '-');
      const storagePath = `${userId}/${projectId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, compressed, { upsert: true });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('screenshots')
        .insert({
          project_id: projectId,
          flow_id: flowId,
          name: parsed.name,
          file_name: file.name,
          storage_path: storagePath,
          sequence: parsed.sequence,
          group: parsed.group,
        })
        .select('*')
        .single();

      if (error || !data) throw error;

      return {
        ...(data as ScreenshotNode),
        image_url: resolveImageUrl(supabase, storagePath),
      };
    }),
  );

  const added: ScreenshotNode[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      added.push(result.value as ScreenshotNode);
    }
  }

  const failed = results.filter((result) => result.status === 'rejected').length;

  return { added, failed };
}

function buildExistingScreenshotIndex(screenshots: ScreenshotNode[]) {
  const byKey = new Map<string, ScreenshotNode>();

  for (const screenshot of screenshots) {
    const { key } = normalizeFlowStep(screenshot.name);
    if (!byKey.has(key)) {
      byKey.set(key, screenshot);
    }
  }

  return byKey;
}

function buildTempGraph(nodeNames: string[], graphEdges: [string, string][]) {
  const normalized = nodeNames.map((name, index) => ({
    ...normalizeFlowStep(name),
    tempId: `temp-${index}`,
  }));

  const keyToTempId = new Map(normalized.map((item) => [item.key, item.tempId]));

  const tempNodes: Node[] = normalized.map((item) => ({
    id: item.tempId,
    type: 'screenshotNode',
    position: { x: 0, y: 0 },
    data: { label: item.display },
  }));

  const tempEdges = graphEdges.map(([source, target], index) => ({
    id: `temp-edge-${index}`,
    source: keyToTempId.get(normalizeFlowStep(source).key)!,
    target: keyToTempId.get(normalizeFlowStep(target).key)!,
  }));

  const layout = layoutElements(tempNodes, tempEdges, 'LR');

  return {
    normalized,
    keyToTempId,
    layout,
  };
}

function computeLayoutOffset(
  parsedKeys: string[],
  existingByKey: Map<string, ScreenshotNode>,
  keyToTempId: Map<string, string>,
  laidOutNodes: Node[],
  currentNodes: Node[],
): { x: number; y: number } {
  const laidById = new Map(laidOutNodes.map((node) => [node.id, node]));

  const anchored = parsedKeys
    .map((key) => {
      const existing = existingByKey.get(key);
      const tempId = keyToTempId.get(key);
      const laid = tempId ? laidById.get(tempId) : null;

      if (!existing || !laid || existing.position_x === null || existing.position_y === null) {
        return null;
      }

      return {
        existingX: existing.position_x,
        existingY: existing.position_y,
        laidX: laid.position.x,
        laidY: laid.position.y,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (anchored.length > 0) {
    const avgExistingX = anchored.reduce((sum, item) => sum + item.existingX, 0) / anchored.length;
    const avgExistingY = anchored.reduce((sum, item) => sum + item.existingY, 0) / anchored.length;
    const avgLaidX = anchored.reduce((sum, item) => sum + item.laidX, 0) / anchored.length;
    const avgLaidY = anchored.reduce((sum, item) => sum + item.laidY, 0) / anchored.length;

    return { x: avgExistingX - avgLaidX, y: avgExistingY - avgLaidY };
  }

  if (currentNodes.length > 0) {
    const maxX = Math.max(...currentNodes.map((node) => node.position.x + NODE_WIDTH));
    const avgY = currentNodes.reduce((sum, node) => sum + node.position.y, 0) / currentNodes.length;
    const newAvgY = laidOutNodes.reduce((sum, node) => sum + node.position.y, 0) / laidOutNodes.length;

    return {
      x: maxX + RANK_SEP,
      y: avgY - newAvgY,
    };
  }

  return { x: 0, y: 0 };
}

export async function insertFlowFromText({
  supabase,
  projectId,
  flowId,
  text,
  existingScreenshots,
  existingConnections,
  currentNodes,
}: InsertFlowFromTextParams): Promise<{ newScreenshots: ScreenshotNode[]; newConnections: Connection[] }> {
  const { nodeNames, edges: graphEdges } = parseMultiPathFlow(text);

  if (nodeNames.length === 0) {
    return { newScreenshots: [], newConnections: [] };
  }

  const existingByKey = buildExistingScreenshotIndex(existingScreenshots);
  const { normalized, keyToTempId, layout } = buildTempGraph(nodeNames, graphEdges);

  const offset = computeLayoutOffset(
    normalized.map((item) => item.key),
    existingByKey,
    keyToTempId,
    layout.nodes,
    currentNodes,
  );

  const laidById = new Map(layout.nodes.map((node) => [node.id, node]));
  const keyToDbId = new Map<string, string>();

  for (const item of normalized) {
    const existing = existingByKey.get(item.key);
    if (existing) {
      keyToDbId.set(item.key, existing.id);
    }
  }

  const newScreenshots: ScreenshotNode[] = [];

  for (const item of normalized) {
    if (keyToDbId.has(item.key)) continue;

    const laidNode = laidById.get(item.tempId);
    const x = (laidNode?.position.x || 0) + offset.x;
    const y = (laidNode?.position.y || 0) + offset.y;

    const { data, error } = await supabase
      .from('screenshots')
      .insert({
        project_id: projectId,
        flow_id: flowId,
        name: item.display,
        file_name: '',
        storage_path: '',
        sequence: null,
        group: null,
        position_x: x,
        position_y: y,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw error;
    }

    const screenshot = { ...(data as ScreenshotNode), image_url: '' };
    keyToDbId.set(item.key, screenshot.id);
    newScreenshots.push(screenshot);
  }

  const existingPairs = new Set(
    existingConnections.map((item) => `${item.source_id}\0${item.target_id}`),
  );

  const connectionsToCreate = graphEdges
    .map(([source, target]) => {
      const sourceId = keyToDbId.get(normalizeFlowStep(source).key);
      const targetId = keyToDbId.get(normalizeFlowStep(target).key);

      if (!sourceId || !targetId || sourceId === targetId) {
        return null;
      }

      const pairKey = `${sourceId}\0${targetId}`;
      if (existingPairs.has(pairKey)) {
        return null;
      }

      existingPairs.add(pairKey);

      return {
        project_id: projectId,
        flow_id: flowId,
        source_id: sourceId,
        target_id: targetId,
        source_handle: 'right-source',
        target_handle: 'left-target',
        type: 'manual' as const,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let newConnections: Connection[] = [];
  if (connectionsToCreate.length > 0) {
    const { data, error } = await supabase
      .from('connections')
      .insert(connectionsToCreate)
      .select('*');

    if (error) {
      throw error;
    }

    newConnections = (data || []) as Connection[];
  }

  return { newScreenshots, newConnections };
}

export async function createPlaceholderNode({
  supabase,
  projectId,
  flowId,
  name,
  positionX,
  positionY,
}: CreatePlaceholderNodeParams): Promise<ScreenshotNode> {
  const { data, error } = await supabase
    .from('screenshots')
    .insert({
      project_id: projectId,
      flow_id: flowId,
      name,
      file_name: '',
      storage_path: '',
      sequence: null,
      group: null,
      position_x: positionX,
      position_y: positionY,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error;
  }

  return {
    ...(data as ScreenshotNode),
    image_url: '',
  };
}

export async function insertPlaceholderBetweenConnection({
  supabase,
  projectId,
  flowId,
  connection,
  sourceNode,
  targetNode,
  placeholderName = 'Placeholder step',
}: InsertPlaceholderBetweenParams): Promise<{
  placeholder: ScreenshotNode;
  createdConnections: Connection[];
}> {
  const midpointX = (sourceNode.position.x + targetNode.position.x) / 2;
  const midpointY = (sourceNode.position.y + targetNode.position.y) / 2;

  const placeholder = await createPlaceholderNode({
    supabase,
    projectId,
    flowId,
    name: placeholderName,
    positionX: midpointX,
    positionY: midpointY,
  });

  const { error: deleteError } = await supabase
    .from('connections')
    .delete()
    .eq('id', connection.id);

  if (deleteError) {
    throw deleteError;
  }

  const { data, error } = await supabase
    .from('connections')
    .insert([
      {
        project_id: projectId,
        flow_id: flowId,
        source_id: connection.source_id,
        target_id: placeholder.id,
        source_handle: connection.source_handle || 'right-source',
        target_handle: 'left-target',
        type: 'manual',
      },
      {
        project_id: projectId,
        flow_id: flowId,
        source_id: placeholder.id,
        target_id: connection.target_id,
        source_handle: 'right-source',
        target_handle: connection.target_handle || 'left-target',
        type: 'manual',
      },
    ])
    .select('*');

  if (error) {
    throw error;
  }

  return {
    placeholder,
    createdConnections: (data || []) as Connection[],
  };
}
