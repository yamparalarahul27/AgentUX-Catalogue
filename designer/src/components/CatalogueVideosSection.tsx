import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { supabase } from '../lib/supabase';

interface ReferenceVideo {
  id: string;
  posterUrl: string;
  sourceUrl: string;
}

interface XPostReference {
  id: string;
  tweetId: string;
  url: string;
  addedAt: string;
  authorHandle: string | null;
  authorName: string | null;
  textExcerpt: string | null;
  posterUrl: string | null;
  likedCount: number | null;
  postedAt: string | null;
  metadataFetchedAt: string | null;
}

interface VideoComment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

interface CatalogueVideoReferenceRow {
  created_at: string;
  external_id: string;
  source_type: string;
  url: string;
  author_handle: string | null;
  author_name: string | null;
  text_excerpt: string | null;
  poster_url: string | null;
  liked_count: number | null;
  posted_at: string | null;
  metadata_fetched_at: string | null;
}

interface CatalogueVideoCommentRow {
  created_at: string;
  id: string;
  item_key: string;
  text: string;
  user_email: string;
}

interface CatalogueVideosSectionProps {
  canEdit?: boolean;
  onRequireAuth?: () => void;
  userEmail: string;
}

const BENJI_VIDEO_IDS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09',
  '11', '12', '13', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38',
  '39', '40', '41', '42', '43', '44', '45', '46', '47',
  '48', '49', '50', '51', '52', '53', '54', '55',
];

const REFERENCE_VIDEOS: ReferenceVideo[] = BENJI_VIDEO_IDS.map((id) => ({
  id,
  sourceUrl: `https://benji.org/media/family-values/${id}.mp4`,
  posterUrl: `https://benji.org/media/family-values/${id}.png`,
}));

const TWITTER_WIDGET_SCRIPT_ID = 'twitter-wjs';
let twitterWidgetsScriptPromise: Promise<void> | null = null;

// Format the `created_at` timestamp into a relative "saved 2d ago"
// label for the card footer. Coarse — we only need day-level
// granularity for the at-a-glance view.
function formatSavedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Compact display of large like counts: 1.2k, 14k, 1.3m.
function formatCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

// Deterministic gradient for the text-only-tweet fallback poster.
// Hash the tweet ID into one of N preset gradients so the same
// post always gets the same background.
const TEXT_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #14b8a6, #06b6d4)',
  'linear-gradient(135deg, #8b5cf6, #ec4899)',
  'linear-gradient(135deg, #10b981, #3b82f6)',
  'linear-gradient(135deg, #f97316, #db2777)',
];
function gradientForTweet(tweetId: string): string {
  let hash = 0;
  for (let i = 0; i < tweetId.length; i += 1) {
    hash = (hash * 31 + tweetId.charCodeAt(i)) & 0xffffffff;
  }
  return TEXT_GRADIENTS[Math.abs(hash) % TEXT_GRADIENTS.length];
}

function toXPostReference(row: CatalogueVideoReferenceRow): XPostReference {
  return {
    id: `x-${row.external_id}`,
    tweetId: row.external_id,
    url: row.url,
    addedAt: row.created_at,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    textExcerpt: row.text_excerpt,
    posterUrl: row.poster_url,
    likedCount: row.liked_count,
    postedAt: row.posted_at,
    metadataFetchedAt: row.metadata_fetched_at,
  };
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function extractXUrlCandidate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const direct = new URL(trimmed);
    return direct.toString();
  } catch {
    const matches = trimmed.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s"'<>]+/ig);
    if (!matches || matches.length === 0) return null;
    const preferred = matches.find((value) => /\/status(?:es)?\/\d+/i.test(value) || /\/i\/status\/\d+/i.test(value)) || matches[0];
    return preferred?.replace(/&amp;/g, '&') || null;
  }
}

function parseXPostInput(raw: string): { tweetId: string; normalizedUrl: string } | null {
  const candidate = extractXUrlCandidate(raw);
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const isXHost = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
    if (!isXHost) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const statusIndex = parts.findIndex((part) => part === 'status' || part === 'statuses');
    if (statusIndex === -1 || !parts[statusIndex + 1]) return null;
    const tweetId = parts[statusIndex + 1];
    if (!/^\d+$/.test(tweetId)) return null;
    return {
      tweetId,
      normalizedUrl: `https://x.com/i/status/${tweetId}`,
    };
  } catch {
    return null;
  }
}

interface TwitterWindow extends Window {
  twttr?: {
    widgets?: {
      createTweet?: (
        tweetId: string,
        element: HTMLElement,
        options?: Record<string, string | number | boolean>,
      ) => Promise<Element>;
      load: (element?: Element | null) => void;
    };
  };
}

function loadTwitterWidgetsScript() {
  if (typeof window === 'undefined') return Promise.resolve();

  const win = window as TwitterWindow;
  if (win.twttr?.widgets?.load) return Promise.resolve();
  if (twitterWidgetsScriptPromise) return twitterWidgetsScriptPromise;

  twitterWidgetsScriptPromise = new Promise<void>((resolve) => {
    const existing = document.getElementById(TWITTER_WIDGET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      const done = () => resolve();
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', done, { once: true });
      window.setTimeout(done, 1200);
      return;
    }

    const script = document.createElement('script');
    script.id = TWITTER_WIDGET_SCRIPT_ID;
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.charset = 'utf-8';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });

  return twitterWidgetsScriptPromise;
}

interface XPostEmbedProps {
  className: string;
  tweetId: string;
}

function XPostEmbed({ className, tweetId }: XPostEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let cancelled = false;
    host.innerHTML = `<blockquote class="twitter-tweet" data-theme="dark" data-dnt="true" data-media-max-width="560"><a href="https://twitter.com/i/web/status/${tweetId}"></a></blockquote>`;

    void loadTwitterWidgetsScript().then(() => {
      if (cancelled) return;
      const win = window as TwitterWindow;
      const widgets = win.twttr?.widgets;
      if (!widgets) return;

      if (widgets.createTweet) {
        host.innerHTML = '';
        void widgets
          .createTweet(tweetId, host, {
            theme: 'dark',
            dnt: true,
            width: 560,
          })
          .catch(() => {
            if (cancelled) return;
            host.innerHTML = `<blockquote class="twitter-tweet" data-theme="dark" data-dnt="true" data-media-max-width="560"><a href="https://twitter.com/i/web/status/${tweetId}"></a></blockquote>`;
            widgets.load?.(host);
          });
        return;
      }

      widgets.load?.(host);
    });

    return () => {
      cancelled = true;
      if (host) host.innerHTML = '';
    };
  }, [tweetId]);

  return <div ref={containerRef} className={className} />;
}

type PreviewItem =
  | {
      kind: 'video';
      key: string;
      title: string;
      sourceUrl: string;
      posterUrl: string;
    }
  | {
      kind: 'x-post';
      key: string;
      title: string;
      tweetId: string;
    };

export function CatalogueVideosSection({
  canEdit = true,
  onRequireAuth,
  userEmail,
}: CatalogueVideosSectionProps) {
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByVideo, setCommentsByVideo] = useState<Record<string, VideoComment[]>>({});
  const [xPostInput, setXPostInput] = useState('');
  const [xPostError, setXPostError] = useState<string | null>(null);
  const [xPosts, setXPosts] = useState<XPostReference[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const [savingXPost, setSavingXPost] = useState(false);

  function ensureCanEdit() {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  const previewItem = useMemo<PreviewItem | null>(() => {
    if (!previewItemKey) return null;

    const benjiVideo = REFERENCE_VIDEOS.find((video) => `benji-${video.id}` === previewItemKey);
    if (benjiVideo) {
      return {
        kind: 'video',
        key: previewItemKey,
        title: `Family Values ${benjiVideo.id}`,
        sourceUrl: benjiVideo.sourceUrl,
        posterUrl: benjiVideo.posterUrl,
      };
    }

    const xPost = xPosts.find((item) => item.id === previewItemKey);
    if (xPost) {
      return {
        kind: 'x-post',
        key: previewItemKey,
        title: `X Post ${xPost.tweetId}`,
        tweetId: xPost.tweetId,
      };
    }

    return null;
  }, [previewItemKey, xPosts]);

  const sortedXPosts = useMemo(
    () => [...xPosts].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [xPosts],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingData(true);
      setLoadError(null);

      const [xPostsResult, commentsResult] = await Promise.all([
        supabase
          .from('catalogue_video_references')
          .select('source_type, external_id, url, created_at, author_handle, author_name, text_excerpt, poster_url, liked_count, posted_at, metadata_fetched_at')
          .eq('source_type', 'x_post')
          .order('created_at', { ascending: false }),
        supabase
          .from('catalogue_video_comments')
          .select('id, item_key, text, user_email, created_at')
          .order('created_at', { ascending: true }),
      ]);

      if (cancelled) return;

      if (xPostsResult.error || commentsResult.error) {
        setLoadError('Unable to load saved references. Run the latest catalogue video SQL migration.');
        setLoadingData(false);
        return;
      }

      const xRows = (xPostsResult.data || []) as CatalogueVideoReferenceRow[];
      const commentRows = (commentsResult.data || []) as CatalogueVideoCommentRow[];

      setXPosts(xRows.map(toXPostReference));
      setCommentsByVideo(commentRows.reduce<Record<string, VideoComment[]>>((accumulator, row) => {
        const nextItem: VideoComment = {
          id: row.id,
          text: row.text,
          author: row.user_email || 'Designer',
          createdAt: row.created_at,
        };
        const current = accumulator[row.item_key] || [];
        accumulator[row.item_key] = [...current, nextItem];
        return accumulator;
      }, {}));
      setLoadingData(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy backfill — any saved X post without metadata gets enriched
  // via the fetch-tweet-metadata Edge Function and written back to
  // the row. Runs once per render pass when there are stale rows.
  // New tweets follow the same path on first read after insert, so
  // there's no separate "on save" code path to maintain.
  useEffect(() => {
    const stale = xPosts.filter((post) => !post.metadataFetchedAt && post.tweetId);
    if (stale.length === 0) return;
    let cancelled = false;

    async function enrich() {
      const tweetIds = stale.slice(0, 20).map((post) => post.tweetId);
      try {
        const { data, error } = await supabase.functions.invoke<{
          results: Array<{
            tweetId: string;
            authorHandle: string | null;
            authorName: string | null;
            textExcerpt: string | null;
            posterUrl: string | null;
            likedCount: number | null;
            postedAt: string | null;
          }>;
        }>('fetch-tweet-metadata', { body: { tweetIds } });

        if (cancelled || error || !data?.results) return;

        const fetchedAt = new Date().toISOString();
        // Write the metadata back to the row so we don't re-fetch
        // on every page load. Updates happen in parallel.
        await Promise.all(data.results.map(async (result) => {
          if (cancelled) return;
          const updateRow = {
            author_handle: result.authorHandle,
            author_name: result.authorName,
            text_excerpt: result.textExcerpt,
            poster_url: result.posterUrl,
            liked_count: result.likedCount,
            posted_at: result.postedAt,
            metadata_fetched_at: fetchedAt,
          };
          await supabase
            .from('catalogue_video_references')
            .update(updateRow)
            .eq('source_type', 'x_post')
            .eq('external_id', result.tweetId);
        }));

        if (cancelled) return;
        // Optimistic local update so the cards refresh immediately
        // instead of waiting for a re-fetch.
        setXPosts((current) => current.map((post) => {
          const match = data.results.find((r) => r.tweetId === post.tweetId);
          if (!match) return post;
          return {
            ...post,
            authorHandle: match.authorHandle,
            authorName: match.authorName,
            textExcerpt: match.textExcerpt,
            posterUrl: match.posterUrl,
            likedCount: match.likedCount,
            postedAt: match.postedAt,
            metadataFetchedAt: fetchedAt,
          };
        }));
      } catch {
        // Metadata is opportunistic — silent failure is fine.
      }
    }

    void enrich();
    return () => { cancelled = true; };
  }, [xPosts]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewItemKey(null);
      }
    }

    if (!previewItemKey) return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewItemKey]);

  const activeComments = previewItemKey ? commentsByVideo[previewItemKey] ?? [] : [];

  async function addComment() {
    const text = commentDraft.trim();
    if (!previewItemKey || !text || savingComment) return;
    if (!ensureCanEdit()) return;

    setSavingComment(true);
    const { data, error } = await supabase
      .from('catalogue_video_comments')
      .insert({
        item_key: previewItemKey,
        text,
        user_email: userEmail,
      })
      .select('id, item_key, text, user_email, created_at')
      .single();

    setSavingComment(false);
    if (error || !data) {
      return;
    }

    const nextComment: VideoComment = {
      id: data.id,
      text: data.text,
      author: data.user_email,
      createdAt: data.created_at,
    };
    setCommentsByVideo((previous) => ({
      ...previous,
      [previewItemKey]: [...(previous[previewItemKey] ?? []), nextComment],
    }));
    setCommentDraft('');
  }

  async function addXPost() {
    if (savingXPost) return;
    if (!ensureCanEdit()) return;

    const parsed = parseXPostInput(xPostInput);
    if (!parsed) {
      setXPostError('Enter a valid X post URL or embed code snippet.');
      return;
    }
    if (xPosts.some((post) => post.tweetId === parsed.tweetId)) {
      setXPostError('This X post is already added.');
      return;
    }

    setSavingXPost(true);
    const { data, error } = await supabase
      .from('catalogue_video_references')
      .insert({
        source_type: 'x_post',
        external_id: parsed.tweetId,
        url: parsed.normalizedUrl,
        added_by_email: userEmail,
      })
      .select('source_type, external_id, url, created_at')
      .single();
    setSavingXPost(false);

    if (error) {
      if (error.code === '23505') {
        setXPostError('This X post is already added.');
        return;
      }
      setXPostError('Unable to save this X post right now.');
      return;
    }
    if (!data) {
      setXPostError('Unable to save this X post right now.');
      return;
    }

    setXPosts((previous) => [toXPostReference(data as CatalogueVideoReferenceRow), ...previous]);
    setXPostInput('');
    setXPostError(null);
  }

  async function removeXPost(postId: string) {
    if (!ensureCanEdit()) return;
    const target = xPosts.find((item) => item.id === postId);
    if (!target) return;

    const { error } = await supabase
      .from('catalogue_video_references')
      .delete()
      .eq('source_type', 'x_post')
      .eq('external_id', target.tweetId);

    if (error) return;

    setXPosts((previous) => previous.filter((post) => post.id !== postId));
    if (previewItemKey === postId) {
      setPreviewItemKey(null);
    }
  }

  return (
    <>
      <section className="catalogue-videos" aria-label="Reference videos">
        <header className="catalogue-videos__head">
          <div className="catalogue-videos__copy">
            <h2>Reference Videos</h2>
            <p>Streamed from benji.org for design inspiration and competitive UX study.</p>
          </div>
          <a
            className="catalogue-videos__source"
            href="https://benji.org/family-values"
            target="_blank"
            rel="noreferrer"
          >
            Open source page
          </a>
        </header>

        {loadError && <p className="catalogue-videos__error">{loadError}</p>}

        <div className="catalogue-videos__add-row">
          <input
            type="text"
            value={xPostInput}
            onChange={(event) => {
              setXPostInput(event.target.value);
              if (xPostError) setXPostError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addXPost();
              }
            }}
            placeholder="Paste X post URL or embed code"
          />
          <button
            type="button"
            onClick={() => void addXPost()}
            disabled={savingXPost}
          >
            {savingXPost ? 'Saving...' : 'Add X Post'}
          </button>
        </div>
        {xPostError && <p className="catalogue-videos__error">{xPostError}</p>}

        {loadingData ? (
          <p className="catalogue-videos__loading">Loading saved references...</p>
        ) : (
          <>
            {sortedXPosts.length > 0 && (
              <>
                <h3 className="catalogue-videos__section-title">Saved X Posts</h3>
                <div className="catalogue-videos__grid">
                  {sortedXPosts.map((post) => {
                    const handle = post.authorHandle ? `@${post.authorHandle}` : null;
                    const displayName = post.authorName || handle || 'Loading…';
                    const excerpt = post.textExcerpt
                      ?? (post.metadataFetchedAt ? null : 'Fetching tweet…');
                    const likeLabel = formatCount(post.likedCount);
                    const savedAgo = formatSavedAgo(post.addedAt);
                    const hasPoster = Boolean(post.posterUrl);
                    return (
                      <article
                        key={post.id}
                        className="catalogue-videos__x-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setPreviewItemKey(post.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setPreviewItemKey(post.id);
                          }
                        }}
                      >
                        <div
                          className={`catalogue-videos__x-thumb ${hasPoster ? '' : 'catalogue-videos__x-thumb--gradient'}`}
                          style={hasPoster
                            ? { backgroundImage: `url("${post.posterUrl ?? ''}")` }
                            : { background: gradientForTweet(post.tweetId) }}
                        >
                          {!hasPoster && excerpt && (
                            <p className="catalogue-videos__x-thumb-text">{excerpt}</p>
                          )}
                          <span className="catalogue-videos__x-source-pill">𝕏 Post</span>
                          <button
                            type="button"
                            className="catalogue-videos__x-menu"
                            title="More actions"
                            aria-label="More actions"
                            onClick={(event) => {
                              event.stopPropagation();
                              // Two-action menu — keep minimal until the
                              // lightbox PR introduces a proper popover.
                              if (window.confirm('Remove this X post from saved references?')) {
                                void removeXPost(post.id);
                              }
                            }}
                          >
                            ⋯
                          </button>
                          <div className="catalogue-videos__x-play" aria-hidden="true">▶</div>
                        </div>
                        <div className="catalogue-videos__x-body">
                          <div className="catalogue-videos__x-author">
                            <span className="catalogue-videos__x-avatar" aria-hidden="true" />
                            <span className="catalogue-videos__x-name">
                              {displayName}
                              {handle && post.authorName && (
                                <span className="catalogue-videos__x-handle">{handle}</span>
                              )}
                            </span>
                          </div>
                          {hasPoster && excerpt && (
                            <p className="catalogue-videos__x-text">{excerpt}</p>
                          )}
                          <div className="catalogue-videos__x-footer">
                            <span className="catalogue-videos__x-footer-left">
                              {likeLabel && <span>♥ {likeLabel}</span>}
                            </span>
                            {savedAgo && <span>Saved {savedAgo}</span>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            <h3 className="catalogue-videos__section-title">Family Values Clips</h3>
            <div className="catalogue-videos__grid">
              {REFERENCE_VIDEOS.map((video) => (
                <article key={video.id} className="catalogue-videos__card">
                  <button
                    type="button"
                    className="catalogue-videos__preview-button"
                    onClick={() => setPreviewItemKey(`benji-${video.id}`)}
                  >
                    Preview
                  </button>
                  <div className="catalogue-videos__player-wrap">
                    <video
                      className="catalogue-videos__player"
                      controls
                      playsInline
                      preload="metadata"
                      poster={video.posterUrl}
                      src={video.sourceUrl}
                    />
                  </div>
                  <div className="catalogue-videos__meta">
                    <span className="catalogue-videos__title">Family Values {video.id}</span>
                    <a href={video.sourceUrl} target="_blank" rel="noreferrer">
                      Open video
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {previewItem && (
        <div className="catalogue-videos-preview" role="dialog" aria-modal="true" onClick={() => setPreviewItemKey(null)}>
          <div className="catalogue-videos-preview__modal" onClick={(event) => event.stopPropagation()}>
            <div className="catalogue-videos-preview__main">
              {previewItem.kind === 'video' ? (
                <video
                  className="catalogue-videos-preview__player"
                  controls
                  playsInline
                  autoPlay
                  preload="auto"
                  poster={previewItem.posterUrl}
                  src={previewItem.sourceUrl}
                />
              ) : (
                <XPostEmbed className="catalogue-videos-preview__tweet" tweetId={previewItem.tweetId} />
              )}
              <button
                type="button"
                className="catalogue-videos-preview__close"
                onClick={() => setPreviewItemKey(null)}
                aria-label="Close video preview"
              >
                <X size={16} />
              </button>
            </div>

            <aside className="catalogue-videos-preview__comments">
              <header className="catalogue-videos-preview__comments-head">
                <h3>Comments</h3>
                <span>{previewItem.title}</span>
              </header>

              <div className="catalogue-videos-preview__comments-list">
                {activeComments.length === 0 ? (
                  <p className="catalogue-videos-preview__empty">No comments yet.</p>
                ) : (
                  activeComments.map((comment) => (
                    <div key={comment.id} className="catalogue-videos-preview__comment">
                      <div className="catalogue-videos-preview__comment-top">
                        <strong>{comment.author}</strong>
                        <span>{formatCommentTime(comment.createdAt)}</span>
                      </div>
                      <p>{comment.text}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="catalogue-videos-preview__composer">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Add a reference note..."
                />
                <button
                  type="button"
                  onClick={() => void addComment()}
                  disabled={!commentDraft.trim() || savingComment}
                >
                  {savingComment ? 'Saving...' : 'Save'}
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
