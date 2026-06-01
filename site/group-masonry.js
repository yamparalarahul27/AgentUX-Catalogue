// Renders the group-icons masonry on the landing.
//
// Two parallel anon fetches:
//  1. catalogue_group_appearance — for the icons + labels (per migration
//     20260516_share_page_group_appearance_anon.sql).
//  2. screenshots.group_key — for per-group screenshot counts (anon
//     SELECT on non-deleted screenshots, same RLS as the share page).
//
// We pick the top 30 groups by screenshot count, then shuffle that set
// so every page-load reorders without losing the "popular apps" filter.
// Each tile links to /designer/g/<key> so a curious visitor can drill
// straight in.
//
// Failures are silent — the masonry is decorative; if the fetches die,
// the page still works.

(function () {
  'use strict';

  const url = window.AGENTUX_SUPABASE_URL;
  const key = window.AGENTUX_SUPABASE_ANON_KEY;
  const grid = document.getElementById('group-masonry');
  if (!url || !key || !grid) return;

  const TOP_N = 30;

  const groupsEndpoint =
    url +
    '/rest/v1/catalogue_group_appearance' +
    '?icon_url=not.is.null' +
    '&select=group_key,display_label,icon_url';

  // Only need the `group` column (named `group` on screenshots, not
  // `group_key` — the appearance table calls the same value
  // `group_key`). Keeps the payload small (~30 bytes per row).
  //
  // PostgREST caps each response at 1000 rows. The first request
  // includes Prefer: count=exact so the response carries the total
  // via Content-Range; remaining pages then fire in parallel.
  const countsEndpoint =
    url +
    '/rest/v1/screenshots' +
    '?select=group' +
    '&deleted_at=is.null' +
    '&group=not.is.null' +
    '&order=id.asc';

  const baseHeaders = { apikey: key, Authorization: 'Bearer ' + key };
  const PAGE_SIZE = 1000;

  Promise.all([
    fetch(groupsEndpoint, { headers: baseHeaders }).then(parseJson),
    fetchAllScreenshots(),
  ])
    .then(function (results) {
      const groups = results[0];
      const screenshots = results[1];
      if (!Array.isArray(groups) || !Array.isArray(screenshots)) return;

      // Tally per group value. screenshots.group is mixed-case (e.g.
      // "GMGN", "coinbase", "Fomo"); catalogue_group_appearance.group_key
      // is lowercase. Normalise both sides for the join, otherwise most
      // counts come out zero and the masonry collapses to a handful of
      // tiles.
      const counts = Object.create(null);
      for (let i = 0; i < screenshots.length; i++) {
        const raw = screenshots[i] && screenshots[i].group;
        if (!raw) continue;
        const k = String(raw).toLowerCase();
        counts[k] = (counts[k] || 0) + 1;
      }

      // Annotate each group with its count, drop ones with no
      // screenshots, then sort desc by count and take the top N.
      const annotated = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (!g || !g.icon_url || !g.group_key) continue;
        const c = counts[String(g.group_key).toLowerCase()] || 0;
        if (c === 0) continue;
        annotated.push({
          group_key: g.group_key,
          display_label: g.display_label,
          icon_url: g.icon_url,
          count: c,
        });
      }
      annotated.sort(function (a, b) { return b.count - a.count; });
      const top = annotated.slice(0, TOP_N);

      // Shuffle within the top set so the wall doesn't always lead
      // with the same brand — most popular set is stable, order isn't.
      shuffle(top);

      grid.innerHTML = top.map(renderTile).join('');
      grid.dataset.loaded = '1';
    })
    .catch(function () {
      // Silent — masonry is decorative.
    });

  function parseJson(response) {
    if (!response.ok) throw new Error('http ' + response.status);
    return response.json();
  }

  // Two-phase fetch: first call asks for the row count via
  // Prefer: count=exact (PostgREST returns it in Content-Range as
  // "0-999/TOTAL"). Then we issue remaining page fetches in parallel
  // and concatenate. Avoids sequential N-page round-trips.
  function fetchAllScreenshots() {
    const firstHeaders = Object.assign({}, baseHeaders, {
      Prefer: 'count=exact',
      Range: '0-' + (PAGE_SIZE - 1),
    });
    return fetch(countsEndpoint, { headers: firstHeaders }).then(function (response) {
      if (!response.ok) throw new Error('http ' + response.status);
      const range = response.headers.get('content-range') || '';
      const totalMatch = range.match(/\/(\d+)/);
      const total = totalMatch ? Number(totalMatch[1]) : 0;
      return response.json().then(function (firstPage) {
        if (total <= PAGE_SIZE) return firstPage;
        const pagePromises = [];
        for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) {
          const headers = Object.assign({}, baseHeaders, {
            Range: from + '-' + (from + PAGE_SIZE - 1),
          });
          pagePromises.push(fetch(countsEndpoint, { headers }).then(parseJson));
        }
        return Promise.all(pagePromises).then(function (rest) {
          return firstPage.concat.apply(firstPage, rest);
        });
      });
    });
  }

  function renderTile(row) {
    const label = row.display_label || row.group_key || '';
    const safeLabel = escapeHtml(label);
    const safeKey = encodeURIComponent(String(row.group_key || '').toLowerCase());
    const safeIcon = String(row.icon_url || '').replace(/"/g, '&quot;');
    return (
      '<a class="group-tile" href="/designer/g/' + safeKey + '" title="' + safeLabel + '" aria-label="' + safeLabel + '">' +
        '<img src="' + safeIcon + '" alt="" loading="lazy" decoding="async" />' +
      '</a>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
})();
