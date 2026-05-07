import { ImageIcon } from 'lucide-react';

import type { ScreenshotNode } from '../../types';
import { ThumbHashImage } from '../ThumbHashImage';
import { getGroupColor } from '../../lib/naming';
import { readLabelPageType, readLabelTitle } from '../../lib/labeling/label-status';
import type { LabelStatus } from '../../lib/labeling/types';

interface Props {
  screenshot: ScreenshotNode;
  status: LabelStatus;
  isSelected?: boolean;
  onClick?: () => void;
}

const STATUS_LABEL: Record<LabelStatus, string> = {
  unlabeled: 'Unlabelled',
  draft: 'Draft',
  needs_review: 'Needs review',
  verified: 'Verified',
};

export function LabelingStudioCard({ screenshot, status, isSelected, onClick }: Props) {
  const title = readLabelTitle(screenshot);
  const pageType = readLabelPageType(screenshot);
  const groupColor = screenshot.group ? getGroupColor(screenshot.group) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`labeling-studio-card labeling-studio-card--${status} ${isSelected ? 'is-selected' : ''}`}
      aria-pressed={isSelected ?? false}
    >
      <div className="labeling-studio-card__image">
        {screenshot.image_url ? (
          <ThumbHashImage
            src={screenshot.image_url}
            thumbHash={screenshot.thumb_hash ?? null}
            alt={title}
          />
        ) : (
          <div className="labeling-studio-card__placeholder">
            <ImageIcon size={24} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="labeling-studio-card__meta">
        <span className={`labeling-studio-card__status labeling-studio-card__status--${status}`}>
          {STATUS_LABEL[status]}
        </span>
        <span className="labeling-studio-card__title" title={title}>
          {title}
        </span>
        <span className="labeling-studio-card__subtitle">
          {groupColor && (
            <span
              className="labeling-studio-card__group-dot"
              style={{ background: groupColor }}
              aria-hidden="true"
            />
          )}
          {pageType ?? '—'}
          <span className="labeling-studio-card__sep" aria-hidden="true">·</span>
          {screenshot.platform ?? '—'}
        </span>
      </div>
    </button>
  );
}
