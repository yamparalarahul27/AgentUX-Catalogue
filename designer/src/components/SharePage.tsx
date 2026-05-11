import { useEffect, useState } from 'react';

import { CATALOGUE_FLOW_LABEL_KEY } from '../lib/catalogue-families';
import { parseShareUrl, type ShareParams } from '../lib/share-url';
import { supabase } from '../lib/supabase';
import type { ScreenshotNode } from '../types';
import { ThumbHashImage } from './ThumbHashImage';

import agentuxLogo from '../assets/agentux-logo.svg';

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; screenshots: ScreenshotNode[] };

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

export function SharePage() {
  const params = parseShareUrl(window.location.search);
  const [state, setState] = useState<FetchState>(params ? { kind: 'loading' } : { kind: 'error', message: 'Invalid share link.' });

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
    // params is parsed from location.search once on mount; we don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = params?.title || (params ? `${params.group} · ${params.flow}` : 'Shared view');
  const platformLabel = params?.platform === 'mobile' ? 'Mobile' : params?.platform === 'web' ? 'Web' : '';
  const sharer = params?.by ? params.by.split('@')[0] : null;
  const sharerCapitalized = sharer ? sharer.charAt(0).toUpperCase() + sharer.slice(1) : null;

  return (
    <div className="share-page">
      <header className="share-page__top">
        <a href="/" className="share-page__brand" aria-label="AgentUX home">
          <img src={agentuxLogo} alt="" />
          <span>AgentUX</span>
        </a>
      </header>

      <main className="share-page__main">
        <section className="share-page__intro">
          <h1>{title}</h1>
          {state.kind === 'ready' && (
            <p className="share-page__meta">
              {sharerCapitalized && <>Shared by {sharerCapitalized} · </>}
              {state.screenshots.length} screen{state.screenshots.length === 1 ? '' : 's'}
              {platformLabel && <> · {platformLabel}</>}
            </p>
          )}
        </section>

        {state.kind === 'loading' && (
          <div className="share-page__empty">Loading screens…</div>
        )}

        {state.kind === 'error' && (
          <div className="share-page__empty share-page__empty--error">
            <p>{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && state.screenshots.length === 0 && (
          <div className="share-page__empty">
            <p>No screens match this share.</p>
          </div>
        )}

        {state.kind === 'ready' && state.screenshots.length > 0 && (
          <ol className="share-page__list">
            {state.screenshots.map((screenshot, index) => {
              const summary = getLabelSummary(screenshot);
              return (
                <li key={screenshot.id} className="share-page__item">
                  <div className="share-page__item-image">
                    <ThumbHashImage
                      src={screenshot.image_url ?? ''}
                      thumbHash={screenshot.thumb_hash ?? null}
                      alt={screenshot.name}
                    />
                  </div>
                  <div className="share-page__item-meta">
                    <h2>{index + 1}. {screenshot.name}</h2>
                    {summary && <p>{summary}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      <footer className="share-page__footer">
        <a href="/" className="share-page__footer-link">Powered by AgentUX Catalogue</a>
      </footer>
    </div>
  );
}
