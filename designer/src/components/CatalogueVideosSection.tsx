import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Pencil, Search, Share2, X } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { ConfirmModal } from './ConfirmModal';
import { DotLoader } from './DotLoader';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { CommentText } from './CommentText';

// Wrap each case-insensitive occurrence of `query` inside `text` with a
// <mark> span so the catalogue-videos search highlight CSS can paint it.
// Returns the original string when query is empty or no match exists.
function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const segments: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) {
      segments.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) segments.push(text.slice(cursor, idx));
    segments.push(
      <mark key={`m-${idx}`} className="catalogue-videos__match">
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    cursor = idx + query.length;
  }
  // Keys for the non-mark segments are inherent to position; wrap in
  // fragments so React's key warning doesn't fire for the array.
  return segments.map((seg, i) => <Fragment key={i}>{seg}</Fragment>);
}

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
  tags: string[];
}

interface YouTubeReference {
  id: string;
  videoId: string;
  url: string;
  addedAt: string;
  title: string | null;
  channelName: string | null;
  channelHandle: string | null;
  thumbnailUrl: string | null;
  metadataFetchedAt: string | null;
  tags: string[];
}

interface VideoComment {
  id: string;
  text: string;
  author: string;       // truncated display name (everything before the @)
  userEmail: string;    // raw email — needed to gate the edit affordance
  createdAt: string;
  updatedAt?: string | null;
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
  tags: string[] | null;
}

interface CatalogueVideoCommentRow {
  created_at: string;
  updated_at?: string | null;
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
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function toYouTubeReference(row: CatalogueVideoReferenceRow): YouTubeReference {
  return {
    id: `yt-${row.external_id}`,
    videoId: row.external_id,
    url: row.url,
    addedAt: row.created_at,
    // Video title lives in text_excerpt because that's the column the
    // table reuses across source types. Channel name + handle live in
    // author_name / author_handle. Poster URL becomes the thumbnail.
    title: row.text_excerpt,
    channelName: row.author_name,
    channelHandle: row.author_handle,
    thumbnailUrl: row.poster_url,
    metadataFetchedAt: row.metadata_fetched_at,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function normalizeTag(input: string): string {
  // Lowercase + collapse internal whitespace to single spaces. Trim
  // edge whitespace. Strip leading "#" so "#crypto" and "crypto" are
  // the same tag.
  return input.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, ' ');
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

// Accept any of the 5 common YouTube URL shapes and return the canonical
// 11-character video id + a normalized watch URL. Returns null when the
// input doesn't resolve to a recognizable YouTube video — caller surfaces
// that as a user-visible "URL not recognized" error.
//   - https://www.youtube.com/watch?v={id}
//   - https://youtu.be/{id}
//   - https://www.youtube.com/embed/{id}
//   - https://www.youtube.com/shorts/{id}
//   - https://www.youtube.com/live/{id}
// Mobile (m.youtube.com) and the privacy-friendly youtube-nocookie.com
// variant are accepted with the same path shapes.
function parseYouTubeInput(raw: string): { videoId: string; normalizedUrl: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const isYouTubeHost =
      host === 'youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtu.be';
    if (!isYouTubeHost) return null;

    let videoId: string | null = null;
    if (host === 'youtu.be') {
      // youtu.be/{id}
      const parts = url.pathname.split('/').filter(Boolean);
      videoId = parts[0] ?? null;
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      const first = parts[0];
      if (first === 'watch') {
        videoId = url.searchParams.get('v');
      } else if (first === 'embed' || first === 'shorts' || first === 'live' || first === 'v') {
        videoId = parts[1] ?? null;
      }
    }

    // YouTube video ids are always 11 chars from [A-Za-z0-9_-]. Reject
    // anything else so playlist URLs / channel URLs / search pages don't
    // sneak through as bogus ids.
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

    return {
      videoId,
      normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
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
  // True when the tweet content is taller than its scroll viewport AND
  // the user hasn't scrolled past the top — drives a "more below"
  // chevron hint so tall threads don't look clipped at first glance.
  const [showHint, setShowHint] = useState(false);

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

  // Scroll-hint visibility: recompute on scroll, on resize, and on a
  // short poll during the first ~4 s so the iframe's settling height
  // (Twitter renders progressively) gets picked up. Hides once the
  // user scrolls past ~12px of the top — confirms they've seen it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function check() {
      const target = containerRef.current;
      if (!target) return;
      const overflowing = target.scrollHeight > target.clientHeight + 4;
      const atTop = target.scrollTop < 12;
      setShowHint(overflowing && atTop);
    }
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      check();
      if (Date.now() - startedAt > 4000) window.clearInterval(interval);
    }, 400);
    check();
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', check);
      window.clearInterval(interval);
    };
  }, [tweetId]);

  return (
    <div className={className}>
      <div ref={containerRef} className={`${className}-inner`} />
      <div className={`${className}-hint${showHint ? '' : ' is-hidden'}`} aria-hidden="true">
        <ChevronDown size={14} />
        <span>More below</span>
      </div>
    </div>
  );
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
    }
  | {
      kind: 'youtube';
      key: string;            // `youtube-${ytRowId}` — same item_key the comments table uses
      title: string;
      videoId: string;        // YouTube's 11-char id, drives the embed src
      channelName: string | null;
      channelHandle: string | null;
      url: string;
      ytRowId: string;        // DB row id — needed for tag handlers
    };

export function CatalogueVideosSection({
  canEdit = true,
  onRequireAuth,
  userEmail,
}: CatalogueVideosSectionProps) {
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null);

  // Lock body scroll while the video preview is open so the catalogue
  // page beneath doesn't scroll-through (the bug visible on mobile).
  // Mirrors the pattern in Catalogue.tsx's isAnyModalOpen effect, but
  // owned here because previewItemKey is local to this section and
  // isn't part of the catalogue-level modal aggregate.
  useEffect(() => {
    if (!previewItemKey) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [previewItemKey]);

  // Track the visual viewport while the preview is open so the lightbox
  // shrinks to the keyboard-aware height on mobile. `100dvh` is the
  // pre-keyboard viewport, so without this the comment composer (pinned
  // at the bottom of the comments column) ends up hidden behind the iOS
  // keyboard. The CSS vars are consumed only by the mobile media query.
  useEffect(() => {
    if (!previewItemKey) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--vv-height', `${vv.height}px`);
      root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--vv-offset-top');
    };
  }, [previewItemKey]);

  // Two-tab split for the Videos section: X (Twitter) is the default
  // because it's the growing collection (you keep adding posts), and
  // Family Values is a fixed reference set. URL-synced via `?tab=`
  // so the choice survives reload + can be shared.
  type VideoTab = 'x' | 'youtube' | 'family';
  const [activeTab, setActiveTab] = useState<VideoTab>(() => {
    if (typeof window === 'undefined') return 'x';
    const param = new URLSearchParams(window.location.search).get('tab');
    if (param === 'family') return 'family';
    if (param === 'youtube') return 'youtube';
    return 'x';
  });
  // Mirror activeTab → URL on change; only touch `?tab=`, leave any
  // other params untouched.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'x') params.delete('tab'); // default — keep URL clean
    else params.set('tab', activeTab);
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [activeTab]);
  // Back/forward button respect — sync from URL on popstate.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function handlePopState() {
      const param = new URLSearchParams(window.location.search).get('tab');
      if (param === 'family') setActiveTab('family');
      else if (param === 'youtube') setActiveTab('youtube');
      else setActiveTab('x');
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // `/` focuses the search input — matches the GitHub / Mobbin / X
  // convention. Ignores the keystroke when the user is already typing
  // in an input / textarea / contenteditable so it doesn't intercept
  // a literal slash. Skips when modifier keys are held so combos like
  // `⌘/` (toggle comment in code editors) still pass through.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== '/') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByVideo, setCommentsByVideo] = useState<Record<string, VideoComment[]>>({});
  const [xPostInput, setXPostInput] = useState('');
  const [xPostError, setXPostError] = useState<string | null>(null);
  const [xPosts, setXPosts] = useState<XPostReference[]>([]);
  const [youtubeInput, setYouTubeInput] = useState('');
  const [youtubeError, setYouTubeError] = useState<string | null>(null);
  const [youtubeVideos, setYouTubeVideos] = useState<YouTubeReference[]>([]);
  const [savingYouTube, setSavingYouTube] = useState(false);
  const [pendingDeleteYouTubeId, setPendingDeleteYouTubeId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-tile copy-confirmation. Tracks the most-recently-shared id so
  // its Share icon swaps to a checkmark for ~1.5s. One field is enough
  // since users almost never click two share buttons within the window.
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  // Deep-link guard — flipped after the first `?v=<id>` resolution so
  // closing the lightbox doesn't immediately re-open it.
  const deepLinkHandledRef = useRef(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingXPost, setSavingXPost] = useState(false);
  // Currently active tag filters. Empty = no filter (show all videos).
  // Multi-select: a video matches if it has at least one of the
  // selected tags (OR semantics).
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Lightbox tag editor — only one lightbox is ever open so a single
  // pair of state slots covers both add and edit. `editingTag` tracks
  // which existing tag (if any) is being renamed; `tagDraft` is the
  // input value (for both the rename input and the standalone "+ add
  // tag" input).
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagAddDraft, setTagAddDraft] = useState('');
  // Pending-delete confirmation. The ⋯ button on a card sets this;
  // the ConfirmModal renders when non-null. Using post.id so we can
  // resolve the post (title, tweetId) inside the modal for the
  // message + the actual delete call.
  const [pendingDeleteXPostId, setPendingDeleteXPostId] = useState<string | null>(null);
  // Sort mode for the Saved X Posts grid. Independent of tag filters
  // — applies after filtering. 'newest' is the default; 'most-liked'
  // falls back to addedAt order for posts whose metadata hasn't
  // backfilled (likedCount is null).
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'most-liked'>('newest');

  // Tag editor state is tied to the currently-open lightbox item. Reset
  // everything when the preview switches or closes — otherwise a draft
  // typed for post A would surface unchanged on post B.
  useEffect(() => {
    setEditingTag(null);
    setTagDraft('');
    setTagAddDraft('');
  }, [previewItemKey]);

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

    // YouTube — key is `youtube-${ytRowId}` so it doesn't collide
    // with X-post UUIDs in the same flat key space.
    if (previewItemKey.startsWith('youtube-')) {
      const ytId = previewItemKey.slice('youtube-'.length);
      const yt = youtubeVideos.find((item) => item.id === ytId);
      if (yt) {
        return {
          kind: 'youtube',
          key: previewItemKey,
          title: yt.title || `YouTube Video ${yt.videoId}`,
          videoId: yt.videoId,
          channelName: yt.channelName,
          channelHandle: yt.channelHandle,
          url: yt.url,
          ytRowId: yt.id,
        };
      }
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
  }, [previewItemKey, xPosts, youtubeVideos]);

  // Deep-link handler. When the URL contains `?v=<id>`, look up the
  // saved item once both data sets have loaded, switch to the right
  // tab, and open the lightbox. Strips the param after opening so a
  // refresh doesn't re-trigger it (and so the URL stays clean for
  // navigation). The deepLinkHandledRef guard above ensures we only
  // resolve once per mount — closing the lightbox doesn't re-open it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loadingData) return;
    if (deepLinkHandledRef.current) return;
    const v = new URLSearchParams(window.location.search).get('v');
    if (!v) return;
    deepLinkHandledRef.current = true;

    const xPost = xPosts.find((p) => p.id === v);
    if (xPost) {
      setActiveTab('x');
      setPreviewItemKey(xPost.id);
    } else {
      const yt = youtubeVideos.find((y) => y.id === v);
      if (yt) {
        setActiveTab('youtube');
        setPreviewItemKey(`youtube-${yt.id}`);
      }
    }

    // Clean the `?v=` param regardless of whether we found a match —
    // a stale id shouldn't sit in the URL.
    const params = new URLSearchParams(window.location.search);
    params.delete('v');
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [loadingData, xPosts, youtubeVideos]);

  // Copy a `?v=<id>` deep link to the clipboard. The recipient opens
  // it (after auth if not signed in) and lands directly on the
  // lightbox for the shared item.
  async function handleShareVideo(id: string) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('v', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedShareId(id);
      window.setTimeout(() => {
        setCopiedShareId((current) => (current === id ? null : current));
      }, 1500);
    } catch {
      // Clipboard blocked (permissions / non-https) — silently no-op.
      // Could fall back to a manual prompt later if this becomes common.
    }
  }

  // All distinct tags across the loaded xPosts, with usage counts.
  // Used to drive the filter strip above the grid. Sorted: most-used
  // first so the popular tags lead.
  const tagsWithCounts = useMemo<Array<{ tag: string; count: number }>>(() => {
    const counts = new Map<string, number>();
    for (const post of xPosts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [xPosts]);

  // OR semantics for tags: any tag in the filter set qualifies the row.
  // Search is AND with tags: row must pass both. Case-insensitive substring
  // match across the visible text fields + tags + URL. Sort applies after
  // filtering.
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const sortedXPosts = useMemo(() => {
    const tagFiltered = selectedTagFilters.size === 0
      ? xPosts
      : xPosts.filter((post) => post.tags.some((tag) => selectedTagFilters.has(tag)));
    const searchFiltered = normalizedSearchQuery === ''
      ? tagFiltered
      : tagFiltered.filter((post) => {
          const haystack = [
            post.authorName ?? '',
            post.authorHandle ?? '',
            post.textExcerpt ?? '',
            post.url,
            ...post.tags,
          ].join(' ').toLowerCase();
          return haystack.includes(normalizedSearchQuery);
        });
    const sorted = [...searchFiltered];
    switch (sortMode) {
      case 'newest':
        sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
        break;
      case 'oldest':
        sorted.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
        break;
      case 'most-liked':
        // Posts without a liked_count (metadata not backfilled yet)
        // sink to the bottom — they're indistinguishable from "0 likes"
        // without the fetch, so leaving them at the top would be noisy.
        sorted.sort((a, b) => (b.likedCount ?? -1) - (a.likedCount ?? -1));
        break;
    }
    return sorted;
  }, [xPosts, selectedTagFilters, sortMode, normalizedSearchQuery]);

  const isFilterActive = normalizedSearchQuery !== '' || selectedTagFilters.size > 0;

  // Cross-tab search — the header search box filters X / YouTube /
  // Family Values together. Tag filter still scopes only the X tab
  // (it's the only collection with tags). Tab count badges below
  // reflect the post-search count so users can see at a glance how
  // many matches each tab holds.
  const filteredYouTubeVideos = useMemo(() => {
    if (normalizedSearchQuery === '') return youtubeVideos;
    return youtubeVideos.filter((video) => {
      const haystack = [
        video.title ?? '',
        video.channelName ?? '',
        video.channelHandle ?? '',
        video.url,
        ...video.tags,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [youtubeVideos, normalizedSearchQuery]);

  const filteredReferenceVideos = useMemo(() => {
    if (normalizedSearchQuery === '') return REFERENCE_VIDEOS;
    return REFERENCE_VIDEOS.filter((video) => {
      const haystack = `family values ${video.id}`.toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery]);

  // Persist a new tags array to the row. Optimistic — flip local
  // state, revert on error. All three mutations (add, rename, remove)
  // funnel through here so the round-trip is consistent.
  async function persistTagsForPost(postId: string, nextTags: string[]) {
    const post = xPosts.find((p) => p.id === postId);
    if (!post) return;
    const previousTags = post.tags;
    setXPosts((previous) => previous.map((p) => p.id === postId ? { ...p, tags: nextTags } : p));
    const { error } = await supabase
      .from('catalogue_video_references')
      .update({ tags: nextTags })
      .eq('source_type', 'x_post')
      .eq('external_id', post.tweetId);
    if (error) {
      setXPosts((previous) => previous.map((p) => p.id === postId ? { ...p, tags: previousTags } : p));
    }
  }

  async function addTagToPost(postId: string, rawTag: string) {
    const tag = normalizeTag(rawTag);
    if (!tag) return;
    const post = xPosts.find((p) => p.id === postId);
    if (!post) return;
    if (post.tags.includes(tag)) return;
    await persistTagsForPost(postId, [...post.tags, tag]);
  }

  async function removeTagFromPost(postId: string, tag: string) {
    const post = xPosts.find((p) => p.id === postId);
    if (!post) return;
    await persistTagsForPost(postId, post.tags.filter((existing) => existing !== tag));
  }

  // Rename a tag in place — preserves array order so the edited chip
  // doesn't jump to the end of the row. No-ops if the new value is
  // empty, equal to the original, or collides with another existing tag.
  async function renameTagOnPost(postId: string, originalTag: string, rawNext: string) {
    const next = normalizeTag(rawNext);
    if (!next || next === originalTag) return;
    const post = xPosts.find((p) => p.id === postId);
    if (!post) return;
    if (post.tags.includes(next)) {
      // Collision with an existing tag — fall back to a simple remove of
      // the old one so the user doesn't end up with a duplicate row.
      await persistTagsForPost(postId, post.tags.filter((t) => t !== originalTag));
      return;
    }
    await persistTagsForPost(
      postId,
      post.tags.map((tag) => (tag === originalTag ? next : tag)),
    );
  }

  // YouTube tag mutations — same shape as the X-post handlers above,
  // routed through `catalogue_video_references` keyed by
  // `source_type='youtube'` + `external_id=videoId`. Each handler is
  // optimistic, with a rollback inside `persistTagsForYouTube` if the
  // network write fails.
  async function persistTagsForYouTube(ytRowId: string, nextTags: string[]) {
    const yt = youtubeVideos.find((v) => v.id === ytRowId);
    if (!yt) return;
    const previousTags = yt.tags;
    setYouTubeVideos((prev) => prev.map((v) => v.id === ytRowId ? { ...v, tags: nextTags } : v));
    const { error } = await supabase
      .from('catalogue_video_references')
      .update({ tags: nextTags })
      .eq('source_type', 'youtube')
      .eq('external_id', yt.videoId);
    if (error) {
      setYouTubeVideos((prev) => prev.map((v) => v.id === ytRowId ? { ...v, tags: previousTags } : v));
    }
  }
  async function addTagToYouTube(ytRowId: string, rawTag: string) {
    const tag = normalizeTag(rawTag);
    if (!tag) return;
    const yt = youtubeVideos.find((v) => v.id === ytRowId);
    if (!yt) return;
    if (yt.tags.includes(tag)) return;
    await persistTagsForYouTube(ytRowId, [...yt.tags, tag]);
  }
  async function removeTagFromYouTube(ytRowId: string, tag: string) {
    const yt = youtubeVideos.find((v) => v.id === ytRowId);
    if (!yt) return;
    await persistTagsForYouTube(ytRowId, yt.tags.filter((existing) => existing !== tag));
  }
  async function renameTagOnYouTube(ytRowId: string, originalTag: string, rawNext: string) {
    const next = normalizeTag(rawNext);
    if (!next || next === originalTag) return;
    const yt = youtubeVideos.find((v) => v.id === ytRowId);
    if (!yt) return;
    if (yt.tags.includes(next)) {
      await persistTagsForYouTube(ytRowId, yt.tags.filter((t) => t !== originalTag));
      return;
    }
    await persistTagsForYouTube(
      ytRowId,
      yt.tags.map((tag) => (tag === originalTag ? next : tag)),
    );
  }

  function toggleTagFilter(tag: string) {
    setSelectedTagFilters((previous) => {
      const next = new Set(previous);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // Single flat list driving arrow-key navigation in the lightbox.
  // X posts first → YouTube videos → Family Values clips. Mirrors
  // the tab order so ← / → match what the user sees as they switch
  // tabs.
  const allPreviewKeys = useMemo<string[]>(() => {
    const xKeys = sortedXPosts.map((post) => post.id);
    const ytKeys = filteredYouTubeVideos.map((yt) => `youtube-${yt.id}`);
    const benjiKeys = REFERENCE_VIDEOS.map((video) => `benji-${video.id}`);
    return [...xKeys, ...ytKeys, ...benjiKeys];
  }, [sortedXPosts, filteredYouTubeVideos]);

  const currentPreviewIndex = previewItemKey
    ? allPreviewKeys.indexOf(previewItemKey)
    : -1;
  const hasPrev = currentPreviewIndex > 0;
  const hasNext = currentPreviewIndex >= 0 && currentPreviewIndex < allPreviewKeys.length - 1;

  function goToPreview(delta: -1 | 1) {
    if (currentPreviewIndex < 0) return;
    const nextIndex = currentPreviewIndex + delta;
    if (nextIndex < 0 || nextIndex >= allPreviewKeys.length) return;
    setPreviewItemKey(allPreviewKeys[nextIndex]);
    // Reset the comment composer + tag drafts when nav'ing — they're
    // tied to a specific item, leaving stale draft text in the box
    // across items is confusing.
    setCommentDraft('');
    setEditingTag(null);
    setTagDraft('');
    setTagAddDraft('');
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingData(true);
      setLoadError(null);

      const [xPostsResult, youtubeResult, commentsResult] = await Promise.all([
        supabase
          .from('catalogue_video_references')
          .select('source_type, external_id, url, created_at, author_handle, author_name, text_excerpt, poster_url, liked_count, posted_at, metadata_fetched_at, tags')
          .eq('source_type', 'x_post')
          .order('created_at', { ascending: false }),
        supabase
          .from('catalogue_video_references')
          .select('source_type, external_id, url, created_at, author_handle, author_name, text_excerpt, poster_url, liked_count, posted_at, metadata_fetched_at, tags')
          .eq('source_type', 'youtube')
          .order('created_at', { ascending: false }),
        supabase
          .from('catalogue_video_comments')
          .select('id, item_key, text, user_email, created_at, updated_at')
          .order('created_at', { ascending: true }),
      ]);

      if (cancelled) return;

      if (xPostsResult.error || youtubeResult.error || commentsResult.error) {
        setLoadError('Unable to load saved references. Run the latest catalogue video SQL migration.');
        setLoadingData(false);
        return;
      }

      const xRows = (xPostsResult.data || []) as CatalogueVideoReferenceRow[];
      const ytRows = (youtubeResult.data || []) as CatalogueVideoReferenceRow[];
      const commentRows = (commentsResult.data || []) as CatalogueVideoCommentRow[];

      setXPosts(xRows.map(toXPostReference));
      setYouTubeVideos(ytRows.map(toYouTubeReference));
      setCommentsByVideo(commentRows.reduce<Record<string, VideoComment[]>>((accumulator, row) => {
        const nextItem: VideoComment = {
          id: row.id,
          text: row.text,
          author: row.user_email?.split('@')[0] || row.user_email || 'Designer',
          userEmail: row.user_email,
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? null,
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
      // Don't hijack arrows while the user is typing in the comment
      // composer or any other input inside the modal.
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          if (event.key === 'Escape') setPreviewItemKey(null);
          return;
        }
      }

      if (event.key === 'Escape') {
        setPreviewItemKey(null);
      } else if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault();
        goToPreview(-1);
      } else if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        goToPreview(1);
      }
    }

    if (!previewItemKey) return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewItemKey, hasPrev, hasNext]);

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
      .select('id, item_key, text, user_email, created_at, updated_at')
      .single();

    setSavingComment(false);
    if (error || !data) {
      return;
    }

    const nextComment: VideoComment = {
      id: data.id,
      text: data.text,
      author: data.user_email?.split('@')[0] || data.user_email || 'Designer',
      userEmail: data.user_email,
      createdAt: data.created_at,
      updatedAt: data.updated_at ?? null,
    };
    setCommentsByVideo((previous) => ({
      ...previous,
      [previewItemKey]: [...(previous[previewItemKey] ?? []), nextComment],
    }));
    setCommentDraft('');
  }

  // Edit an existing video comment. Mirrors the screenshot-lightbox
  // editComment in shape: optimistic text + updated_at swap, rollback
  // on error. RLS already permits authenticated UPDATE; ownership is
  // gated client-side via `userEmail`.
  async function editVideoComment(itemKey: string, commentId: string, nextText: string) {
    if (!ensureCanEdit()) return;
    const trimmed = nextText.trim();
    if (!trimmed) return;
    const existing = (commentsByVideo[itemKey] ?? []).find((c) => c.id === commentId);
    if (!existing || trimmed === existing.text) return;
    const previousText = existing.text;
    const previousUpdatedAt = existing.updatedAt ?? null;
    const nextUpdatedAt = new Date().toISOString();
    setCommentsByVideo((previous) => ({
      ...previous,
      [itemKey]: (previous[itemKey] ?? []).map((c) =>
        c.id === commentId ? { ...c, text: trimmed, updatedAt: nextUpdatedAt } : c
      ),
    }));
    const { error } = await supabase
      .from('catalogue_video_comments')
      .update({ text: trimmed, updated_at: nextUpdatedAt })
      .eq('id', commentId);
    if (error) {
      // Roll back to the prior text + updatedAt — the user can retry
      // from the same edit affordance.
      setCommentsByVideo((previous) => ({
        ...previous,
        [itemKey]: (previous[itemKey] ?? []).map((c) =>
          c.id === commentId ? { ...c, text: previousText, updatedAt: previousUpdatedAt } : c
        ),
      }));
    }
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

  // Insert a YouTube row from a pasted URL. Parses the URL, dedupes on
  // video id, fires the oEmbed backfill so the card lands with title +
  // thumbnail populated. Save → fetch metadata → patch the row.
  async function addYouTubeVideo() {
    if (savingYouTube) return;
    if (!ensureCanEdit()) return;

    const parsed = parseYouTubeInput(youtubeInput);
    if (!parsed) {
      setYouTubeError('Enter a valid YouTube URL (watch, youtu.be, shorts, live, or embed).');
      return;
    }
    if (youtubeVideos.some((video) => video.videoId === parsed.videoId)) {
      setYouTubeError('This YouTube video is already added.');
      return;
    }

    setSavingYouTube(true);
    const { data, error } = await supabase
      .from('catalogue_video_references')
      .insert({
        source_type: 'youtube',
        external_id: parsed.videoId,
        url: parsed.normalizedUrl,
        added_by_email: userEmail,
      })
      .select('source_type, external_id, url, created_at, author_handle, author_name, text_excerpt, poster_url, liked_count, posted_at, metadata_fetched_at, tags')
      .single();
    setSavingYouTube(false);

    if (error) {
      if (error.code === '23505') {
        setYouTubeError('This YouTube video is already added.');
        return;
      }
      setYouTubeError('Unable to save this YouTube video right now.');
      return;
    }
    if (!data) {
      setYouTubeError('Unable to save this YouTube video right now.');
      return;
    }

    const fresh = toYouTubeReference(data as CatalogueVideoReferenceRow);
    setYouTubeVideos((previous) => [fresh, ...previous]);
    setYouTubeInput('');
    setYouTubeError(null);

    // Fire-and-forget metadata backfill so the card hydrates with title
    // + thumbnail + channel without blocking the insert path.
    void backfillYouTubeMetadata([fresh.videoId]);
  }

  async function removeYouTubeVideo(videoRowId: string) {
    if (!ensureCanEdit()) return;
    const target = youtubeVideos.find((item) => item.id === videoRowId);
    if (!target) return;

    const { error } = await supabase
      .from('catalogue_video_references')
      .delete()
      .eq('source_type', 'youtube')
      .eq('external_id', target.videoId);

    if (error) return;

    setYouTubeVideos((previous) => previous.filter((video) => video.id !== videoRowId));
    if (previewItemKey === `youtube-${videoRowId}`) {
      setPreviewItemKey(null);
    }
  }

  // Hits the fetch-youtube-metadata Edge Function for the given video
  // ids, then patches the rows that came back populated. No-ops silently
  // on network error — metadata is best-effort.
  async function backfillYouTubeMetadata(videoIds: string[]) {
    if (videoIds.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke('fetch-youtube-metadata', {
        body: { videoIds },
      });
      if (error || !data?.results) return;
      type YouTubeMetadataResult = {
        videoId: string;
        title: string | null;
        authorName: string | null;
        authorHandle: string | null;
        thumbnailUrl: string | null;
      };
      const results = data.results as YouTubeMetadataResult[];
      const fetchedAt = new Date().toISOString();
      for (const result of results) {
        const patch = {
          text_excerpt: result.title,
          author_name: result.authorName,
          author_handle: result.authorHandle,
          poster_url: result.thumbnailUrl,
          metadata_fetched_at: fetchedAt,
        };
        await supabase
          .from('catalogue_video_references')
          .update(patch)
          .eq('source_type', 'youtube')
          .eq('external_id', result.videoId);
        setYouTubeVideos((previous) =>
          previous.map((video) =>
            video.videoId === result.videoId
              ? {
                  ...video,
                  title: result.title,
                  channelName: result.authorName,
                  channelHandle: result.authorHandle,
                  thumbnailUrl: result.thumbnailUrl,
                  metadataFetchedAt: fetchedAt,
                }
              : video,
          ),
        );
      }
    } catch {
      /* metadata fetch is non-critical — leave the row pending */
    }
  }

  // On mount: any YouTube rows that loaded without metadata get queued
  // for backfill. Mirrors the X-post backfill that runs on the loaded
  // xPosts state.
  useEffect(() => {
    const stale = youtubeVideos.filter((video) => !video.metadataFetchedAt && video.videoId);
    if (stale.length === 0) return;
    void backfillYouTubeMetadata(stale.map((video) => video.videoId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideos.length]);

  return (
    <IconTooltipProvider>
      <section className="catalogue-videos" aria-label="Videos as Medium">
        <header className="catalogue-videos__head">
          <div className="catalogue-videos__copy">
            <h2>Videos as Medium</h2>
          </div>
          {/* Unified search across X / YouTube / Family Values — one
              query filters all three collections. Always rendered (even
              during initial load) so the header doesn't reflow when the
              data lands and the input pops in. */}
          <div className="catalogue-videos__search" role="search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search videos (author, title, tag, URL)"
              aria-label="Search saved videos across all tabs"
              disabled={loadingData}
            />
            {searchQuery && (
              <button
                type="button"
                className="catalogue-videos__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
            <kbd className="catalogue-videos__search-kbd" aria-hidden="true">/</kbd>
          </div>
        </header>

        {/* Tab strip — X first (the growing collection), Family Values
            second (fixed reference set). Tab choice URL-synced via ?tab. */}
        <div className="catalogue-videos__tabs" role="tablist" aria-label="Video source">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'x'}
            className={`catalogue-videos__tab${activeTab === 'x' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('x')}
          >
            X (Twitter)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'youtube'}
            className={`catalogue-videos__tab${activeTab === 'youtube' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'family'}
            className={`catalogue-videos__tab${activeTab === 'family' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('family')}
          >
            Family Values
          </button>
        </div>

        {loadError && <p className="catalogue-videos__error">{loadError}</p>}

        {activeTab === 'x' && (
          <>
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
            disabled={!xPostInput.trim() || savingXPost || !canEdit}
          >
            {savingXPost && <DotLoader size="sm" ariaLabel="Saving" />}
            Add X Post
          </button>
        </div>
        {xPostError && <p className="catalogue-videos__error">{xPostError}</p>}

        {loadingData ? (
          <p className="catalogue-videos__loading">Loading saved references...</p>
        ) : (
          <>
            {tagsWithCounts.length > 0 && (
              <div
                className="catalogue-videos__tag-filters"
                role="toolbar"
                aria-label="Filter saved videos by tag"
              >
                <span className="catalogue-videos__tag-filters-label">Tags</span>
                {tagsWithCounts.map(({ tag }) => {
                  const isActive = selectedTagFilters.has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`catalogue-videos__tag-chip${isActive ? ' is-active' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => toggleTagFilter(tag)}
                    >
                      <span>{tag}</span>
                    </button>
                  );
                })}
                {selectedTagFilters.size > 0 && (
                  <button
                    type="button"
                    className="catalogue-videos__tag-clear"
                    onClick={() => setSelectedTagFilters(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {xPosts.length > 0 && sortedXPosts.length === 0 && isFilterActive && (
              <div className="catalogue-videos__empty" role="status">
                <p>No saved X posts match the current filter.</p>
                <button
                  type="button"
                  className="catalogue-videos__empty-clear"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTagFilters(new Set());
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}

            {sortedXPosts.length > 0 && (
              <>
                <div className="catalogue-videos__section-header">
                  <h3 className="catalogue-videos__section-title">
                    {isFilterActive
                      ? `Saved X Posts · ${sortedXPosts.length} of ${xPosts.length}`
                      : 'Saved X Posts'}
                  </h3>
                  <label className="catalogue-videos__sort">
                    <span className="catalogue-videos__sort-label">Sort</span>
                    <select
                      className="catalogue-videos__sort-select"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="most-liked">Most liked</option>
                    </select>
                  </label>
                </div>
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
                            <p className="catalogue-videos__x-thumb-text">
                              {highlightMatch(excerpt, normalizedSearchQuery)}
                            </p>
                          )}
                          <IconTooltip label={copiedShareId === post.id ? 'Copied!' : 'Copy share link'}>
                            <button
                              type="button"
                              className="catalogue-videos__x-share"
                              aria-label="Copy share link to this post"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleShareVideo(post.id);
                              }}
                            >
                              {copiedShareId === post.id
                                ? <Check size={14} aria-hidden="true" />
                                : <Share2 size={14} aria-hidden="true" />}
                            </button>
                          </IconTooltip>
                          <IconTooltip label="Remove from saved references">
                            <button
                              type="button"
                              className="catalogue-videos__x-menu"
                              aria-label="Remove from saved references"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingDeleteXPostId(post.id);
                              }}
                            >
                              <Minus size={14} aria-hidden="true" />
                            </button>
                          </IconTooltip>
                          <div className="catalogue-videos__x-play" aria-hidden="true">▶</div>
                        </div>
                        <div className="catalogue-videos__x-body">
                          <div className="catalogue-videos__x-author">
                            {post.authorHandle ? (
                              // Profile photo via unavatar.io — handles the
                              // Twitter avatar lookup for us so we don't have
                              // to migrate a column or extend the syndication
                              // scraper. If the image 404s (handle gone,
                              // service down), onError hides the slot
                              // entirely so we don't show a broken-image icon.
                              <img
                                className="catalogue-videos__x-avatar"
                                src={`https://unavatar.io/twitter/${encodeURIComponent(post.authorHandle)}`}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="catalogue-videos__x-avatar catalogue-videos__x-avatar--gradient" aria-hidden="true" />
                            )}
                            <span className="catalogue-videos__x-name">
                              {highlightMatch(displayName, normalizedSearchQuery)}
                            </span>
                            {handle && post.authorName && (
                              <span className="catalogue-videos__x-handle">
                                <span className="catalogue-videos__x-handle-mark" aria-hidden="true">𝕏</span>
                                {highlightMatch(handle, normalizedSearchQuery)}
                              </span>
                            )}
                          </div>
                          {hasPoster && excerpt && (
                            <p className="catalogue-videos__x-text">
                              {highlightMatch(excerpt, normalizedSearchQuery)}
                            </p>
                          )}
                          <div className="catalogue-videos__x-footer">
                            <span className="catalogue-videos__x-footer-left">
                              {post.tags.length > 0 && (
                                <span className="catalogue-videos__x-card-chips">
                                  {post.tags.map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={`catalogue-videos__x-card-chip${selectedTagFilters.has(tag) ? ' is-active' : ''}`}
                                      title={`Filter by "${tag}"`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleTagFilter(tag);
                                      }}
                                    >
                                      {highlightMatch(tag, normalizedSearchQuery)}
                                    </button>
                                  ))}
                                </span>
                              )}
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
              </>
            )}
          </>
        )}

        {activeTab === 'youtube' && (
          <>
            <div className="catalogue-videos__add-row">
              <input
                type="text"
                value={youtubeInput}
                onChange={(event) => {
                  setYouTubeInput(event.target.value);
                  if (youtubeError) setYouTubeError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addYouTubeVideo();
                  }
                }}
                placeholder="Paste YouTube URL (watch, youtu.be, shorts, live, embed)"
                disabled={savingYouTube || !canEdit}
              />
              <button
                type="button"
                onClick={() => { void addYouTubeVideo(); }}
                disabled={!youtubeInput.trim() || savingYouTube || !canEdit}
              >
                {savingYouTube && <DotLoader size="sm" ariaLabel="Saving" />}
                Add YouTube
              </button>
            </div>
            {youtubeError && <p className="catalogue-videos__error">{youtubeError}</p>}

            {loadingData ? (
              <p className="catalogue-videos__loading">Loading saved videos…</p>
            ) : youtubeVideos.length === 0 ? (
              <p className="catalogue-videos__loading">
                No YouTube videos yet — paste a URL above to save your first one.
              </p>
            ) : filteredYouTubeVideos.length === 0 ? (
              <p className="catalogue-videos__loading">
                No YouTube videos match &ldquo;{searchQuery.trim()}&rdquo;.
              </p>
            ) : (
              <div className="catalogue-videos__grid">
                {filteredYouTubeVideos.map((video) => {
                  // Fall back to YouTube's predictable thumbnail pattern when
                  // oEmbed hasn't backfilled yet, so cards don't render as
                  // empty boxes between save and metadata fetch.
                  const thumb = video.thumbnailUrl
                    ?? `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                  const title = video.title ?? 'Loading…';
                  return (
                    <article
                      key={video.id}
                      className="catalogue-videos__yt-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setPreviewItemKey(`youtube-${video.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPreviewItemKey(`youtube-${video.id}`);
                        }
                      }}
                    >
                      <div
                        className="catalogue-videos__yt-thumb"
                        style={{ backgroundImage: `url("${thumb}")` }}
                      >
                        <span className="catalogue-videos__yt-play" aria-hidden="true">▶</span>
                        <IconTooltip label={copiedShareId === video.id ? 'Copied!' : 'Copy share link'}>
                          <button
                            type="button"
                            className="catalogue-videos__yt-share"
                            aria-label="Copy share link to this video"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleShareVideo(video.id);
                            }}
                          >
                            {copiedShareId === video.id
                              ? <Check size={14} aria-hidden="true" />
                              : <Share2 size={14} aria-hidden="true" />}
                          </button>
                        </IconTooltip>
                        <IconTooltip label="Remove from saved videos">
                          <button
                            type="button"
                            className="catalogue-videos__yt-menu"
                            aria-label="Remove from saved videos"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteYouTubeId(video.id);
                            }}
                          >
                            <Minus size={14} aria-hidden="true" />
                          </button>
                        </IconTooltip>
                      </div>
                      <div className="catalogue-videos__yt-body">
                        <p className="catalogue-videos__yt-title">{title}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'family' && (
          filteredReferenceVideos.length === 0 ? (
            <p className="catalogue-videos__loading">
              No Family Values entries match &ldquo;{searchQuery.trim()}&rdquo;.
            </p>
          ) : (
            <div className="catalogue-videos__grid">
              {filteredReferenceVideos.map((video) => (
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
          )
        )}
      </section>

      {previewItem && (
        <div className="catalogue-videos-preview" role="dialog" aria-modal="true" onClick={() => setPreviewItemKey(null)}>
          {/* Close sits in the dim backdrop, top-left, outside the modal
              box — moved here from inside __main so it stops colliding
              with YouTube's native top chrome (mute / CC / settings). */}
          <button
            type="button"
            className="catalogue-videos-preview__close"
            onClick={() => setPreviewItemKey(null)}
            aria-label="Close video preview"
          >
            <X size={18} />
          </button>
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
              ) : previewItem.kind === 'youtube' ? (
                <iframe
                  className="catalogue-videos-preview__yt"
                  src={`https://www.youtube-nocookie.com/embed/${previewItem.videoId}?autoplay=1&rel=0`}
                  title={previewItem.title}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <XPostEmbed className="catalogue-videos-preview__tweet" tweetId={previewItem.tweetId} />
              )}
              {hasPrev && (
                <button
                  type="button"
                  className="catalogue-videos-preview__nav catalogue-videos-preview__nav--prev"
                  onClick={() => goToPreview(-1)}
                  aria-label="Previous reference"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              {hasNext && (
                <button
                  type="button"
                  className="catalogue-videos-preview__nav catalogue-videos-preview__nav--next"
                  onClick={() => goToPreview(1)}
                  aria-label="Next reference"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            <aside className="catalogue-videos-preview__comments">
              {(() => {
                // Resolve the tag-bearing row + the right mutation handlers
                // for the current preview kind. Returns null for plain
                // reference videos which don't carry user-defined tags.
                let rowId: string | null = null;
                let tags: string[] = [];
                let onAdd: (raw: string) => Promise<void> = async () => {};
                let onRemove: (tag: string) => Promise<void> = async () => {};
                let onRename: (originalTag: string, rawNext: string) => Promise<void> = async () => {};
                if (previewItem.kind === 'x-post') {
                  const xPost = xPosts.find((p) => p.id === previewItem.key);
                  if (!xPost) return null;
                  rowId = xPost.id;
                  tags = xPost.tags;
                  onAdd = (raw) => addTagToPost(xPost.id, raw);
                  onRemove = (tag) => removeTagFromPost(xPost.id, tag);
                  onRename = (orig, next) => renameTagOnPost(xPost.id, orig, next);
                } else if (previewItem.kind === 'youtube') {
                  const yt = youtubeVideos.find((v) => v.id === previewItem.ytRowId);
                  if (!yt) return null;
                  rowId = yt.id;
                  tags = yt.tags;
                  onAdd = (raw) => addTagToYouTube(yt.id, raw);
                  onRemove = (tag) => removeTagFromYouTube(yt.id, tag);
                  onRename = (orig, next) => renameTagOnYouTube(yt.id, orig, next);
                } else {
                  return null;
                }

                return (
                  <section className="catalogue-videos-preview__tags-block" aria-label="Tags">
                    <header className="catalogue-videos-preview__tags-head">
                      <h3>Tags</h3>
                      {tags.length > 0 && (
                        <span className="catalogue-videos-preview__tags-count">{tags.length}</span>
                      )}
                    </header>
                    <div className="catalogue-videos-preview__tags-row">
                      {tags.map((tag) => {
                        const isEditing = editingTag === `${rowId}::${tag}`;
                        return (
                          <span
                            key={tag}
                            className={`catalogue-videos-preview__tag${isEditing ? ' is-editing' : ''}`}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                className="catalogue-videos-preview__tag-edit-input"
                                value={tagDraft}
                                autoFocus
                                onChange={(event) => setTagDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void onRename(tag, tagDraft);
                                    setEditingTag(null);
                                    setTagDraft('');
                                  } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    setEditingTag(null);
                                    setTagDraft('');
                                  }
                                }}
                                onBlur={() => {
                                  if (tagDraft.trim()) void onRename(tag, tagDraft);
                                  setEditingTag(null);
                                  setTagDraft('');
                                }}
                              />
                            ) : (
                              <IconTooltip label="Click to rename">
                                <button
                                  type="button"
                                  className="catalogue-videos-preview__tag-label"
                                  aria-label={`Rename tag ${tag}`}
                                  onClick={() => {
                                    setEditingTag(`${rowId}::${tag}`);
                                    setTagDraft(tag);
                                  }}
                                >
                                  {tag}
                                </button>
                              </IconTooltip>
                            )}
                            <IconTooltip label="Remove tag">
                              <button
                                type="button"
                                className="catalogue-videos-preview__tag-x"
                                aria-label={`Remove ${tag}`}
                                onClick={() => void onRemove(tag)}
                              >
                                <X size={11} aria-hidden="true" />
                              </button>
                            </IconTooltip>
                          </span>
                        );
                      })}
                      <input
                        type="text"
                        className="catalogue-videos-preview__tag-add"
                        placeholder="+ add tag"
                        value={tagAddDraft}
                        onChange={(event) => setTagAddDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ',') {
                            event.preventDefault();
                            void onAdd(tagAddDraft);
                            setTagAddDraft('');
                          }
                        }}
                        onBlur={() => {
                          if (tagAddDraft.trim()) {
                            void onAdd(tagAddDraft);
                            setTagAddDraft('');
                          }
                        }}
                      />
                    </div>
                  </section>
                );
              })()}
              <header className="catalogue-videos-preview__comments-head">
                <h3>Comments</h3>
                <span>{previewItem.title}</span>
              </header>

              <div className="catalogue-videos-preview__comments-list">
                {activeComments.length === 0 ? (
                  <p className="catalogue-videos-preview__empty">No comments yet.</p>
                ) : (
                  activeComments.map((comment) => (
                    <VideoCommentItem
                      key={comment.id}
                      comment={comment}
                      itemKey={previewItemKey ?? ''}
                      currentUserEmail={userEmail}
                      formatTime={formatCommentTime}
                      onEdit={editVideoComment}
                    />
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
                  {savingComment && <DotLoader size="sm" ariaLabel="Saving" />}
                  Save
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {pendingDeleteXPostId && (() => {
        const post = xPosts.find((p) => p.id === pendingDeleteXPostId);
        const label = post?.authorName
          || (post?.authorHandle ? `@${post.authorHandle}` : null)
          || 'this X post';
        return (
          <ConfirmModal
            title="Remove from saved references?"
            message={`"${label}" will be removed from the Videos section. This can't be undone.`}
            confirmLabel="Remove"
            cancelLabel="Cancel"
            danger
            onConfirm={() => {
              const id = pendingDeleteXPostId;
              setPendingDeleteXPostId(null);
              if (id) void removeXPost(id);
            }}
            onCancel={() => setPendingDeleteXPostId(null)}
          />
        );
      })()}

      {pendingDeleteYouTubeId && (() => {
        const video = youtubeVideos.find((v) => v.id === pendingDeleteYouTubeId);
        const label = video?.title || video?.channelName || 'this YouTube video';
        return (
          <ConfirmModal
            title="Remove from saved videos?"
            message={`"${label}" will be removed from the Videos section. This can't be undone.`}
            confirmLabel="Remove"
            cancelLabel="Cancel"
            danger
            onConfirm={() => {
              const id = pendingDeleteYouTubeId;
              setPendingDeleteYouTubeId(null);
              if (id) void removeYouTubeVideo(id);
            }}
            onCancel={() => setPendingDeleteYouTubeId(null)}
          />
        );
      })()}

    </IconTooltipProvider>
  );
}

// Inline comment row for the video preview modal. Mirrors the
// screenshot-lightbox CommentItem in shape (own-comment edit
// affordance, "(edited)" suffix, ⌘/Ctrl+Enter saves, Esc cancels)
// without growing this file's component-tree into a separate file.
interface VideoCommentItemProps {
  comment: VideoComment;
  itemKey: string;
  currentUserEmail: string;
  formatTime: (value: string) => string;
  onEdit: (itemKey: string, commentId: string, nextText: string) => Promise<void>;
}

function VideoCommentItem({ comment, itemKey, currentUserEmail, formatTime, onEdit }: VideoCommentItemProps) {
  const canEdit = comment.userEmail === currentUserEmail;
  const isEdited = Boolean(comment.updatedAt);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) setDraft(comment.text);
  }, [comment.text, isEditing]);

  function beginEdit() {
    setDraft(comment.text);
    setIsEditing(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function cancelEdit() {
    setDraft(comment.text);
    setIsEditing(false);
  }

  async function submitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.text) {
      setIsEditing(false);
      return;
    }
    await onEdit(itemKey, comment.id, trimmed);
    setIsEditing(false);
  }

  return (
    <div className="catalogue-videos-preview__comment">
      <div className="catalogue-videos-preview__comment-top">
        <strong>{comment.author}</strong>
        <span>
          {formatTime(comment.createdAt)}
          {isEdited && <span className="catalogue-videos-preview__comment-edited"> (edited)</span>}
        </span>
        {canEdit && !isEditing && (
          <IconTooltip label="Edit comment">
            <button
              type="button"
              className="catalogue-videos-preview__comment-edit"
              aria-label="Edit comment"
              onClick={beginEdit}
            >
              <Pencil size={11} />
            </button>
          </IconTooltip>
        )}
      </div>
      {isEditing ? (
        <div className="catalogue-videos-preview__comment-edit-form">
          <textarea
            ref={textareaRef}
            className="catalogue-videos-preview__comment-edit-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void submitEdit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Edit comment text"
          />
          <div className="catalogue-videos-preview__comment-edit-actions">
            <button
              type="button"
              className="catalogue-videos-preview__comment-edit-cancel"
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="catalogue-videos-preview__comment-edit-save"
              onClick={() => void submitEdit()}
              disabled={!draft.trim() || draft.trim() === comment.text}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p><CommentText text={comment.text} /></p>
      )}
    </div>
  );
}
