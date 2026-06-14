import { useEffect, useMemo, useState } from 'react';
import { FileCode2, Link as LinkIcon, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRelative } from '../lib/catalogue-relative-time';
import { useLinkMetadata, type LinkMetadata } from '../hooks/use-link-metadata';
import { CataloguePrototypes } from './CataloguePrototypes';
import { DotLoader } from './DotLoader';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';

type LinksSubTab = 'saved-links' | 'prototypes';

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

function faviconUrl(host: string) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
}

function displayLabel(link: LinkReference, meta: LinkMetadata | null | undefined): string {
  if (meta?.title) return meta.title;
  if (link.title && link.title.trim()) return link.title.trim();
  try {
    const u = new URL(link.url);
    const path = `${u.pathname}${u.search}`;
    if (!path || path === '/') return u.hostname;
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  } catch {
    return link.url;
  }
}

function shortAuthor(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function CatalogueLinksSection({
  canEdit = true,
  onRequireAuth,
  userEmail,
}: CatalogueLinksSectionProps) {
  const [activeTab, setActiveTab] = useState<LinksSubTab>('saved-links');
  const [links, setLinks] = useState<LinkReference[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [search, setSearch] = useState('');

  const allUrls = useMemo(() => links.map((link) => link.url), [links]);
  const { metadata } = useLinkMetadata(allUrls);

  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  // Flat sorted list of links (newest first), filtered by the search box.
  // No per-host grouping — every link renders as a peer card. The host
  // is surfaced inline on each card so the host context isn't lost.
  const filteredLinks = useMemo<LinkReference[]>(() => {
    const filtered = !isSearching
      ? links
      : links.filter((link) => {
          const meta = metadata[link.url];
          const haystack = [
            link.title || '',
            meta?.title || '',
            meta?.description || '',
            link.host,
            link.url,
            link.addedByEmail || '',
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(trimmedSearch);
        });
    return [...filtered].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }, [links, metadata, isSearching, trimmedSearch]);

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

  const totalLinks = links.length;
  const hasLinks = totalLinks > 0;

  return (
    <div className="catalogue-links-shell">
      <nav className="catalogue-links-tabs" role="tablist" aria-label="Links sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'saved-links'}
          className={`catalogue-links-tabs__tab ${activeTab === 'saved-links' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('saved-links')}
        >
          <LinkIcon size={13} aria-hidden="true" />
          Saved Links
          <span className="catalogue-links-tabs__count">{totalLinks}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'prototypes'}
          className={`catalogue-links-tabs__tab ${activeTab === 'prototypes' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('prototypes')}
        >
          <FileCode2 size={13} aria-hidden="true" />
          Prototypes
        </button>
      </nav>

      {activeTab === 'prototypes' ? (
        <CataloguePrototypes
          canEdit={canEdit}
          onRequireAuth={onRequireAuth}
          userEmail={userEmail}
        />
      ) : (
    <section className="catalogue-links" aria-label="Saved links">
      <header className="catalogue-links__head">
        <div className="catalogue-links__copy">
          <h2>Saved Links</h2>
          <p>Reference URLs saved from the catalogue.</p>
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
          {savingLink ? <DotLoader size="sm" ariaLabel="Saving" /> : <Plus size={14} aria-hidden="true" />}
          Add link
        </button>
      </div>
      {linkError && <p className="catalogue-links__error">{linkError}</p>}

      {hasLinks && (
        <div className="catalogue-links__search-row">
          <Search
            className="catalogue-links__search-icon"
            size={14}
            aria-hidden="true"
          />
          <input
            type="search"
            className="catalogue-links__search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${totalLinks} link${totalLinks === 1 ? '' : 's'}...`}
            aria-label="Search saved links"
          />
        </div>
      )}

      {loadingData ? (
        <p className="catalogue-links__loading">Loading saved links...</p>
      ) : !hasLinks ? (
        <p className="catalogue-links__empty">
          No links yet. Paste a URL above to save it.
        </p>
      ) : filteredLinks.length === 0 ? (
        <p className="catalogue-links__empty">No links match "{search.trim()}".</p>
      ) : (
        <IconTooltipProvider>
          <ul className="catalogue-links__items">
            {filteredLinks.map((link) => {
              const meta = metadata[link.url];
              const label = displayLabel(link, meta);
              const description = meta?.description?.trim() || null;
              const thumb = meta?.image || null;
              const author = shortAuthor(link.addedByEmail);
              const relative = formatRelative(link.addedAt);
              return (
                <li key={link.id} className="catalogue-links__item">
                  <a
                    className="catalogue-links__thumb"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          const img = event.currentTarget;
                          if (img.src !== faviconUrl(link.host)) {
                            img.src = faviconUrl(link.host);
                            img.classList.add('is-fallback');
                          } else {
                            img.style.visibility = 'hidden';
                          }
                        }}
                      />
                    ) : (
                      <img
                        className="is-fallback"
                        src={faviconUrl(link.host)}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </a>
                  <div className="catalogue-links__body">
                    <a
                      className="catalogue-links__url"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      title={link.url}
                    >
                      {label}
                    </a>
                    {description && (
                      <p className="catalogue-links__desc" title={description}>
                        {description}
                      </p>
                    )}
                    <div className="catalogue-links__meta">
                      <span className="catalogue-links__host">{link.host}</span>
                      {(author || relative) && (
                        <span className="catalogue-links__dot" aria-hidden="true">·</span>
                      )}
                      {author && <span className="catalogue-links__author">{author}</span>}
                      {author && relative && (
                        <span className="catalogue-links__dot" aria-hidden="true">·</span>
                      )}
                      {relative && <span className="catalogue-links__time">{relative}</span>}
                    </div>
                  </div>
                  <IconTooltip label="Remove link">
                    <button
                      type="button"
                      className="catalogue-links__remove"
                      onClick={() => void removeLink(link.id)}
                      aria-label={`Remove ${label}`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </IconTooltip>
                </li>
              );
            })}
          </ul>
        </IconTooltipProvider>
      )}
    </section>
      )}
    </div>
  );
}
