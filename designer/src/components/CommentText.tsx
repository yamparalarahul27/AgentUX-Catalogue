import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { SquareArrowOutUpRight } from 'lucide-react';

// Render a comment body as plain text with URLs replaced by small
// favicon chips. Hover the chip to see a rich preview card with
// the page's OG image (where available), the full URL, and a hint
// that the chip opens in a new tab.
//
// Used by both the screenshot lightbox comments and the videos
// preview-modal comments (X-post / YouTube), so a link in any
// comment renders identically across surfaces.
//
// Favicon source: Google's free s2/favicons endpoint. No API key,
// cacheable, 32px. Sends only the *domain* — never the path or
// query — so we don't leak comment-link telemetry to a 3rd party
// just for the chip.
//
// OG image source: microlink.io free tier (~50 req/day per IP, no
// key). Fired ONLY when the tooltip actually opens, so a comment
// body with 5 URLs costs 0 requests until the user hovers a chip.
// Trade-off: full URL is sent to microlink for the scrape. If we
// need to keep URLs in-house, swap this fetch for a Supabase Edge
// Function + cache table — see PR thread.

const URL_REGEX = /(https?:\/\/[^\s<>"]+)/gi;

interface OgData {
  image: string | null;
  title: string | null;
  description: string | null;
  host: string;
}

// Module-level cache: same URL hovered twice in one session reuses
// the previous fetch result. Clears on page reload. Sentinel value
// 'pending' lets us deduplicate concurrent fetches for the same URL.
const ogCache = new Map<string, OgData | 'pending' | 'failed'>();

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function fetchOg(url: string): Promise<OgData | null> {
  const cached = ogCache.get(url);
  if (cached === 'pending' || cached === 'failed') return null;
  if (cached) return cached;

  ogCache.set(url, 'pending');
  try {
    const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      ogCache.set(url, 'failed');
      return null;
    }
    const json = await response.json();
    if (json?.status !== 'success') {
      ogCache.set(url, 'failed');
      return null;
    }
    const data: OgData = {
      image: json?.data?.image?.url ?? null,
      title: json?.data?.title ?? null,
      description: json?.data?.description ?? null,
      host: safeHost(url) ?? url,
    };
    ogCache.set(url, data);
    return data;
  } catch {
    ogCache.set(url, 'failed');
    return null;
  }
}

interface LinkChipProps {
  url: string;
}

function LinkChip({ url }: LinkChipProps) {
  const host = safeHost(url);
  const [og, setOg] = useState<OgData | null>(() => {
    const cached = ogCache.get(url);
    return cached && cached !== 'pending' && cached !== 'failed' ? cached : null;
  });

  if (!host) {
    // Malformed URL — render as plain text so we don't ship a broken
    // chip with a dead favicon request.
    return <span>{url}</span>;
  }
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;

  function handleOpenChange(open: boolean) {
    if (!open || og) return;
    void fetchOg(url).then((data) => {
      if (data) setOg(data);
    });
  }

  return (
    <Tooltip.Root delayDuration={250} onOpenChange={handleOpenChange}>
      <Tooltip.Trigger asChild>
        <a
          className="comment-link-chip"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
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
          <SquareArrowOutUpRight className="comment-link-chip__arrow" size={11} aria-hidden="true" />
        </a>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="comment-link-preview"
          sideOffset={8}
          collisionPadding={12}
          side="top"
        >
          {og?.image && (
            <img
              className="comment-link-preview__image"
              src={og.image}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
          <div className="comment-link-preview__body">
            {og?.title && <div className="comment-link-preview__title">{og.title}</div>}
            <div className="comment-link-preview__url">{url}</div>
            <div className="comment-link-preview__hint">Click to open in new tab</div>
          </div>
          <Tooltip.Arrow className="comment-link-preview__arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
