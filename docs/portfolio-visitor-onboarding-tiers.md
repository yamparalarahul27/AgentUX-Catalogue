# Portfolio Visitor Onboarding — Tier Comparison & Plan

Planning document for tailoring the AgentUX Catalogue experience for visitors
arriving from the personal portfolio site (`hirahul.xyz`).

This is a **decision document, not an implementation spec**. Read it, pick a
tier (or a hybrid), then we'll write a focused implementation plan for the
chosen path.

---

## Goal

Visitors arriving from the portfolio's "AgentUX" card should land on the
catalogue and immediately understand:

1. What this app **is** (a curated screenshot / video / link library for
   product teams).
2. What each tab **does** (Screens, Videos, Links, Bookmarks, Telegram bot).
3. Why they should **care** (faster reference work, shared team library,
   minimal-friction capture).

Visitors arriving from search, social, or direct should not be force-fed an
explainer — only those routed in from the portfolio context get the welcome.

The same mechanism could later target visitors from any inbound source
(blog post, conference link, etc.) by varying the param value, so we
should not hardcode "portfolio" too deeply.

---

## Detection mechanism (shared by all tiers)

Independent of which tier we pick, we need a reliable way to know "this
visitor came from the portfolio." Two signals, combined:

### Primary: query parameter

The portfolio link becomes:

```
https://catalogue.agentux.dev/?from=portfolio
```

On app mount, the catalogue reads `URLSearchParams.get('from')`. If it equals
a known value (`portfolio`), the welcome flow activates.

Pros:
- Works regardless of browser referrer policy.
- Survives privacy-mode and stripped referrers.
- Easy to extend (`?from=blog`, `?from=conf-talk`) without code changes
  beyond a small allowlist.
- Trivial to test locally — just append the param.

Cons:
- Anyone can share a URL with `?from=portfolio` and trigger the welcome
  for someone unrelated. This is fine because nothing is gated; the
  worst case is a stranger sees a friendly explainer they didn't ask
  for, which the once-only localStorage gate makes harmless.

### Secondary fallback: `document.referrer`

If `from` is missing but `document.referrer.startsWith('https://hirahul.xyz')`,
treat it as portfolio-origin too. Useful when the user happens to navigate
without the query param (e.g. you forgot to add it on one card, or someone
links to the bare URL from a portfolio sub-page).

This is an `OR` — either signal triggers; if both are absent, no welcome.

### One-time gate

Wrap activation in a localStorage check:

```ts
const SEEN_KEY = 'agentux:portfolio-welcome:v1';

const cameFromPortfolio =
  new URLSearchParams(location.search).get('from') === 'portfolio' ||
  document.referrer.startsWith('https://hirahul.xyz');

const alreadySeen = localStorage.getItem(SEEN_KEY) === 'done';

const shouldShowWelcome = cameFromPortfolio && !alreadySeen;
```

On dismissal: `localStorage.setItem(SEEN_KEY, 'done')`. Bump the `v1` suffix
when copy/structure changes meaningfully — that resets seen-state for
returning visitors.

### Where to hook

In `designer/src/CatalogueApp.tsx` (mount-level) — adjacent to existing
auth/init logic. Avoid stuffing it in deeply nested components; keeping
it at the top means the welcome flow is decoupled from any tab's state.

---

## Tier 1 — Multi-step modal carousel

The recommended starting point. Most of what a "fancy tour" gives you,
without coupling to DOM state.

### Concept

A centered modal overlay with a series of cards. Each card explains one
feature, optionally with an embedded video. User clicks **Next** through
the deck or **Skip** out at any point. On the last card, **Next** becomes
**Got it — start exploring** and dismisses the welcome (and writes the
seen flag).

### Wireframe

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   ┌──────────────────────────────────────────────────┐    │
│   │  ●○○○○                                       [✕] │    │
│   │                                                  │    │
│   │   Welcome from hirahul.xyz                       │    │
│   │                                                  │    │
│   │   ┌──────────────────────────────────────────┐  │    │
│   │   │                                          │  │    │
│   │   │              [ video poster ]            │  │    │
│   │   │                  ▶  18s                  │  │    │
│   │   │                                          │  │    │
│   │   └──────────────────────────────────────────┘  │    │
│   │                                                  │    │
│   │   AgentUX Catalogue is a shared reference        │    │
│   │   library for product UX work. Screenshots,      │    │
│   │   short videos, and saved links — all in one     │    │
│   │   place, captured by you and your team.          │    │
│   │                                                  │    │
│   │                              [ Skip ] [ Next → ] │    │
│   └──────────────────────────────────────────────────┘    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The `●○○○○` row is a step indicator. The `[✕]` and **Skip** both dismiss
and write the seen flag. **Next** advances; on the final card it becomes
the success CTA.

### User flow

1. Visitor lands on `/?from=portfolio`.
2. App mounts, reads detection signal, queries `localStorage`.
3. If both checks pass, after a short delay (~400ms — let the catalogue
   shell settle so the modal isn't jarring), the modal fades in.
4. User clicks Next/Back through cards. Optionally plays each video.
5. On finish/skip/close, modal fades out, flag is written.
6. Subsequent visits — even with `?from=portfolio` — don't re-show
   unless the visitor clears storage or we bump the version.

### Suggested card sequence

Five cards covers the surface area without dragging. Order matters —
lead with what the app is, then the most-used tab (Screens), then
ancillary tabs in descending importance.

| # | Card heading | Body theme | Video role |
|---|---|---|---|
| 1 | **Welcome from hirahul.xyz** | What this app is + who it's for. Frame as a tool _Rahul_ built and uses; honest, not corporate. | Optional 10–15s screen-recording showing the catalogue in motion (scrolling through screens). |
| 2 | **Screens — your visual library** | The grid is the heart of the app. Capture, group, compare flows. | 15–20s clip: drag-and-drop upload → screenshot appears → grouping. |
| 3 | **Videos — short reference clips** | For motion / interaction patterns that screenshots can't show. X (Twitter) posts get auto-embedded. | 10s clip: paste an X URL → embed appears. |
| 4 | **Links — save for later** | Now with og:image previews and host grouping. Telegram bot ingest. | 8s clip: paste link → og preview renders. |
| 5 | **Bookmarks & you** | Email-keyed bookmarks; no account creation needed for a first look. CTA to start exploring. | None — keep it as the close-out. |

Card 1 is the only auto-shown one if we want a "progressive disclosure"
variant: cards 2–5 only appear if user clicks **Show me how it works**
on card 1, otherwise card 1 acts as a single-card welcome. Lower
friction, lower information density. Recommended.

### Tech approach

| Concern | Approach |
|---|---|
| Component | New `<PortfolioWelcome />` component, mounted by `CatalogueApp.tsx`. ~120–180 LOC of TSX. |
| State | Local: `currentStep: number`, `dismissed: boolean`. No global state. |
| Content | Static array of card definitions in the component file (or a sibling `portfolio-welcome-cards.ts`). |
| Styling | New `portfolio-welcome.scss` matching the catalogue's dark surface gradient. ~150 LOC of SCSS. |
| Animation | Existing modal patterns (e.g. `BookmarkEmailModal`) for fade/scale-in. No new dep. |
| Video embed | `<video>` tag pointing at external URLs (Cloudflare Stream / Loom / YouTube embed). Lazy-load: only the current card's `<video>` is rendered. |
| Accessibility | Trap focus inside modal; `Esc` closes; arrow keys navigate; `aria-modal`. Existing modals in the repo already model this. |
| Telemetry (optional) | If you have analytics, fire `welcome_shown` / `welcome_step:N` / `welcome_dismissed` / `welcome_completed`. Useful for tuning copy. |

### Files to create / touch

- `designer/src/components/PortfolioWelcome.tsx` — new (~150 LOC)
- `designer/src/styles/portfolio-welcome.scss` — new (~150 LOC)
- `designer/src/CatalogueApp.tsx` — small change, mount the modal & detect param
- `designer/src/lib/portfolio-welcome.ts` — small helper for detection logic (~30 LOC) so it's unit-testable
- `designer/src/styles/designer.scss` (or root SCSS index) — `@use` the new scss file

### Video strategy

- **Host externally.** Five 5MB MP4s shipped in the bundle = ~25MB of payload. Bad. Use Cloudflare Stream (recommended — autoplay-friendly, fast CDN, custom poster), Loom (easiest), or a free-tier video CDN.
- **Keep clips ≤ 20 seconds.** Anything longer reads as a marketing pitch.
- **Mute by default.** Users hate surprise audio. Provide an unmute button.
- **Provide a poster/thumbnail.** First frame of the video is fine; otherwise a custom 16:9 image.
- **Don't auto-play.** Click to play. Auto-play makes the modal feel pushy.

### Effort

- ~half a day for a polished v1 if you already have the videos.
- ~a full day if you need to record/edit videos (the bigger time sink).
- Zero new npm dependencies.

### Pros

- **Forgiving.** The modal doesn't reference real DOM elements, so refactors and feature changes don't break it.
- **Self-contained.** Can be ripped out wholesale if it underperforms.
- **Linear narrative.** You control pacing; user can't get lost.
- **Easy to A/B test** copy or card order if you ever wire analytics.
- **Trivial fallback** when video CDN is down — card still reads fine without the video.

### Cons / risks

- **Passive.** User watches; doesn't interact with the real app yet. Some visitors prefer to poke around immediately.
- **Modal blindness.** If copy is generic, users hit Skip before reading. Quality of writing matters more than quantity of cards.
- **Video budget.** Five clips means five things to record and keep up to date. Stale videos look worse than no videos.

### When to pick this tier

- You want something shipped within a day or two.
- You're not sure yet if onboarding even moves the needle, and want a low-risk experiment.
- Your UI is still evolving — committing to DOM-anchored steps would be brittle.
- You want to iterate on copy/videos without touching app code.

### Upgrade path

Tier 1 is a strict subset of Tier 2 — the same card content can be re-anchored to real UI elements later. No sunk cost. If you start here and decide you want spotlights, the cards become the tooltip content.

---

## Tier 2 — Spotlight tour

Real product tour. The page dims, and the actual UI element being explained
is highlighted with a tooltip pointing at it.

### Concept

```
┌────────────────────────────────────────────────────────────┐
│  [≡] [↕] [⊞≡🖥] [🔍] [+]                                  │  ← only this is lit
│  ───────────────────────────                               │
│                                                            │
│   Tooltip arrow ▲                                          │
│   ┌──────────────────────────┐                             │
│   │  Screens (2/5)           │                             │
│   │  This is the main tab.   │                             │
│   │  Drag images here to     │                             │
│   │  upload.                 │                             │
│   │   [video 12s ▶]          │                             │
│   │  [Skip] [Back] [Next →]  │                             │
│   └──────────────────────────┘                             │
│                                                            │
│   ░░░ rest of UI dimmed at 70% black ░░░                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

A semi-transparent backdrop (`rgba(0,0,0,0.7)`) covers the page; a
"cutout" reveals the targeted element at full opacity; a tooltip is
positioned near the cutout. Advance with **Next** or by performing the
action ("click the Videos tab → ✓").

### User flow

1. Same detection / once-only gate as Tier 1.
2. First step starts as a centered intro card (no spotlight) —
   essentially Tier 1's card 1.
3. Cards 2–5 anchor to real elements: the Screens tab, the Videos tab, the
   Links tab, the upload button, etc. As user clicks **Next**, the
   spotlight moves and (optionally) the underlying tab actually
   switches, so by the end of the tour they've seen the app in motion.

### Tech approach

Two paths:

#### Path A — third-party library

| Library | Pros | Cons |
|---|---|---|
| `driver.js` (~5KB gzip, MIT) | Modern, Vanilla JS, simple API, good docs. | Doesn't natively support React, but trivial wrapper. |
| `shepherd.js` (~30KB gzip, MIT) | Most full-featured. Tippy.js-based positioning. | Heavier, slightly older API. |
| `react-joyride` (~25KB gzip, MIT) | Idiomatic React, declarative. | Less control over styling; updates have lagged. |

Recommendation if going library: **driver.js** for the small footprint and clean API. Wrap once in `usePortfolioTour` hook and call from `CatalogueApp.tsx`.

#### Path B — homegrown

A `<SpotlightTour steps={[...]} />` component that:

- Renders a fixed full-viewport overlay with a `clip-path` cutout
  computed from each step's target element's `getBoundingClientRect()`.
- Computes tooltip position via simple "above / below / left / right of
  rect, clamped to viewport."
- Listens to `resize` / `scroll` and re-computes.

~250–300 LOC including positioning logic. No deps. More control over
styling, animations, and behavior — easier to fit the existing dark
theme and to handle catalogue-specific edge cases (lightbox open,
filter sheet open, etc.).

### Files to create / touch

- `designer/src/components/SpotlightTour.tsx` — new (~250 LOC if homegrown)
- `designer/src/styles/spotlight-tour.scss` — new (~120 LOC)
- `designer/src/lib/portfolio-welcome.ts` — same detection helper as Tier 1
- `designer/src/CatalogueApp.tsx` — mount + step config
- Optional: `designer/src/hooks/use-spotlight-target.ts` — small hook that lets each tab register its DOM ref so the tour finds it without cross-component coupling.

### Pros

- **Active.** User sees the actual UI; spotlights teach by pointing.
- **Higher conversion.** Reportedly 2–3× completion rate vs. modal carousels (anecdata; you'd have to verify).
- **Memorable.** Stronger spatial recall — "the upload button is in the top right" sticks better when it just glowed at you.

### Cons / risks

- **Brittle.** Renames a tab or moves a button → tour breaks silently. You need a cross-component ref system or stable selectors.
- **Layout-sensitive.** Mobile vs desktop layouts may need different tour scripts. The catalogue already has responsive shifts (toolbar, sidebar) that complicate this.
- **State-sensitive.** What if the tour says "click here" but the user is mid-upload? Need to handle "tour paused / resumed" states or cancel the tour outright on conflicting interactions.
- **Higher effort.** ~2–3 days for polished v1, including handling edge cases.
- **Disorienting if poorly tuned.** Bad spotlights frustrate; e.g. tooltips that overlap target, or transitions that lag.

### When to pick this tier

- Your UI is stable; you don't expect to refactor the toolbar or tab layout in the next quarter.
- You've validated (via Tier 1 or analytics) that visitors do engage with onboarding and you want to push completion rate up.
- The portfolio is doing real volume — spotlights pay off when there's enough traffic that a 10% conversion lift matters.

### Upgrade path

From here, Tier 3 is a substantial leap (you'd basically rebuild the catalogue with seeded data). Most products stop at Tier 2.

---

## Tier 3 — Interactive playground route

Dedicated `/welcome` route with a sandboxed catalogue: pre-seeded fake
screenshots, videos, and links the user can poke at without affecting
the real shared library. Each step asks them to actually do something.

### Concept

```
┌────────────────────────────────────────────────────────────┐
│  AgentUX • Welcome (sandbox)              [exit demo →]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   Step 3 of 7 — Try uploading a screenshot                 │
│                                                            │
│   Drag any image here, or click to upload.                 │
│   It only lives in this demo, nothing gets saved.          │
│                                                            │
│   ┌────────────────────────────────────────────────┐      │
│   │            ⬆  drop an image here               │      │
│   └────────────────────────────────────────────────┘      │
│                                                            │
│   Status: waiting for upload...   [skip step]              │
│                                                            │
│   ─── seeded sample screenshots below ───                  │
│   ┌──────┐  ┌──────┐  ┌──────┐                             │
│   │ demo │  │ demo │  │ demo │                             │
│   └──────┘  └──────┘  └──────┘                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

A separate route with its own state. The user is interacting with the
real catalogue components, but pointed at an in-memory "demo dataset"
rather than the real Supabase tables.

### User flow

1. Detection routes the user to `/welcome` instead of `/`.
2. Welcome route renders catalogue components in "sandbox mode" —
   reads/writes go to an in-memory store, not Supabase.
3. Each step prompts an action; the next step unlocks when the action
   completes (e.g. "Upload an image" → next step is enabled when one
   image is added to the in-memory store).
4. At the end, an **Exit to the real app** CTA clears the seen flag,
   navigates to `/`, and they're now looking at the actual catalogue.

### Tech approach

This is non-trivial. You essentially need a "data provider" abstraction
the catalogue components don't currently have. Today, components reach
into `supabase` directly (e.g., `CatalogueLinksSection.tsx` calls
`supabase.from('catalogue_link_references')...`). To put them into
sandbox mode, you'd need to:

1. Extract data fetching/writing into hooks (`useLinks()`, `useScreens()`,
   etc.) or a context.
2. Provide alternate implementations that read/write an in-memory map.
3. Render the welcome route with the in-memory provider mounted.
4. Seed the in-memory map with curated demo data.

This is a multi-day refactor of the data layer, and the abstraction will
linger forever even if the welcome flow is later removed. That's a
significant architectural shift driven by an onboarding feature.

### Files to create / touch (rough)

- `designer/src/lib/data-provider/types.ts` — interfaces
- `designer/src/lib/data-provider/supabase.ts` — current behavior
- `designer/src/lib/data-provider/in-memory.ts` — sandbox impl
- `designer/src/lib/data-provider/index.tsx` — context/provider
- All `CatalogueXxx.tsx` files that currently call `supabase` directly — refactor to use the provider (~10 files, maybe more)
- New `designer/src/routes/Welcome.tsx` — the playground page
- New `designer/src/data/welcome-seed.ts` — seeded demo data

### Pros

- **Highest engagement.** User _does_ rather than watches.
- **Confidence boost.** Visitor finishes onboarding having actually used the app, lowering activation friction.
- **Reusable.** The data-provider abstraction is genuinely useful for testing and future "demo links" you might share elsewhere.

### Cons / risks

- **Refactor cost.** Several days minimum, plus ongoing maintenance of two data paths.
- **Drift.** Sandbox can diverge from production behavior (auth, rate limits, edge cases) — needs deliberate parity testing.
- **Overkill for portfolio traffic.** Unless visitors are pouring in, the ROI is poor.
- **Dual-mode complexity.** Every future feature has to consider sandbox-mode behavior or risk a bug class that only manifests in welcome.

### When to pick this tier

- Honest answer: probably never, for a portfolio onboarding use case. This pattern shines for SaaS landing pages where free trials drive revenue and a 5% activation lift is worth thousands of dollars. For a personal-portfolio funnel it's almost certainly over-engineered.
- Reconsider only if (a) volume is high, (b) Tier 1/2 underperform, and (c) the data-provider abstraction has independent value.

### Upgrade path

There's no Tier 4 you'd "graduate" to from here — Tier 3 is already the most ambitious in-app option. The next step would be off-app: marketing site, dedicated landing pages, video walkthroughs, etc.

---

## Tier 4 — Off-app explainer

Don't onboard inside the catalogue at all. Put the explainer on the
portfolio side.

### Concept

The portfolio's AgentUX card is a richer surface: a 60–90 second Loom
embedded directly on the portfolio, with a **Open the catalogue →**
button after the video. By the time the user lands on the catalogue,
they've already seen the explainer.

### Tech approach

Zero changes to the catalogue. All effort goes into:

- A 60–90s Loom or screen-record explainer.
- An `<iframe>` or `<video>` on the portfolio.
- Optionally, a second CTA below the video — "Open the catalogue."

### Pros

- **Zero catalogue code.** Nothing to maintain on this side.
- **Fastest to ship.** A weekend with a decent script.
- **Better SEO/social.** The video can be embedded on the portfolio's preview cards.

### Cons / risks

- **Discontinuous.** User watches a video, then lands on a "naked" app with no in-app context. Some friction is recreated.
- **Skippable.** Most visitors won't watch a 90s video before clicking through.
- **Less personal.** A video on the portfolio feels marketing-y; an in-app modal feels intentional.

### When to pick this tier

- You want the cheapest possible improvement and the catalogue is fine
  as-is for direct visitors anyway.
- The portfolio surface is the more valuable real estate (i.e. visitors
  spend longer on the portfolio than they would on the catalogue).
- As a complement to Tier 1: portfolio video for the "TL;DR before clicking,"
  catalogue modal for "now let me show you each part."

### Combinable with all other tiers

Tier 4 is not exclusive. You could ship Tier 4 immediately (cheap), and
ship Tier 1 in the catalogue independently. Doubles the cost of stale
content though — script changes need updates in two places.

---

## Comparison matrix

| Dimension | Tier 1 — Modal | Tier 2 — Spotlight | Tier 3 — Playground | Tier 4 — Off-app |
|---|---|---|---|---|
| Effort (1–5) | 2 | 3 | 5 | 1 |
| New deps | None | 0 or 1 (driver.js optional) | None | None |
| Lines changed | ~400 | ~700 | ~2000+ refactor | ~0 in catalogue |
| Catalogue code touched | Small (modal + mount) | Moderate (refs in tabs) | Pervasive (data layer) | None |
| User engagement | Low (passive) | Medium (active pointing) | High (active doing) | Very low (pre-arrival) |
| Robustness to refactor | High | Low | Medium | N/A |
| Maintenance ongoing | Low | Medium | High | Low (just video) |
| Mobile friendliness | Easy | Hard (positioning) | Hard (touch interactions) | Easy |
| Conversion impact (estimated) | Modest | Strong | Strongest | Variable |
| Risk of feeling pushy | Low | Medium | Low | Very low |
| Time to ship | Half day | 2–3 days | 1+ week | Weekend |

---

## Recommendation

**Tier 1 with optional video chunks per step + progressive disclosure
on card 1.**

Specifically:

- Detection via `?from=portfolio` (primary) and referrer (fallback).
- Card 1 is a single-card welcome by default (low friction).
- A subtle **Show me how it works →** button on card 1 reveals cards 2–5.
- Cards 2–5 each ~3 sentences + one short video.
- Videos hosted externally (Cloudflare Stream preferred).
- Once-only via `localStorage` with a versioned key.
- ~half a day to implement once content is ready; videos are the long pole.

Why this is the right starting point:

1. **Cheapest path that's still satisfying** for the visitor. They get a
   clear "what is this" without being trapped in a tour.
2. **Survives UI evolution.** No DOM-coupled steps that break when you
   refactor the toolbar or rename a tab.
3. **Easy to remove.** If it underperforms, ripping it out is a single PR.
4. **Strict upgrade subset of Tier 2.** If you later want spotlights, the
   card content carries over verbatim — sunk cost is zero.

Reasons to deviate from this:

- If you already have great videos that show the actual UI in motion,
  jumping to **Tier 2** can be worth it — you'd pair the videos with
  spotlights for the "see and be shown" combo. But only if your UI is
  stable.
- If you don't want to record videos at all, **Tier 1 without video**
  (plain text + maybe screenshots) is still a totally reasonable v1
  and you can add videos later when ready.
- If you want zero in-app code right now, **Tier 4 alone** is the
  shortest path to _any_ improvement.

---

## Open questions to resolve before implementation

1. **Where will videos be hosted?** Cloudflare Stream / Loom / YouTube /
   self-hosted? This drives the embed strategy and any auth/CDN setup.
2. **Which tabs / features get a card?** The 5-card sequence above is a
   guess. You may want to drop Bookmarks (it's auxiliary) or split
   Screens into capture vs grouping.
3. **Copy direction:** technical (engineer-to-engineer) or friendly
   (designer-to-designer)? Affects voice.
4. **Step indicator:** dots, numbers ("2 of 5"), or a thin progress bar?
   Pick one; consistent throughout.
5. **Animation budget:** static fade, or playful (cards slide in, video
   poster scales)? Lean static for first cut.
6. **Analytics:** do we want event tracking? If yes, what tool — none in
   the repo today, so this would be net-new.
7. **Mobile layout:** does the modal go fullscreen on small viewports
   (<480px) or stay as a centered card? Fullscreen is usually better for
   readable video on phones.
8. **Should the welcome ever re-show?** Currently "no, ever, until
   storage cleared." Could add an explicit "Replay onboarding" link in
   the existing settings menu later. Not for v1.
9. **Behavior when JavaScript is disabled / sessionStorage blocked:**
   detection silently fails closed (no welcome). Acceptable.

---

## Appendix — sample copy directions (Tier 1, card 1)

Three voices to pick from. **None are final.** Just to anchor a discussion
about tone.

### Voice A — direct, technical

> ## Welcome
>
> AgentUX Catalogue is a screenshot, video, and link library for product
> teams. Capture references, group flows, share with your team — all
> from one page, no app to install.
>
> Built by Rahul. Hit **Next** for a quick tour, or close this and start
> exploring.

### Voice B — conversational, personal

> ## Hey — glad you came over from the portfolio
>
> This is something I built for myself and my team: one place for all
> the UX references we keep losing track of. Screenshots, videos, links,
> bookmarks — the kind of stuff that usually ends up scattered across
> Slack DMs and Figma comments.
>
> Want a quick tour, or do you want to just poke around?

### Voice C — punchy, marketing-adjacent

> ## A reference library for UX work
>
> Capture. Group. Compare. Share. Stop losing track of the flows that
> matter.
>
> **Take a 60-second tour →**

Recommended: **Voice B** for portfolio visitors (they came for the
person, not the product); fallback to **Voice A** for direct visitors
if we ever generalize the welcome.
