# Catalogue Ideation — May 2 2026

> Session log capturing two ideation threads on branch
> `claude/add-folder-view-pQyAy`. Neither thread reached an
> implementation decision; this doc records findings and option sets so
> they survive the branch.

---

## 1. Folder view — historical context

### Question
Does the repo have any existing idea or mention of a "folder view" for
the Catalogue?

### Finding
Not currently. There is **no folder-view code, doc, or schema** in any
tracked file today.

There was a prior reference in a now-deleted plan doc:

- **`docs/stack-view-plan.md`** (added in commit `dceb2a0`, Apr 13 2026)
  listed Folder view as a sibling of Grid / Stack / Gallery:
  - *"Related views: Grid, Gallery, Folder (CD page, not yet shipped)"*
  - Future enum: `'grid' | 'stack' | 'gallery' | 'folder'`
  - *"Grid, List, Gallery (shipped) · Folder (CD prototype)"*
- The doc was deleted in commit `f33dc35` ("Strip repo to Catalogue-only")
  during the repo split. The "CD prototype" referenced lived on a
  `/designer/cd` page that was moved to
  [AgentUX-other](https://github.com/yamparalarahul27/AgentUX-other).

### Status
Concept acknowledged in passing in early 2026, never implemented in this
repo. No active proposal. Branch `claude/add-folder-view-pQyAy` is the
first place implementation work would land — but no decision was made
in this session to start.

---

## 2. Group chip — hover metrics card

### Problem
Today, hovering a group chip in `CatalogueGroupChipStrip` shows only the
default browser tooltip (`title=` attribute on
`CatalogueGroupChip.tsx:32`):

```
Crpko · 42 screenshots · last added 2h ago
```

Per-group context is otherwise hidden — a designer scanning chips can't
quickly see how a group breaks down by platform, theme, or flow without
clicking through and applying filters.

### Proposal
Replace the title-attribute tooltip with a portal-rendered popover card
on hover.

### Available data (no schema changes)
From `screenshots[]` we can derive per-group:

- Total count, last added, first added
- Platform split (`web` / `mobile`)
- Theme split (`dark` / `light`)
- Mobile OS split (`ios` / `android`, when platform = mobile)
- Flow count (distinct `flow_id`)
- Screen-family count (distinct `screen_family_id`)
- Per-day upload sparkline

### Layout options

**Option A — Minimal (≈ styled tooltip)**

```
chip:  [🟧 Crpko  42]
              │
              ▼
   ┌────────────────────────────┐
   │ 🟧  Crpko             · 42 │
   │ Last added 2h ago          │
   │ Web 30 · Mobile 12         │
   └────────────────────────────┘
```

**Option B — Compact stats card (recommended)**

```
chip:  [🟧 Crpko  42]
              │
              ▼
   ┌──────────────────────────────────┐
   │  🟧  Crpko                       │
   │      42 screenshots              │
   │ ──────────────────────────────── │
   │  Platform   Web 30 · Mobile 12   │
   │  Theme      Dark 36 · Light 6    │
   │  Flows      7                    │
   │  Families   18                   │
   │  Last       2h ago               │
   └──────────────────────────────────┘
```

**Option C — Rich card with sparkline + bars**

```
chip:  [🟧 Crpko  42]
              │
              ▼
   ┌──────────────────────────────────────┐
   │  🟧  Crpko                       42  │
   │ ──────────────────────────────────── │
   │  Uploads · 14 days                   │
   │  ▁▂▃▅▇█▅▃▂▁▂▃▅█                      │
   │ ──────────────────────────────────── │
   │  Web    ███████████░░░░  30  71%     │
   │  Mobile ████░░░░░░░░░░░  12  29%     │
   │ ──────────────────────────────────── │
   │  Dark 36 · Light 6                   │
   │  Flows 7 · Families 18               │
   │  First Apr 2  ·  Last 2h ago         │
   └──────────────────────────────────────┘
```

### Behaviour (same for all three)
- Hover delay ~300 ms before showing; hide on mouseleave with ~150 ms grace.
- Card portals to `document.body` (same pattern as the sort menu in
  `CatalogueGroupChipStrip.tsx:170`).
- Anchored below the chip; flips above when there is no room (reuse
  `positionFromTrigger`, lines 81–101).
- Ticker already pauses on hover (`CatalogueGroupChipStrip.tsx:132`), so
  the chip anchor stays put while the card is visible.
- Touch devices: skip the popover, keep current click-to-filter only.
  No long-press fallback.

### Recommendation
**Option B.** Surfaces the splits a designer actually scans for
(platform / theme / flows) without pulling time-series math, sparkline
rendering, or proportional bars into v1.

### Future extension — external metrics
Idea floated: surface product-intel metrics like 24h trade volume or
user counts on the same card.

Blocker: we don't store these. Three feeds were considered:

1. **Public APIs** (CoinGecko, CoinMarketCap) — free-ish but crypto-only;
   makes the feature non-generalisable.
2. **Crpko backend integration** — accurate, but one-sided (no parity for
   competitors like Binance / Coinbase) and adds an integration we don't
   have today.
3. **Manual entry per group** in Team Settings — cheap, but stale within
   hours.

Tradeoff: turns the catalogue from a screenshot library into a light
product-intel surface. Justifies the API-key / freshness / rate-limit
baggage only if designers actually consult the metrics during review.

**Recommendation:** ship Option B's catalogue-internal stats first;
design the card layout with an **optional bottom slot for an
`externalMetrics` blob** so a feed can drop in later without
re-architecting the popover.

---

## Status
Both threads are exploratory. **No code, no schema, no commitments.**
This doc preserves the findings and option set so the next session can
pick up without re-doing the research.
