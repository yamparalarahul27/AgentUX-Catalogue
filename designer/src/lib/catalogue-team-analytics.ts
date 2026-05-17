import type { ScreenshotNode } from '../types';

export const TEAM_ANALYTICS_TIMEZONE = 'Asia/Kolkata';
export const UNKNOWN_UPLOADER = 'Unknown uploader';

export interface TeamUploadAnalyticsRow {
  date: string;
  mobileCount: number;
  totalCount: number;
  userEmail: string;
  webCount: number;
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: TEAM_ANALYTICS_TIMEZONE,
  year: 'numeric',
});

const IST_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: TEAM_ANALYTICS_TIMEZONE,
  year: 'numeric',
});

function normalizeUploaderEmail(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : UNKNOWN_UPLOADER;
}

function getIstDateKey(createdAt: string | undefined) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = IST_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function formatTeamAnalyticsDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return IST_LABEL_FORMATTER.format(date);
}

export function buildTeamUploadAnalyticsRows(
  screenshots: ScreenshotNode[],
): TeamUploadAnalyticsRow[] {
  const grouped = new Map<string, TeamUploadAnalyticsRow>();

  for (const screenshot of screenshots) {
    if (screenshot.platform !== 'web' && screenshot.platform !== 'mobile') continue;

    const dateKey = getIstDateKey(screenshot.created_at);
    if (!dateKey) continue;

    const userEmail = normalizeUploaderEmail(screenshot.uploader_email);
    const groupKey = `${dateKey}\u0000${userEmail}`;
    const existing = grouped.get(groupKey) || {
      date: dateKey,
      mobileCount: 0,
      totalCount: 0,
      userEmail,
      webCount: 0,
    };

    if (screenshot.platform === 'web') {
      existing.webCount += 1;
    }

    if (screenshot.platform === 'mobile') {
      existing.mobileCount += 1;
    }

    existing.totalCount = existing.webCount + existing.mobileCount;
    grouped.set(groupKey, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date);
    return left.userEmail.localeCompare(right.userEmail);
  });
}
