import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  GalleryHorizontal,
  Images,
  Inbox,
  List as ListIcon,
  Loader2,
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
import type { ScreenshotNode } from '../types';
import { SharePageCarousel, type SharePageCarouselItem } from './SharePageCarousel';
import { ThumbHashImage } from './ThumbHashImage';

import agentuxLogo from '../assets/agentux-logo.svg';

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

function readViewFromUrl(): ShareView {
  if (typeof window === 'undefined') return 'list';
  return new URLSearchParams(window.location.search).get('view') === 'carousel' ? 'carousel' : 'list';
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
  if (view === 'carousel') params.set('view', 'carousel');
  else params.delete('view');
  if (view === 'carousel' && step > 0) params.set('step', String(step + 1));
  else params.delete('step');
  const next = params.toString();
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

export function SharePage() {
  const params = parseShareUrl(window.location.search);
  const [state, setState] = useState<FetchState>(params ? { kind: 'loading' } : { kind: 'error', message: 'Invalid share link.' });
  const [view, setView] = useState<ShareView>(readViewFromUrl);
  const [step, setStep] = useState<number>(readStepFromUrl);

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

  useEffect(() => {
    writeUrl(view, step);
  }, [step, view]);

  const handleSetView = useCallback((nextView: ShareView) => {
    setView(nextView);
    if (nextView === 'list') setStep(0);
  }, []);

  const title = params?.title || (params ? `${params.group} · ${params.flow}` : 'Shared view');
  const platform = params?.platform === 'mobile' ? 'mobile' : params?.platform === 'web' ? 'web' : null;
  const sharer = params?.by ? params.by.split('@')[0] : null;
  const sharerCapitalized = sharer ? sharer.charAt(0).toUpperCase() + sharer.slice(1) : null;

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
  const showToggle = state.kind === 'ready' && screenCount > 1;
  const lastUpdatedRelative = lastUpdated ? formatRelativeTime(lastUpdated) : null;
  const lastUpdatedAbsolute = lastUpdated ? formatAbsoluteDateTime(lastUpdated) : null;

  return (
    <div className="share-page">
      <header className={`share-page__top${lastUpdatedRelative ? '' : ' share-page__top--centered'}`}>
        <a href="/" className="share-page__brand" aria-label="AgentUX home">
          <img src={agentuxLogo} alt="AgentUX" />
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
            <h1>{title}</h1>
            {showToggle && (
              <div className="share-page__view-toggle" role="radiogroup" aria-label="View mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={view === 'list'}
                  aria-label="List view"
                  title="List view"
                  className={`share-page__view-toggle-option${view === 'list' ? ' is-active' : ''}`}
                  onClick={() => handleSetView('list')}
                >
                  <ListIcon size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={view === 'carousel'}
                  aria-label="Carousel view"
                  title="Carousel view"
                  className={`share-page__view-toggle-option${view === 'carousel' ? ' is-active' : ''}`}
                  onClick={() => handleSetView('carousel')}
                >
                  <GalleryHorizontal size={16} aria-hidden="true" />
                </button>
              </div>
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
              <span className="share-page__meta-item">
                <Images size={14} aria-hidden="true" />
                <span>{screenCount}</span>
              </span>
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
            <p>No screens match this share.</p>
          </div>
        )}

        {state.kind === 'ready' && screenCount > 0 && view === 'list' && (
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

        {state.kind === 'ready' && screenCount > 0 && view === 'carousel' && (
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
  );
}
