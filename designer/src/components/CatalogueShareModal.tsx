import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

import { buildShareUrl, type SharePlatform } from '../lib/share-url';
import type { ScreenshotNode } from '../types';
import { CATALOGUE_FLOW_LABEL_KEY } from '../lib/catalogue-families';
import { Dropdown } from './Dropdown';

interface CatalogueShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: string[];
  // Source of truth for matching counts. We accept the full-scope
  // screenshots so we can show "X screens match" without an extra query.
  screenshots: ScreenshotNode[];
  initialGroup: string | null;
  initialFlow: string | null;
  initialPlatform: SharePlatform | null;
  userEmail: string | null;
}

function getFlowLabel(screenshot: ScreenshotNode): string | null {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata[CATALOGUE_FLOW_LABEL_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

const PLATFORM_OPTIONS = [
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: 'Mobile' },
];

export function CatalogueShareModal({
  isOpen,
  onClose,
  groups,
  screenshots,
  initialGroup,
  initialFlow,
  initialPlatform,
  userEmail,
}: CatalogueShareModalProps) {
  const [group, setGroup] = useState<string | null>(initialGroup);
  const [flow, setFlow] = useState<string | null>(initialFlow);
  const [platform, setPlatform] = useState<SharePlatform | null>(initialPlatform);
  const [title, setTitle] = useState<string>('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setGroup(initialGroup);
    setFlow(initialFlow);
    setPlatform(initialPlatform);
    setTitle('');
    setTitleTouched(false);
    setCopied(false);
  }, [isOpen, initialGroup, initialFlow, initialPlatform]);

  // Auto-fill title from group + flow when both are picked, unless the
  // user has already typed something (then their value wins).
  useEffect(() => {
    if (titleTouched) return;
    if (group && flow) {
      setTitle(`${group} · ${flow}`);
    } else {
      setTitle('');
    }
  }, [group, flow, titleTouched]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Flows available for the selected group (derived from current screenshots).
  const flowsForGroup = useMemo(() => {
    if (!group) return [] as string[];
    const set = new Set<string>();
    for (const screenshot of screenshots) {
      if (screenshot.group !== group) continue;
      const f = getFlowLabel(screenshot);
      if (f) set.add(f);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [group, screenshots]);

  const groupOptions = useMemo(
    () => groups.map((value) => ({ value, label: value })),
    [groups],
  );

  const flowOptions = useMemo(
    () => flowsForGroup.map((value) => ({ value, label: value })),
    [flowsForGroup],
  );

  const matchCount = useMemo(() => {
    if (!group || !flow || !platform) return 0;
    return screenshots.filter((screenshot) => {
      if (screenshot.group !== group) return false;
      if (screenshot.platform !== platform) return false;
      const f = getFlowLabel(screenshot);
      return f === flow;
    }).length;
  }, [group, flow, platform, screenshots]);

  const canShare = Boolean(group && flow && platform && matchCount > 0 && title.trim().length > 0);

  async function handleCopy() {
    if (!canShare || !group || !flow || !platform) return;
    const url = buildShareUrl({
      group,
      flow,
      platform,
      title: title.trim() || null,
      by: userEmail,
    });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
      finally { document.body.removeChild(input); }
    }
  }

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-modal catalogue-share-modal" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-share-modal__head">
          <h3 className="confirm-title">Share this view</h3>
          <button type="button" className="catalogue-share-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="catalogue-share-modal__body">
          <div className="catalogue-share-modal__grid">
            <div className="catalogue-share-modal__row">
              <label className="catalogue-share-modal__label">Group</label>
              <div className="catalogue-share-modal__control">
                <Dropdown
                  searchable
                  value={group}
                  placeholder="Select group…"
                  searchPlaceholder="Search groups…"
                  options={groupOptions}
                  onChange={(value) => { setGroup(value); setFlow(null); }}
                  className="catalogue-share-modal__dropdown"
                />
              </div>
            </div>

            <div className="catalogue-share-modal__row">
              <label className="catalogue-share-modal__label">Flow</label>
              <div className="catalogue-share-modal__control">
                <Dropdown
                  searchable
                  value={flow}
                  placeholder={group ? 'Select flow…' : 'Pick a group first'}
                  searchPlaceholder="Search flows…"
                  options={flowOptions}
                  onChange={setFlow}
                  disabled={!group}
                  className="catalogue-share-modal__dropdown"
                />
              </div>
            </div>

            <div className="catalogue-share-modal__row">
              <label className="catalogue-share-modal__label">Platform</label>
              <div className="catalogue-share-modal__control">
                <Dropdown
                  value={platform}
                  placeholder="Select platform…"
                  options={PLATFORM_OPTIONS}
                  onChange={(value) => setPlatform(value as SharePlatform | null)}
                  className="catalogue-share-modal__dropdown"
                />
              </div>
            </div>

            <div className="catalogue-share-modal__row">
              <label className="catalogue-share-modal__label">Title</label>
              <div className="catalogue-share-modal__control">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => { setTitle(event.target.value); setTitleTouched(true); }}
                  placeholder="Bybit · Auth walk"
                  maxLength={120}
                  className="catalogue-share-modal__title-input"
                />
              </div>
            </div>
          </div>

          <div className="catalogue-share-modal__count">
            {group && flow && platform
              ? matchCount > 0
                ? <>This share will include <strong>{matchCount}</strong> screen{matchCount === 1 ? '' : 's'}.</>
                : <span className="catalogue-share-modal__count--zero">No screens match this selection.</span>
              : <span className="catalogue-share-modal__count--idle">Pick group, flow, and platform to see how many screens are included.</span>}
          </div>
        </div>

        <div className="catalogue-share-modal__footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`btn-primary catalogue-share-modal__copy ${copied ? 'is-copied' : ''}`}
            disabled={!canShare}
            onClick={handleCopy}
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </div>
    </div>
  );
}
