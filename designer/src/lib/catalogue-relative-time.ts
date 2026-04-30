const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string | null {
  const date = toDate(value);
  if (!date) return null;

  const diff = now.getTime() - date.getTime();
  if (diff < 0) return 'just now';
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / MINUTE_MS);
    return `${m}m ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h}h ago`;
  }
  if (diff < 2 * DAY_MS) return 'yesterday';
  if (diff < WEEK_MS) {
    const d = Math.floor(diff / DAY_MS);
    return `${d}d ago`;
  }
  if (diff < 30 * DAY_MS) {
    const w = Math.floor(diff / WEEK_MS);
    return `${w}w ago`;
  }
  if (diff < 365 * DAY_MS) {
    const months = Math.floor(diff / (30 * DAY_MS));
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / (365 * DAY_MS));
  return `${years}y ago`;
}

export function isWithinHours(value: string | Date | null | undefined, hours: number, now: Date = new Date()): boolean {
  const date = toDate(value);
  if (!date) return false;
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff < hours * HOUR_MS;
}
