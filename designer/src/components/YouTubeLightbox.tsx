import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  videoId: string;
  title: string | null;
  channelName: string | null;
  channelHandle: string | null;
  url: string;
  onClose: () => void;
}

// Full-viewport modal that plays a YouTube video via the privacy-friendly
// youtube-nocookie.com embed. Mounted only while a video is open — the
// iframe is unloaded the moment onClose fires so playback stops + memory
// is released cleanly. Click backdrop / press ESC / press the close button
// to dismiss.
//
// Kept as its own component (rather than reusing the existing X-post
// preview modal) because YouTube has its own evolution path planned —
// timestamp deep-linking, theater mode, transcript view, chapter list.
// All future YouTube-specific features land here.
export function YouTubeLightbox({ videoId, title, channelName, channelHandle, url, onClose }: Props) {
  // ESC to close + body scroll lock while the modal is open.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // youtube-nocookie.com avoids dropping tracking cookies until the user
  // actually engages, which matches the click-to-load privacy posture
  // the parked memory called out for the broader Videos area.
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="catalogue-videos__yt-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'YouTube video'}
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        className="catalogue-videos__yt-lightbox-close"
        onClick={onClose}
        aria-label="Close video"
      >
        <X size={18} aria-hidden="true" />
      </button>
      <div className="catalogue-videos__yt-lightbox-frame">
        <div className="catalogue-videos__yt-lightbox-player">
          <iframe
            src={embedSrc}
            title={title ?? 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="catalogue-videos__yt-lightbox-meta">
          <p className="catalogue-videos__yt-lightbox-title">{title ?? 'Loading…'}</p>
          {channelName && (
            <span className="catalogue-videos__yt-lightbox-channel">
              {channelName}
              {channelHandle && (
                <span className="catalogue-videos__yt-lightbox-handle"> · @{channelHandle}</span>
              )}
            </span>
          )}
          <div className="catalogue-videos__yt-lightbox-actions">
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="catalogue-videos__yt-lightbox-btn"
            >
              Open on YouTube ↗
            </a>
            <button
              type="button"
              className="catalogue-videos__yt-lightbox-btn"
              onClick={() => { void navigator.clipboard?.writeText(url); }}
            >
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
