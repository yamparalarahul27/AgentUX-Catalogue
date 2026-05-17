import { supabase } from './supabase';

export type AnnotationShape = 'pin' | 'area';

export interface ScreenshotAnnotation {
  id: string;
  screenshot_id: string;
  shape: AnnotationShape;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  text: string;
  user_email: string | null;
  created_at: string;
}

export interface AnnotationActivity {
  counts: Record<string, number>;
  lastAddedAt: Record<string, string | null>;
}

interface AnnotationRow {
  id: string;
  screenshot_id: string;
  shape: string;
  x: number | string;
  y: number | string;
  width: number | string | null;
  height: number | string | null;
  text: string;
  user_email: string | null;
  created_at: string;
}

function toAnnotation(row: AnnotationRow): ScreenshotAnnotation {
  return {
    id: row.id,
    screenshot_id: row.screenshot_id,
    shape: row.shape === 'area' ? 'area' : 'pin',
    x: Number(row.x),
    y: Number(row.y),
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    text: row.text,
    user_email: row.user_email,
    created_at: row.created_at,
  };
}

export async function fetchAnnotationsForScreenshot(screenshotId: string): Promise<ScreenshotAnnotation[]> {
  const { data, error } = await supabase
    .from('screenshot_annotations')
    .select('*')
    .eq('screenshot_id', screenshotId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as AnnotationRow[]).map(toAnnotation);
}

export async function insertAnnotation(payload: {
  screenshot_id: string;
  shape: AnnotationShape;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  text: string;
  user_email: string;
}): Promise<ScreenshotAnnotation | null> {
  const { data, error } = await supabase
    .from('screenshot_annotations')
    .insert({
      screenshot_id: payload.screenshot_id,
      shape: payload.shape,
      x: payload.x,
      y: payload.y,
      width: payload.width ?? null,
      height: payload.height ?? null,
      text: payload.text,
      user_email: payload.user_email,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  return toAnnotation(data as AnnotationRow);
}

export async function deleteAnnotation(id: string): Promise<boolean> {
  const { error } = await supabase.from('screenshot_annotations').delete().eq('id', id);
  return !error;
}

export async function updateAnnotationGeometry(
  id: string,
  geometry: { x: number; y: number; width: number | null; height: number | null },
): Promise<boolean> {
  const { error } = await supabase
    .from('screenshot_annotations')
    .update({
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
    })
    .eq('id', id);
  return !error;
}

export async function fetchAnnotationActivity(screenshotIds: string[]): Promise<AnnotationActivity> {
  if (screenshotIds.length === 0) return { counts: {}, lastAddedAt: {} };
  const { data, error } = await supabase
    .from('screenshot_annotations')
    .select('screenshot_id, created_at')
    .in('screenshot_id', screenshotIds);
  if (error || !data) return { counts: {}, lastAddedAt: {} };

  const counts: Record<string, number> = {};
  const lastAddedAt: Record<string, string | null> = {};
  for (const row of data as { screenshot_id: string; created_at: string | null }[]) {
    counts[row.screenshot_id] = (counts[row.screenshot_id] || 0) + 1;
    if (!row.created_at) continue;
    const previous = lastAddedAt[row.screenshot_id];
    if (!previous || new Date(row.created_at).getTime() > new Date(previous).getTime()) {
      lastAddedAt[row.screenshot_id] = row.created_at;
    }
  }
  return { counts, lastAddedAt };
}

export async function fetchAnnotationLabels(): Promise<string[]> {
  const { data, error } = await supabase
    .from('screenshot_annotations')
    .select('text');
  if (error || !data) return [];
  const seen = new Map<string, string>();
  for (const row of data as { text: string }[]) {
    const trimmed = (row.text || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

export async function fetchScreenshotIdsWithAnnotationLabels(
  labels: string[],
): Promise<string[]> {
  if (labels.length === 0) return [];
  const lowered = labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return [];
  // RPC still accepts a project_ids parameter for deploy-window backwards
  // compatibility (see migration 20260517_remove_project_scoping). Passing
  // an empty array — the function ignores it.
  const { data, error } = await supabase.rpc('screenshots_with_annotation_labels', {
    project_ids: [],
    labels: lowered,
  });
  if (error || !data) return [];
  const ids = new Set<string>();
  for (const row of data as { screenshot_id: string }[]) {
    if (row.screenshot_id) ids.add(row.screenshot_id);
  }
  return [...ids];
}
