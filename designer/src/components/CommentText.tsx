import { Fragment, useMemo, useState, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { SquareArrowOutUpRight } from 'lucide-react';

import { mentionLabel, useTeamRoster } from '../hooks/use-team-roster';
import { supabase } from '../lib/supabase';

// Render a comment body as plain text with URLs replaced by small
// favicon chips. Hover the chip to see a rich preview card with
// the page's OG image (where available), title, the full URL, and
// a clickable "open in new tab" hint.
//
// Used by both the screenshot lightbox comments and the videos
// preview-modal comments (X-post / YouTube), so a link in any
// comment renders identically across surfaces.
//
// Favicon source: Google's free s2/favicons endpoint. Sends only
// the *domain*, no API key, no PII.
//
// OG metadata source: our `fetch-link-metadata` Supabase Edge
// Function — the same function the Saved Links tab uses. Cached
// in sessionStorage under the same key so a chip the user has
// already seen in Links tab shows the OG image instantly. Lazy
// fetched (only when a chip is actually hovered) so comments with
// many URLs don't burn requests on render.

const URL_REGEX = /(https?:\/\/[^\s<>"]+)/gi;
// M5 — mention chip rendering. Matches `@<token>` where token can
// include dots, plus, dashes, underscores — matches the local-part
// charset we tolerate elsewhere. Trailing punctuation (`.`, `-`, `_`)
// is stripped before resolution so "Hi @rahul." finds rahul.
const MENTION_TOKEN_RE = /@([\w.+-]+)/g;
const STORAGE_KEY = 'catalogue-link-meta-v1';

interface OgData {
  image: string | null;
  title: string | null;
  description: string | null;
}

// Module-level in-flight dedup so the same URL hovered twice in
// quick succession doesn't fire two parallel Edge Function calls.
const inFlight = new Map<string, Promise<OgData | null>>();

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function readCache(): Record<string, OgData | null> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(url: string, data: OgData | null) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const current = readCache();
    current[url] = data;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // quota exceeded or storage disabled — ignore
  }
}

async function fetchOg(url: string): Promise<OgData | null> {
  const cached = readCache();
  if (url in cached) return cached[url];

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        results: Record<string, OgData | null>;
      }>('fetch-link-metadata', { body: { urls: [url] } });
      if (error || !data?.results) {
        writeCache(url, null);
        return null;
      }
      const result = data.results[url] ?? null;
      writeCache(url, result);
      return result;
    } catch {
      writeCache(url, null);
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, promise);
  return promise;
}

interface LinkChipProps {
  url: string;
}

function LinkChip({ url }: LinkChipProps) {
  const host = safeHost(url);
  const [og, setOg] = useState<OgData | null>(() => {
    const cached = readCache();
    return cached[url] ?? null;
  });

  if (!host) {
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
            <a
              className="comment-link-preview__hint"
              href={url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Click to Open in New Tab
            </a>
          </div>
          <Tooltip.Arrow className="comment-link-preview__arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Inline mention chip — avatar dot + @<local-part>. Renders when the
// text contains an @-token that resolves to a real team member. The
// chip sits inline at the baseline so it doesn't break sentence flow.
function MentionChip({ email }: { email: string }) {
  const label = mentionLabel(email);
  const initial = label.charAt(0).toUpperCase();
  return (
    <span className="comment-mention-chip" data-email={email}>
      <span className="comment-mention-chip__avatar" aria-hidden="true">{initial}</span>
      <span className="comment-mention-chip__label">@{label}</span>
    </span>
  );
}

// Walk a text segment looking for `@<token>` mentions. Tokens that
// resolve to a real team member (via the roster's local-parts) become
// chips; tokens that don't pass through as plain text. Roster is
// supplied as a Map<localPart, email> so lookups are O(1) per match.
function renderTextWithMentions(text: string, rosterByLabel: Map<string, string>): ReactNode[] {
  if (!text) return [text];
  if (rosterByLabel.size === 0) return [text];
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const start = match.index ?? 0;
    const raw = match[1];
    // Strip trailing sentence punctuation so "@rahul." still matches.
    const cleaned = raw.replace(/[.\-_]+$/, '').toLowerCase();
    const email = rosterByLabel.get(cleaned);
    if (start > cursor) out.push(text.slice(cursor, start));
    if (email) {
      out.push(<MentionChip key={`m-${start}`} email={email} />);
      // Step past the `@` + cleaned label; any trailing punctuation
      // we stripped sits AFTER cleaned.length in the original match,
      // so the next text segment naturally picks it up.
      cursor = start + 1 + cleaned.length;
    } else {
      // Not a real member — keep the whole `@<raw>` as-is.
      out.push(match[0]);
      cursor = start + match[0].length;
    }
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

interface CommentTextProps {
  text: string;
}

export function CommentText({ text }: CommentTextProps) {
  const { roster } = useTeamRoster();
  // Build the lookup once per (roster) and re-use across multiple
  // mention tokens in this comment. Keys are lowercased local-parts.
  const rosterByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const email of roster) {
      map.set(mentionLabel(email).toLowerCase(), email);
    }
    return map;
  }, [roster]);

  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return <LinkChip key={`link-${i}`} url={part} />;
        }
        return (
          <Fragment key={`text-${i}`}>
            {renderTextWithMentions(part, rosterByLabel)}
          </Fragment>
        );
      })}
    </>
  );
}
