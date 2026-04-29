import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

interface LinkReference {
  id: string;
  url: string;
  normalizedUrl: string;
  host: string;
  title: string | null;
  addedAt: string;
  addedByEmail: string | null;
}

interface CatalogueLinkReferenceRow {
  id: string;
  url: string;
  normalized_url: string;
  host: string;
  title: string | null;
  added_by_email: string | null;
  created_at: string;
}

interface CatalogueLinksSectionProps {
  canEdit?: boolean;
  onRequireAuth?: () => void;
  userEmail: string;
}

interface ParsedLink {
  url: string;
  normalizedUrl: string;
  host: string;
}

function normalizeLink(raw: string): ParsedLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const isXHost =
      host === 'x.com' ||
      host.endsWith('.x.com') ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com');
    if (isXHost) return null;
    const normalized = `${url.protocol}//${host}${url.pathname}${url.search}`.replace(/\/$/, '');
    return {
      url: url.toString(),
      normalizedUrl: normalized || url.toString(),
      host,
    };
  } catch {
    return null;
  }
}

function toLinkReference(row: CatalogueLinkReferenceRow): LinkReference {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    host: row.host,
    title: row.title,
    addedAt: row.created_at,
    addedByEmail: row.added_by_email,
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function faviconUrl(host: string) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
}

export function CatalogueLinksSection({
  canEdit = true,
  onRequireAuth,
  userEmail,
}: CatalogueLinksSectionProps) {
  const [links, setLinks] = useState<LinkReference[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [links],
  );

  function ensureCanEdit() {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingData(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('catalogue_link_references')
        .select('id, url, normalized_url, host, title, added_by_email, created_at')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        setLoadError('Unable to load saved links. Run the latest catalogue links SQL migration.');
        setLoadingData(false);
        return;
      }

      const rows = (data || []) as CatalogueLinkReferenceRow[];
      setLinks(rows.map(toLinkReference));
      setLoadingData(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function addLink() {
    if (savingLink) return;
    if (!ensureCanEdit()) return;

    const parsed = normalizeLink(linkInput);
    if (!parsed) {
      setLinkError('Enter a valid http(s) URL. X / Twitter posts go in the Videos tab.');
      return;
    }
    if (links.some((link) => link.normalizedUrl === parsed.normalizedUrl)) {
      setLinkError('This link is already saved.');
      return;
    }

    setSavingLink(true);
    const { data, error } = await supabase
      .from('catalogue_link_references')
      .insert({
        url: parsed.url,
        normalized_url: parsed.normalizedUrl,
        host: parsed.host,
        title: null,
        added_by_email: userEmail,
      })
      .select('id, url, normalized_url, host, title, added_by_email, created_at')
      .single();
    setSavingLink(false);

    if (error) {
      if (error.code === '23505') {
        setLinkError('This link is already saved.');
        return;
      }
      setLinkError('Unable to save this link right now.');
      return;
    }
    if (!data) {
      setLinkError('Unable to save this link right now.');
      return;
    }

    setLinks((previous) => [toLinkReference(data as CatalogueLinkReferenceRow), ...previous]);
    setLinkInput('');
    setLinkError(null);
  }

  async function removeLink(linkId: string) {
    if (!ensureCanEdit()) return;
    const target = links.find((item) => item.id === linkId);
    if (!target) return;

    const { error } = await supabase
      .from('catalogue_link_references')
      .delete()
      .eq('id', linkId);

    if (error) return;

    setLinks((previous) => previous.filter((link) => link.id !== linkId));
  }

  return (
    <section className="catalogue-links" aria-label="Saved links">
      <header className="catalogue-links__head">
        <div className="catalogue-links__copy">
          <h2>Saved Links</h2>
          <p>Reference URLs saved from the catalogue or shared via the Telegram bot.</p>
        </div>
      </header>

      {loadError && <p className="catalogue-links__error">{loadError}</p>}

      <div className="catalogue-links__add-row">
        <input
          type="text"
          value={linkInput}
          onChange={(event) => {
            setLinkInput(event.target.value);
            if (linkError) setLinkError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void addLink();
            }
          }}
          placeholder="Paste any URL (https://...)"
        />
        <button
          type="button"
          onClick={() => void addLink()}
          disabled={savingLink}
        >
          {savingLink ? 'Saving...' : 'Add Link'}
        </button>
      </div>
      {linkError && <p className="catalogue-links__error">{linkError}</p>}

      {loadingData ? (
        <p className="catalogue-links__loading">Loading saved links...</p>
      ) : sortedLinks.length === 0 ? (
        <p className="catalogue-links__empty">
          No links yet. Paste a URL above or send one to the Telegram bot.
        </p>
      ) : (
        <ul className="catalogue-links__list">
          {sortedLinks.map((link) => (
            <li key={link.id} className="catalogue-links__item">
              <img
                className="catalogue-links__favicon"
                src={faviconUrl(link.host)}
                alt=""
                width={24}
                height={24}
                loading="lazy"
              />
              <div className="catalogue-links__body">
                <a
                  className="catalogue-links__url"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.url}
                >
                  {link.title || link.url}
                </a>
                <div className="catalogue-links__meta">
                  <span className="catalogue-links__host">{link.host}</span>
                  <span className="catalogue-links__dot" aria-hidden="true">·</span>
                  <span className="catalogue-links__time">{formatTime(link.addedAt)}</span>
                  {link.addedByEmail && (
                    <>
                      <span className="catalogue-links__dot" aria-hidden="true">·</span>
                      <span className="catalogue-links__author">{link.addedByEmail}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="catalogue-links__remove"
                onClick={() => void removeLink(link.id)}
                title="Remove link"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
