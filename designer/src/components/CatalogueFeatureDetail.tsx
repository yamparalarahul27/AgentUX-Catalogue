import { useMemo } from 'react';

import type { FeatureLogLinkType, FeatureLogStatus, FeatureLogSummary } from '../types';
import type { FeatureLogLinkedScreenshotItem } from '../hooks/use-feature-log-data';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';

interface CatalogueFeatureDetailProps {
  canEdit: boolean;
  feature: FeatureLogSummary;
  linksError: string | null;
  linkedScreenshots: FeatureLogLinkedScreenshotItem[];
  loadingLinks: boolean;
  onBack: () => void;
  onEdit: (feature: FeatureLogSummary) => void;
  onMarkShipped: () => void;
  onOpenLinkPicker: (linkType: FeatureLogLinkType) => void;
  onReopen: () => void;
  onUnlink: (item: FeatureLogLinkedScreenshotItem) => void;
  saving: boolean;
}

const STATUS_LABEL: Record<FeatureLogStatus, string> = {
  planned: 'Planned',
  reference: 'Reference',
  shipped: 'Shipped',
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'recently';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'recently';
  }

  return new Date(parsed).toLocaleDateString();
}

function statusClass(status: FeatureLogStatus): string {
  return `catalogue-feature-log__badge--${status}`;
}

function buildVariantLabel(item: FeatureLogLinkedScreenshotItem): string {
  const screenshot = item.screenshot;
  if (!screenshot) {
    return 'Unknown';
  }

  const parts: string[] = [];

  if (screenshot.theme) {
    parts.push(screenshot.theme === 'light' ? 'Light' : 'Dark');
  }

  if (screenshot.platform) {
    parts.push(screenshot.platform === 'web' ? 'Web' : 'Mobile');
  }

  if (screenshot.platform === 'web' && screenshot.web_preset_key) {
    parts.push(screenshot.web_preset_key);
  }

  if (screenshot.platform === 'mobile' && screenshot.mobile_os) {
    parts.push(screenshot.mobile_os === 'ios' ? 'iOS' : 'Android');
  }

  return parts.length > 0 ? parts.join(' / ') : 'Unknown';
}

function LinkCard({
  canEdit,
  item,
  onUnlink,
  saving,
}: {
  canEdit: boolean;
  item: FeatureLogLinkedScreenshotItem;
  onUnlink: (item: FeatureLogLinkedScreenshotItem) => void;
  saving: boolean;
}) {
  const screenshot = item.screenshot;

  return (
    <article className="catalogue-feature-log-detail__card">
      <div className="catalogue-feature-log-detail__media">
        {screenshot?.image_url ? (
          <img src={screenshot.image_url} alt={screenshot.name || screenshot.file_name || 'Screenshot'} loading="lazy" />
        ) : (
          <div className="catalogue-feature-log-detail__media-empty">No preview</div>
        )}
      </div>

      <div className="catalogue-feature-log-detail__content">
        <div className="catalogue-feature-log-detail__title-row">
          <h4 title={screenshot?.name || 'Missing screenshot'}>
            {screenshot?.name || 'Missing screenshot'}
          </h4>
          {canEdit && (
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => onUnlink(item)}
            >
              Unlink
            </button>
          )}
        </div>

        <div className="catalogue-feature-log-detail__chips">
          {screenshot?.group && (
            <span className="catalogue-feature-log-detail__chip">
              <CatalogueGroupLabel group={screenshot.group} projectId={screenshot.project_id} />
            </span>
          )}
          {screenshot?.flow_label && (
            <span className="catalogue-feature-log-detail__chip">{screenshot.flow_label}</span>
          )}
          <span className="catalogue-feature-log-detail__chip">{buildVariantLabel(item)}</span>
          <span className="catalogue-feature-log-detail__chip">Uploaded {formatDate(screenshot?.created_at)}</span>
        </div>

        <div className="catalogue-feature-log-detail__meta">
          <span>{screenshot?.comment_count ?? 0} comment{(screenshot?.comment_count ?? 0) === 1 ? '' : 's'}</span>
          <span>{screenshot?.annotation_count ?? 0} annotation{(screenshot?.annotation_count ?? 0) === 1 ? '' : 's'}</span>
          <span>Linked {formatDate(item.created_at)}</span>
        </div>
      </div>
    </article>
  );
}

interface LinkSectionProps {
  canEdit: boolean;
  emptyCopy: string;
  items: FeatureLogLinkedScreenshotItem[];
  onOpenLinkPicker: () => void;
  onUnlink: (item: FeatureLogLinkedScreenshotItem) => void;
  saving: boolean;
  title: string;
}

function LinkSection({
  canEdit,
  emptyCopy,
  items,
  onOpenLinkPicker,
  onUnlink,
  saving,
  title,
}: LinkSectionProps) {
  return (
    <section className="catalogue-feature-log-detail__section">
      <header className="catalogue-feature-log-detail__section-head">
        <h3>{title}</h3>
        {canEdit && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenLinkPicker}
            disabled={saving}
          >
            Link screenshot
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="catalogue-feature-log-detail__empty">{emptyCopy}</div>
      ) : (
        <div className="catalogue-feature-log-detail__list">
          {items.map((item) => (
            <LinkCard
              key={item.id}
              canEdit={canEdit}
              item={item}
              onUnlink={onUnlink}
              saving={saving}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function CatalogueFeatureDetail({
  canEdit,
  feature,
  linksError,
  linkedScreenshots,
  loadingLinks,
  onBack,
  onEdit,
  onMarkShipped,
  onOpenLinkPicker,
  onReopen,
  onUnlink,
  saving,
}: CatalogueFeatureDetailProps) {
  const referenceLinks = useMemo(
    () => linkedScreenshots.filter((item) => item.link_type === 'reference'),
    [linkedScreenshots],
  );

  const shippedLinks = useMemo(
    () => linkedScreenshots.filter((item) => item.link_type === 'shipped'),
    [linkedScreenshots],
  );

  return (
    <section className="catalogue-feature-log-detail">
      <header className="catalogue-feature-log-detail__head">
        <div className="catalogue-feature-log-detail__head-left">
          <button
            type="button"
            className="catalogue-feature-log-detail__back"
            onClick={onBack}
            title="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

          <div className="catalogue-feature-log-detail__copy">
            <h2 title={feature.title}>{feature.title}</h2>
            <p>{feature.description?.trim() || 'No description provided yet.'}</p>
            <div className="catalogue-feature-log-detail__summary-meta">
              <span className={`catalogue-feature-log__badge ${statusClass(feature.status)}`}>
                {STATUS_LABEL[feature.status]}
              </span>
              <span>{referenceLinks.length} reference</span>
              <span>{shippedLinks.length} shipped</span>
              <span>{linkedScreenshots.length} total links</span>
            </div>
          </div>
        </div>

        <div className="catalogue-feature-log-detail__actions">
          {canEdit && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onEdit(feature)}
              disabled={saving}
            >
              Edit
            </button>
          )}

          {canEdit && feature.status === 'shipped' ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={onReopen}
              disabled={saving}
            >
              Reopen
            </button>
          ) : canEdit ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onMarkShipped}
              disabled={saving}
            >
              Mark Shipped
            </button>
          ) : null}
        </div>
      </header>

      {linksError && (
        <div className="catalogue-feature-log__error">
          <span>{linksError}</span>
        </div>
      )}

      {loadingLinks ? (
        <div className="catalogue-feature-log__loading">
          <div className="loading-spinner" />
          <span>Loading linked screenshots…</span>
        </div>
      ) : (
        <div className="catalogue-feature-log-detail__sections">
          <LinkSection
            canEdit={canEdit}
            title="Shipped"
            emptyCopy="No shipped screenshots linked yet."
            items={shippedLinks}
            onOpenLinkPicker={() => onOpenLinkPicker('shipped')}
            onUnlink={onUnlink}
            saving={saving}
          />

          <LinkSection
            canEdit={canEdit}
            title="Reference"
            emptyCopy="No reference screenshots linked yet."
            items={referenceLinks}
            onOpenLinkPicker={() => onOpenLinkPicker('reference')}
            onUnlink={onUnlink}
            saving={saving}
          />
        </div>
      )}
    </section>
  );
}
