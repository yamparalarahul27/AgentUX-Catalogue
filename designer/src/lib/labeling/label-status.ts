import type { ScreenshotNode } from '../../types';
import type { LabelStatus, ScreenshotLabel } from './types';

const STORED_STATUSES: ReadonlyArray<LabelStatus> = ['draft', 'needs_review', 'verified'];

function readStoredLabel(metadata: Record<string, unknown> | undefined): ScreenshotLabel | null {
  if (!metadata) return null;
  const candidate = (metadata as Record<string, unknown>).label;
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ScreenshotLabel;
}

export function readLabelStatus(screenshot: ScreenshotNode): LabelStatus {
  const stored = readStoredLabel(screenshot.metadata)?.review?.label_status;
  if (stored && STORED_STATUSES.includes(stored)) return stored;
  return 'unlabeled';
}

export function readLabelTitle(screenshot: ScreenshotNode): string {
  const title = readStoredLabel(screenshot.metadata)?.identity?.title?.trim();
  return title || screenshot.name;
}

export function readLabelPageType(screenshot: ScreenshotNode): string | null {
  const first = readStoredLabel(screenshot.metadata)?.identity?.page_types?.[0];
  return typeof first === 'string' && first.trim() ? first : null;
}
