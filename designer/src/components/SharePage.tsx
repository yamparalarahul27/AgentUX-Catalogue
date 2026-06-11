import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  GalleryHorizontal,
  Images,
  Inbox,
  List as ListIcon,
  Loader2,
  MessageSquare,
  Monitor,
  Smartphone,
  User,
} from 'lucide-react';

import { CATALOGUE_FLOW_LABEL_KEY } from '../lib/catalogue-families';
import {
  formatAbsoluteDateTime,
  formatRelativeTime,
} from '../lib/relative-time';
import { parseShareUrl, type ShareParams } from '../lib/share-url';
import { supabase } from '../lib/supabase';
import type { ScreenshotComment, ScreenshotNode } from '../types';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { SharePageCarousel, type SharePageCarouselItem } from './SharePageCarousel';
import { ThumbHashImage } from './ThumbHashImage';

import agentuxMark from '../assets/agentux-mark.svg';

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; screenshots: ScreenshotNode[] };

type ShareView = 'list' | 'carousel';

const AGENTUX_URL = 'https://agentux.hirahul.xyz/designer/';
const PORTFOLIO_URL = 'https://www.hirahul.xyz';

function getLabelSummary(screenshot: ScreenshotNode): string | null {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== 'object') return null;
  const label = metadata.label as Record<string, unknown> | undefined;
  if (!label || typeof label !== 'object') return null;
  const identity = label.identity as Record<string, unknown> | undefined;
  if (!identity || typeof identity !== 'object') return null;
  const summary = identity.one_line_summary;
  return typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : null;
}

async function fetchShareScreenshots(params: ShareParams): Promise<ScreenshotNode[]> {
  if (params.mode === 'single') {
    // Single-screenshot mode — fetch one row by id. Anon SELECT on
    // screenshots is allowed for deleted_at = null (see PR #81 RLS).
    const { data, error } = await supabase
      .from('screenshots')
      .select('*')
      .is('deleted_at', null)
      .eq('id', params.screenshotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return [];
    const publicUrl = supabase.storage.from('screenshots').getPublicUrl(data.storage_path).data.publicUrl;
    return [{ ...data, image_url: publicUrl } as ScreenshotNode];
  }

  const flowKey = `metadata->>${CATALOGUE_FLOW_LABEL_KEY}`;
  const { data, error } = await supabase
    .from('screenshots')
    .select('*')
    .is('deleted_at', null)
    .eq('group', params.group)
    .eq('platform', params.platform)
    .eq(flowKey, params.flow)
    .order('sequence', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const publicUrl = supabase.storage.from('screenshots').getPublicUrl(row.storage_path).data.publicUrl;
    return { ...row, image_url: publicUrl } as ScreenshotNode;
  });
}

function flowLabelFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[CATALOGUE_FLOW_LABEL_KEY];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readViewFromUrl(): ShareView {
  // Carousel is the default share-view; `?view=list` is the opt-out.
  // (Previously the default was 'list' and `?view=carousel` opted in;
  // flipped on 2026-05-16 — see parked_share_page_polish memory.)
  if (typeof window === 'undefined') return 'carousel';
  return new URLSearchParams(window.location.search).get('view') === 'list' ? 'list' : 'carousel';
}

function readStepFromUrl(): number {
  if (typeof window === 'undefined') return 0;
  const raw = new URLSearchParams(window.location.search).get('step');
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
}

function writeUrl(view: ShareView, step: number) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  // Carousel is the default — keep URLs clean by writing `?view=list`
  // only when the user opts out. Step is carousel-only.
  if (view === 'list') params.set('view', 'list');
  else params.delete('view');
  if (view === 'carousel' && step > 0) params.set('step', String(step + 1));
  else params.delete('step');
  const next = params.toString();
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

function authorNameFromEmail(email: string): string {
  // First-name extraction: "yamparala@gmail.com" → "Yamparala".
  // Splits on @, drops the domain, capitalises. Falls back to email
  // if the prefix is empty.
  const prefix = email.split('@')[0] ?? '';
  if (!prefix) return email;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export function SharePage() {
  const params = parseShareUrl(window.location.search);
  const [state, setState] = useState<FetchState>(params ? { kind: 'loading' } : { kind: 'error', message: 'Invalid share link.' });
  const [view, setView] = useState<ShareView>(readViewFromUrl);
  const [step, setStep] = useState<number>(readStepFromUrl);
  // Public comments for single-screenshot shares. Stays empty in
  // filter mode — comments-on-share is intentionally scoped to single
  // mode for v1 (the carousel/list views are a separate UX problem).
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    fetchShareScreenshots(params)
      .then((screenshots) => {
        if (!cancelled) setState({ kind: 'ready', screenshots });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: err?.message ?? 'Could not load this share.' });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePop() {
      setView(readViewFromUrl());
      setStep(readStepFromUrl());
    }
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Fetch public comments — single-mode only. Anon SELECT is gated by
  // the share_page_anon_read_public RLS policy (is_public=true and
  // non-deleted screenshot). Newest first.
  const screenshotIdForComments =
    state.kind === 'ready' && state.screenshots.length > 0 && params?.mode === 'single'
      ? state.screenshots[0].id
      : null;
  useEffect(() => {
    if (!screenshotIdForComments) {
      setComments([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('screenshot_comments')
      .select('*')
      .eq('screenshot_id', screenshotIdForComments)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setComments([]);
          return;
        }
        setComments(data as ScreenshotComment[]);
      });
    return () => { cancelled = true; };
  }, [screenshotIdForComments]);

  useEffect(() => {
    writeUrl(view, step);
  }, [step, view]);

  const handleSetView = useCallback((nextView: ShareView) => {
    setView(nextView);
    if (nextView === 'list') setStep(0);
  }, []);

  // Mode-aware derivations. Single mode pulls context (title, group,
  // flow, platform) from the fetched screenshot itself; filter mode
  // uses the URL params.
  const isSingleMode = params?.mode === 'single';
  const singleScreenshot =
    isSingleMode && state.kind === 'ready' && state.screenshots.length > 0
      ? state.screenshots[0]
      : null;

  let title: string;
  let groupLabel: string | null;
  let flowLabel: string | null;
  let platform: 'mobile' | 'web' | null;
  if (params?.mode === 'filter') {
    title = params.title || `${params.group} · ${params.flow}`;
    groupLabel = params.group;
    flowLabel = params.flow;
    platform = params.platform;
  } else if (singleScreenshot) {
    title = singleScreenshot.name || 'Shared screenshot';
    groupLabel = singleScreenshot.group ?? null;
    flowLabel = flowLabelFromMetadata(singleScreenshot.metadata);
    platform = singleScreenshot.platform === 'mobile' ? 'mobile'
      : singleScreenshot.platform === 'web' ? 'web' : null;
  } else {
    title = isSingleMode ? 'Loading screenshot…' : 'Shared view';
    groupLabel = null;
    flowLabel = null;
    platform = null;
  }

  const sharer = params?.by ? params.by.split('@')[0] : null;
  const sharerCapitalized = sharer ? sharer.charAt(0).toUpperCase() + sharer.slice(1) : null;

  // "See all screens" link in single mode — points to the main
  // catalogue with the group filter pre-selected (catalogue reads
  // `?group=` on mount). This is the authed-user path; anon visitors
  // will hit the auth gate.
  const seeAllScreensHref = useMemo(() => {
    if (!isSingleMode || !groupLabel) return null;
    return `/designer/?group=${encodeURIComponent(groupLabel)}`;
  }, [isSingleMode, groupLabel]);

  const lastUpdated = useMemo<Date | null>(() => {
    if (state.kind !== 'ready' || state.screenshots.length === 0) return null;
    let max = 0;
    for (const screenshot of state.screenshots) {
      const ts = Date.parse(screenshot.created_at ?? '');
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
    return max > 0 ? new Date(max) : null;
  }, [state]);

  const carouselItems = useMemo<SharePageCarouselItem[]>(() => {
    if (state.kind !== 'ready') return [];
    return state.screenshots.map((screenshot) => ({
      screenshot,
      summary: getLabelSummary(screenshot),
    }));
  }, [state]);

  const screenCount = state.kind === 'ready' ? state.screenshots.length : 0;
  // Single-screenshot mode never shows the list/carousel toggle.
  const showToggle = !isSingleMode && state.kind === 'ready' && screenCount > 1;
  const lastUpdatedRelative = lastUpdated ? formatRelativeTime(lastUpdated) : null;
  const lastUpdatedAbsolute = lastUpdated ? formatAbsoluteDateTime(lastUpdated) : null;

  return (
    <IconTooltipProvider>
      <div className="share-page">
      <header className={`share-page__top${lastUpdatedRelative ? '' : ' share-page__top--centered'}`}>
        <a href="/" className="share-page__brand" aria-label="AgentUX home" title="AgentUX">
          <img src={agentuxMark} alt="AgentUX" />
        </a>
        {lastUpdatedRelative && (
          <span
            className="share-page__time"
            title={`Last updated ${lastUpdatedAbsolute}`}
            aria-label={`Last updated ${lastUpdatedAbsolute}`}
          >
            <Clock size={14} aria-hidden="true" />
            <span>{lastUpdatedRelative}</span>
          </span>
        )}
      </header>

      <main className="share-page__main">
        <section className="share-page__intro">
          <div className="share-page__intro-head">
            <h1>
              {groupLabel && (
                <CatalogueGroupLabel
                  group={groupLabel}
                  iconOnly
                  iconSize={28}
                  className="share-page__title-icon"
                />
              )}
              <span>{title}</span>
            </h1>
            {showToggle && (
              <div className="share-page__view-toggle" role="radiogroup" aria-label="View mode">
                <IconTooltip label="List view">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={view === 'list'}
                    aria-label="List view"
                    className={`share-page__view-toggle-option${view === 'list' ? ' is-active' : ''}`}
                    onClick={() => handleSetView('list')}
                  >
                    <ListIcon size={16} aria-hidden="true" />
                  </button>
                </IconTooltip>
                <IconTooltip label="Carousel view">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={view === 'carousel'}
                    aria-label="Carousel view"
                    className={`share-page__view-toggle-option${view === 'carousel' ? ' is-active' : ''}`}
                    onClick={() => handleSetView('carousel')}
                  >
                    <GalleryHorizontal size={16} aria-hidden="true" />
                  </button>
                </IconTooltip>
              </div>
            )}
            {isSingleMode && comments.length > 0 && (
              <button
                type="button"
                className={`share-page__comments-tile${commentsOpen ? ' is-active' : ''}`}
                aria-expanded={commentsOpen}
                aria-controls="share-page-comments-thread"
                onClick={() => setCommentsOpen((open) => !open)}
              >
                <span className="share-page__comments-tile-head">
                  <span className="share-page__comments-tile-count">
                    <MessageSquare size={14} aria-hidden="true" />
                    <span>Comments</span>
                    <span className="share-page__comments-tile-pill">{comments.length}</span>
                  </span>
                  {commentsOpen ? (
                    <ChevronUp size={14} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={14} aria-hidden="true" />
                  )}
                </span>
                <span className="share-page__comments-tile-preview">
                  <span className="share-page__comments-tile-avatar" aria-hidden="true">
                    {authorNameFromEmail(comments[0].user_email).charAt(0)}
                  </span>
                  <span className="share-page__comments-tile-preview-body">
                    <span className="share-page__comments-tile-author">
                      {authorNameFromEmail(comments[0].user_email)}
                    </span>
                    <span className="share-page__comments-tile-time">
                      {' · '}{formatRelativeTime(new Date(comments[0].created_at))}
                    </span>
                    <span className="share-page__comments-tile-body">{comments[0].text}</span>
                  </span>
                </span>
              </button>
            )}
          </div>
          {state.kind === 'ready' && (
            <p className="share-page__meta">
              {sharerCapitalized && (
                <span className="share-page__meta-item">
                  <User size={14} aria-hidden="true" />
                  <span>{sharerCapitalized}</span>
                </span>
              )}
              {/* Single mode swaps the screenshot-count chip for the
                  group · flow context that filter mode encodes in its
                  H1 title. */}
              {isSingleMode ? (
                groupLabel && flowLabel && (
                  <span className="share-page__meta-item">
                    <span>{groupLabel} · {flowLabel}</span>
                  </span>
                )
              ) : (
                <span className="share-page__meta-item">
                  <Images size={14} aria-hidden="true" />
                  <span>{screenCount}</span>
                </span>
              )}
              {platform && (
                <span className="share-page__meta-item">
                  {platform === 'mobile' ? <Smartphone size={14} aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />}
                  <span>{platform === 'mobile' ? 'Mobile' : 'Web'}</span>
                </span>
              )}
            </p>
          )}
        </section>

        {state.kind === 'loading' && (
          <div className="share-page__state" aria-busy="true">
            <Loader2 size={28} className="share-page__spinner" aria-hidden="true" />
            <span className="visually-hidden">Loading screens</span>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="share-page__state share-page__state--error">
            <AlertTriangle size={28} aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && screenCount === 0 && (
          <div className="share-page__state">
            <Inbox size={28} aria-hidden="true" />
            <p>{isSingleMode ? 'This screenshot is no longer available.' : 'No screens match this share.'}</p>
          </div>
        )}

        {/* Single-screenshot mode — hero image, no carousel chrome. */}
        {isSingleMode && singleScreenshot && (
          <div className="share-page__hero">
            <div className="share-page__hero-image">
              <ThumbHashImage
                src={singleScreenshot.image_url ?? ''}
                thumbHash={singleScreenshot.thumb_hash ?? null}
                alt={singleScreenshot.name}
              />
            </div>
            {commentsOpen && comments.length > 0 && (
              <section
                id="share-page-comments-thread"
                className="share-page__comments-thread"
                aria-label="Comments"
              >
                <div className="share-page__comments-thread-head">
                  <h2 className="share-page__comments-thread-title">
                    Comments
                    <span className="share-page__comments-tile-pill">{comments.length}</span>
                  </h2>
                  <button
                    type="button"
                    className="share-page__comments-thread-close"
                    onClick={() => setCommentsOpen(false)}
                  >
                    Hide <ChevronUp size={14} aria-hidden="true" />
                  </button>
                </div>
                <ol className="share-page__comments-thread-list">
                  {comments.map((comment) => (
                    <li key={comment.id} className="share-page__comment">
                      <div className="share-page__comment-head">
                        <span className="share-page__comment-avatar" aria-hidden="true">
                          {authorNameFromEmail(comment.user_email).charAt(0)}
                        </span>
                        <span className="share-page__comment-author">
                          {authorNameFromEmail(comment.user_email)}
                        </span>
                        <span
                          className="share-page__comment-time"
                          title={formatAbsoluteDateTime(new Date(comment.created_at))}
                        >
                          {formatRelativeTime(new Date(comment.created_at))}
                        </span>
                      </div>
                      <p className="share-page__comment-body">{comment.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {seeAllScreensHref && (
              <a className="share-page__hero-link" href={seeAllScreensHref}>
                See all screens →
              </a>
            )}
          </div>
        )}

        {!isSingleMode && state.kind === 'ready' && screenCount > 0 && view === 'list' && (
          <ol className="share-page__list">
            {carouselItems.map((item, index) => (
              <li key={item.screenshot.id} className="share-page__item">
                <div className="share-page__item-image">
                  <ThumbHashImage
                    src={item.screenshot.image_url ?? ''}
                    thumbHash={item.screenshot.thumb_hash ?? null}
                    alt={item.screenshot.name}
                  />
                </div>
                <div className="share-page__item-meta">
                  <h2>{index + 1}. {item.screenshot.name}</h2>
                  {item.summary && <p>{item.summary}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {!isSingleMode && state.kind === 'ready' && screenCount > 0 && view === 'carousel' && (
          <SharePageCarousel items={carouselItems} step={step} onStepChange={setStep} />
        )}
      </main>

      <footer className="share-page__footer">
        <span className="share-page__footer-text">
          Powered by{' '}
          <a href={AGENTUX_URL} target="_blank" rel="noopener noreferrer">AgentUX</a>
          {' · '}
          Built by{' '}
          <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">Yamparala Rahul</a>
        </span>
      </footer>
      </div>
    </IconTooltipProvider>
  );
}
