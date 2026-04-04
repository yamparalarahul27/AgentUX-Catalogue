import { useEffect, useMemo, useState } from 'react';

interface ReferenceVideo {
  id: string;
  posterUrl: string;
  sourceUrl: string;
}

interface VideoComment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

interface CatalogueVideosSectionProps {
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

const VIDEO_COMMENTS_KEY = 'catalogue:video-comments';

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CatalogueVideosSection({ userEmail }: CatalogueVideosSectionProps) {
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByVideo, setCommentsByVideo] = useState<Record<string, VideoComment[]>>({});

  const previewVideo = useMemo(
    () => REFERENCE_VIDEOS.find((video) => video.id === previewVideoId) ?? null,
    [previewVideoId],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIDEO_COMMENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, VideoComment[]>;
      if (!parsed || typeof parsed !== 'object') return;
      setCommentsByVideo(parsed);
    } catch {
      // ignore parse errors and continue with empty comments
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIDEO_COMMENTS_KEY, JSON.stringify(commentsByVideo));
    } catch {
      // ignore storage write errors
    }
  }, [commentsByVideo]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewVideoId(null);
      }
    }

    if (!previewVideoId) return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewVideoId]);

  const activeComments = previewVideoId ? commentsByVideo[previewVideoId] ?? [] : [];

  function addComment() {
    const text = commentDraft.trim();
    if (!previewVideoId || !text) return;
    const nextComment: VideoComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      author: userEmail || 'Designer',
      createdAt: new Date().toISOString(),
    };
    setCommentsByVideo((previous) => ({
      ...previous,
      [previewVideoId]: [...(previous[previewVideoId] ?? []), nextComment],
    }));
    setCommentDraft('');
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

        <div className="catalogue-videos__grid">
          {REFERENCE_VIDEOS.map((video) => (
            <article key={video.id} className="catalogue-videos__card">
              <button
                type="button"
                className="catalogue-videos__preview-button"
                onClick={() => setPreviewVideoId(video.id)}
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
      </section>

      {previewVideo && (
        <div className="catalogue-videos-preview" role="dialog" aria-modal="true" onClick={() => setPreviewVideoId(null)}>
          <div className="catalogue-videos-preview__modal" onClick={(event) => event.stopPropagation()}>
            <div className="catalogue-videos-preview__main">
              <video
                className="catalogue-videos-preview__player"
                controls
                playsInline
                autoPlay
                preload="auto"
                poster={previewVideo.posterUrl}
                src={previewVideo.sourceUrl}
              />
              <button
                type="button"
                className="catalogue-videos-preview__close"
                onClick={() => setPreviewVideoId(null)}
                aria-label="Close video preview"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <aside className="catalogue-videos-preview__comments">
              <header className="catalogue-videos-preview__comments-head">
                <h3>Comments</h3>
                <span>Video {previewVideo.id}</span>
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
                <button type="button" onClick={addComment} disabled={!commentDraft.trim()}>
                  Save
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
