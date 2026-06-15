import { ExternalLink } from 'lucide-react';

// Render a comment body as plain text with URLs replaced by small
// favicon chips. Hover the chip to see the full URL + a hint that
// the chip opens in a new tab.
//
// Used by both the screenshot lightbox comments and the videos
// preview-modal comments (X-post / YouTube), so a link in any
// comment renders identically across surfaces.
//
// Favicon source: Google's free s2/favicons endpoint. No API key,
// cacheable, 32px. Sends only the *domain* — never the path or
// query — so we don't leak comment-link telemetry to a 3rd party.

const URL_REGEX = /(https?:\/\/[^\s<>"]+)/gi;

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface LinkChipProps {
  url: string;
}

function LinkChip({ url }: LinkChipProps) {
  const host = safeHost(url);
  if (!host) {
    // Malformed URL — render as plain text so we don't ship a broken
    // chip with a dead favicon request.
    return <span>{url}</span>;
  }
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  return (
    <a
      className="comment-link-chip"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`${url}\n\nClick to open in new tab`}
    >
      <img
        className="comment-link-chip__favicon"
        src={favicon}
        alt=""
        width={14}
        height={14}
        loading="lazy"
        decoding="async"
      />
      <span className="comment-link-chip__host">{host}</span>
      <ExternalLink className="comment-link-chip__arrow" size={11} aria-hidden="true" />
    </a>
  );
}

interface CommentTextProps {
  text: string;
}

export function CommentText({ text }: CommentTextProps) {
  // Split the text into [string, url, string, url, …] segments. The
  // regex's capture group ensures the matched URLs are returned in
  // the split output alongside the surrounding text.
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // Odd indices are the captured URL groups.
          return <LinkChip key={`link-${i}`} url={part} />;
        }
        return <span key={`text-${i}`}>{part}</span>;
      })}
    </>
  );
}
