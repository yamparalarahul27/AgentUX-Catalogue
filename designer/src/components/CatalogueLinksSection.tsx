import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRelative } from '../lib/catalogue-relative-time';
import { useLinkMetadata, type LinkMetadata } from '../hooks/use-link-metadata';

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

interface HostGroup {
  host: string;
  items: LinkReference[];
  latestAddedAt: string;
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
  const [links, setLinks] = useState<LinkReference[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedHosts, setCollapsedHosts] = useState<Record<string, boolean>>({});

  const allUrls = useMemo(() => links.map((link) => link.url), [links]);
  const { metadata } = useLinkMetadata(allUrls);

  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const groups = useMemo<HostGroup[]>(() => {
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

    const byHost = new Map<string, LinkReference[]>();
    for (const link of filtered) {
      const existing = byHost.get(link.host);
      if (existing) existing.push(link);
      else byHost.set(link.host, [link]);
    }

    const result: HostGroup[] = [];
    for (const [host, items] of byHost) {
      items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      result.push({ host, items, latestAddedAt: items[0]?.addedAt ?? '' });
    }
    result.sort((a, b) => b.latestAddedAt.localeCompare(a.latestAddedAt));
    return result;
  }, [links, metadata, isSearching, trimmedSearch]);

  function ensureCanEdit() {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  function toggleHost(host: string) {
    setCollapsedHosts((prev) => ({ ...prev, [host]: !prev[host] }));
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
          <Plus size={14} aria-hidden="true" />
          {savingLink ? 'Saving...' : 'Add link'}
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
          No links yet. Paste a URL above or send one to the Telegram bot.
        </p>
      ) : groups.length === 0 ? (
        <p className="catalogue-links__empty">No links match "{search.trim()}".</p>
      ) : (
        <ul className="catalogue-links__groups">
          {groups.map((group) => {
            const userCollapsed = collapsedHosts[group.host];
            const expanded = isSearching ? true : !userCollapsed;
            return (
              <li key={group.host} className="catalogue-links__group">
                <button
                  type="button"
                  className="catalogue-links__group-head"
                  onClick={() => toggleHost(group.host)}
                  aria-expanded={expanded}
                >
                  <img
                    className="catalogue-links__favicon"
                    src={faviconUrl(group.host)}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                  />
                  <span className="catalogue-links__group-host">{group.host}</span>
                  <span className="catalogue-links__group-count">{group.items.length}</span>
                  <ChevronRight
                    className={`catalogue-links__group-caret${expanded ? ' is-open' : ''}`}
                    size={14}
                    aria-hidden="true"
                  />
                </button>

                {expanded && (
                  <ul className="catalogue-links__items">
                    {group.items.map((link) => {
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
                              {author && <span className="catalogue-links__author">{author}</span>}
                              {author && relative && (
                                <span className="catalogue-links__dot" aria-hidden="true">·</span>
                              )}
                              {relative && <span className="catalogue-links__time">{relative}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="catalogue-links__remove"
                            onClick={() => void removeLink(link.id)}
                            title="Remove link"
                            aria-label={`Remove ${label}`}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
