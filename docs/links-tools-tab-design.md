# Links → Tools sub-tab

> **Status:** v1 shipped on branch `claude/ios-shortcuts-bookmark-sync-6auzc6` (commit `bdf8d13`). Not yet merged, no PR. Idea will be improvised further.

A **Tools** sub-tab inside the Links section. A "tool" is just a saved link
the user has flagged — the Tools tab is a *filtered view* over the existing
links, not a separate bucket.

---

## Why

The catalogue already collects reference URLs under **Links**. Some of those
links are *tools* (Figma, Excalidraw, an AI playground, a converter…) that the
user reaches for repeatedly, and they get lost in the flat list of saved
links. Tools deserve their own quick-access surface — but they're still
links, so duplicating the storage/ingest machinery would be wasteful.

The smallest thing that solves this: flag a link as a tool, and give those
flagged links their own tab.

---

## Where it lives

`Links` is a top-level section with sub-tabs. Today:

```
Top level:   [ Catalogue ]   [ Videos ]   [ Links ]
                                              │
Inside Links:   [ 🔗 Saved Links ]   [ </> Prototypes ]   [ 🔧 Tools ]   ← new
```

Tools is the **third sub-tab**, beside Prototypes. No new top-level section,
no routing changes.

---

## Data model

A single boolean on the existing table — no new table, no tags system:

```sql
alter table public.catalogue_link_references
  add column if not exists is_tool boolean not null default false;
```

- Migration: [`supabase/migrations/20260628_link_refs_is_tool.sql`](../supabase/migrations/20260628_link_refs_is_tool.sql)
- Canonical schema: [`designer/sql/catalogue-links.sql`](../designer/sql/catalogue-links.sql)

RLS is unchanged — `catalogue_link_references` already grants authenticated
users full access (`20260513_enable_rls_public_release.sql`), so the flag
toggle (an `UPDATE`) and tool inserts work without policy changes.

---

## UX

All in [`CatalogueLinksSection.tsx`](../designer/src/components/CatalogueLinksSection.tsx).

| Element | Behaviour |
|---|---|
| **Wrench toggle** | A 🔧 button on every link card, left of the remove ✕. Reveals on hover; once flagged it **stays lit** (indigo accent) so tool links are scannable in any tab. Optimistic update, reverts on failure. |
| **Tools tab** | Same card list, filtered to `is_tool = true`. Its own search box, count, and empty state. |
| **Add from Tools** | Pasting a URL while on the Tools tab auto-flags it (`is_tool = true`). On Saved Links it stays a plain link. |
| **Tab-aware copy** | Header, placeholder, button label ("Add tool" vs "Add link"), and empty/search-miss states all switch by tab. |

### Behaviour decisions (settled for v1)

1. **A flagged link appears in *both* Saved Links and Tools.** Tools is a
   filtered subset, not a move. Flagging is non-destructive — un-flagging
   just drops it out of the Tools view.
2. **Flag after adding**, via the per-card wrench. This also works for the
   *existing* backlog of links, which an add-time-only checkbox would not.

---

## Deploy requirement

⚠️ This needs the migration applied before it works in production. The client
`select` now requests `is_tool`; until the column exists the Links section
fails to load. After merge, run `supabase db push` (same deploy gap as the
iOS upload-token feature). On a local DB, apply the migration or the updated
`catalogue-links.sql`.

---

## Future directions (improvising)

Open threads for when this grows past v1 — none built yet:

- **Graduate the flag to richer categorisation.** If Tools needs sub-grouping
  (e.g. "design", "AI", "convert"), migrate `is_tool` → a `tags text[]` array
  (mirrors the Videos tags pattern) or a `category` field with a CHECK
  constraint. The boolean is deliberately the floor, not the ceiling.
- **Promote Tools to a top-level pill** if it earns its own identity rather
  than living under Links.
- **Tool-specific card treatment** — bigger favicon/launcher tiles, pinning,
  ordering, keyboard launch — instead of reusing the link card verbatim.
- **Ingest path** — let the iOS Shortcut / share flow flag an incoming link
  as a tool at capture time.
