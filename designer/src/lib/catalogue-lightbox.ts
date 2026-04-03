import { getLightboxAnnotationEntries } from './catalogue-activity';

export interface LightboxAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  user_email: string;
  created_at: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getAnnotationId() {
  return globalThis.crypto?.randomUUID?.() ?? `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function parseAnnotations(metadata: Record<string, unknown> | undefined): LightboxAnnotation[] {
  const entries = getLightboxAnnotationEntries(metadata);
  return entries
    .map((entry) => ({
      id: String(entry.id || getAnnotationId()),
      x: Number(entry.x),
      y: Number(entry.y),
      text: String(entry.text || ''),
      user_email: String(entry.user_email || 'Unknown'),
      created_at: String(entry.created_at || entry.createdAt || new Date().toISOString()),
    }))
    .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y) && item.text.trim().length > 0);
}

export function getContainLayout(container: ImageSize | null, image: ImageSize | null): ImageLayout | null {
  if (!container || !image || !container.width || !container.height || !image.width || !image.height) return null;
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}
