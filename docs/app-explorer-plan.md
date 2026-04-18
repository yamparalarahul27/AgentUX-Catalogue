# App Explorer — Implementation Plan

> Revive Flow Builder as an automated App Explorer that captures screens, records
> tap actions, and generates interactive navigation maps for both mobile
> (React Native) and web (Next.js) apps.

**Inspiration**: [RevylAI/app-explorer](https://github.com/RevylAI/app-explorer)
— AI-driven BFS exploration of mobile apps with React Flow visualization.

---

## Context

### What we have today

| Component | Status | What it does |
|---|---|---|
| **Dev Mode** (`src/`) | Active | Detects routes (Next.js/React Router), tracks runtime transitions via history API patches, renders React Flow graph with Dagre layout |
| **Flow Builder** (`designer/`) | Archived | Manual drag-and-drop canvas with `@xyflow/react`, Dagre auto-layout, screenshot thumbnail nodes, labeled connection edges, undo stack |
| **Catalogue** | Active | Screenshot library with 4 views, Feature Log, Telegram bot, Videos section, archive compare |
| **Bulk Capture** (`scripts/`) | Active | Playwright-based screenshot runner at 3 breakpoints — captures states but does NOT record transitions |
| **Navigation Tracker** (`src/runtime/navigation-tracker.ts`) | Active | Patches `pushState`/`replaceState`/`popstate`, records `{from, to, timestamp}` events, deduplicates edges |

### What Revyl does that we don't

1. **AI-driven BFS exploration** — Claude Code systematically taps every interactive element
2. **Element cataloging** — records button/tab/link/input per screen with `explored` flag
3. **Transition recording with actions** — "tap 'Sign In button'" not just "from → to"
4. **Skeleton extraction** — pre-identifies screens from binary analysis before exploration
5. **Journey path highlighting** — DFS-enumerate up to 20 paths, dim non-matching nodes
6. **Interactive viewer** — graph + screenshots + journey walkthrough in one UI

### What we have that Revyl doesn't

1. **Supabase persistence** — screens, connections, flows all in a real database
2. **Web route detection** — automatic framework-aware parser (Next.js App/Pages, React Router)
3. **Runtime transition tracking** — zero-config history API patching
4. **Catalogue integration** — screenshots already organized by group/family/platform
5. **Team features** — multi-user, analytics, Telegram bot, comments

---

## Architecture

### Data Model

Extend the existing `screenshots` + `connections` tables. Add new tables for
exploration sessions and element tracking.

```sql
-- Exploration session (one per app explore run)
create table public.explore_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,                          -- e.g. "Crkpo Exchange - Android"
  platform text not null,                      -- 'mobile_android' | 'mobile_ios' | 'web'
  app_identifier text,                         -- package name, bundle ID, or base URL
  status text not null default 'running',      -- 'running' | 'paused' | 'completed'
  agent text not null default 'claude',        -- 'claude' | 'codex' | 'manual'
  config jsonb not null default '{}',          -- max_screens, viewport, timeouts
  screen_count int not null default 0,
  transition_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Explored screen (extends screenshot concept with element catalog)
create table public.explore_screens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references explore_sessions(id) on delete cascade,
  screenshot_id uuid references screenshots(id),  -- link to Catalogue
  screen_key text not null,                        -- kebab-case stable ID
  title text not null,
  elements jsonb not null default '[]',            -- [{label, element_type, explored, leads_to}]
  notes text,
  depth int not null default 0,                    -- BFS depth from start screen
  created_at timestamptz not null default now(),
  unique(session_id, screen_key)
);

-- Transition with action description
create table public.explore_transitions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references explore_sessions(id) on delete cascade,
  from_screen_key text not null,
  to_screen_key text not null,
  action text not null,                            -- "tap 'Trade' tab", "navigate /dashboard"
  action_type text not null default 'tap',         -- 'tap' | 'navigate' | 'swipe' | 'back' | 'deeplink'
  element_label text,                              -- which element was interacted with
  timestamp_ms bigint,
  created_at timestamptz not null default now()
);

create index explore_screens_session_idx on explore_screens(session_id);
create index explore_transitions_session_idx on explore_transitions(session_id);
```

### How it maps to existing tables

```
explore_sessions  ←→  flows           (1 session = 1 auto-generated flow)
explore_screens   ←→  screenshots     (each explored screen links to a Catalogue screenshot)
explore_transitions ←→ connections    (each transition = a connection with action metadata)
```

The `screenshot_id` FK on `explore_screens` bridges into the Catalogue — every
explored screen is also a regular screenshot you can view in Grid/Gallery/Folder
modes, annotate, version, and link to Feature Log entries.

---

## Three Exploration Modes

### Mode 1: Web Explorer (Next.js / any web app)

**How it works:**
1. User provides a base URL (e.g. `https://staging.crkpo.exchange`)
2. Playwright launches a persistent browser session (reuses `bulk_webapp_capture_template.cjs` pattern)
3. **Claude Code / Codex drives the exploration** via BFS:
   - Screenshots current page
   - Identifies clickable elements (links, buttons, tabs, inputs)
   - Clicks each element one at a time
   - Waits for navigation or DOM change
   - Screenshots the result
   - Records the transition with action label
   - Navigates back, confirms return
   - Repeats until all elements explored or `max_screens` reached
4. Each screenshot is uploaded to Supabase storage → inserted into `screenshots` table → linked via `explore_screens`
5. Session produces a complete `screen-map.json` for the viewer

**Key advantage over current bulk capture**: Records *transitions and actions*,
not just isolated screenshots. The output is a navigable graph, not a flat gallery.

**Auth handling**:
- `PAUSE_FOR_LOGIN=1` mode — opens browser, waits for manual login, then auto-explores
- Or pass session cookies / auth token via env vars

**Agent prompt (CLAUDE.md section)**:
```markdown
## Web Exploration Protocol

You are exploring a web application using Playwright.

1. Screenshot the current page
2. Run `app-explorer screen add` with a kebab-case screen_key
3. Identify all interactive elements (a, button, [role=button], input, [onclick])
4. For each unexplored element:
   a. Click it
   b. Wait 1.5s for navigation
   c. Screenshot the result
   d. If new screen: register it, record transition
   e. If same screen (modal/dropdown): note in elements, dismiss
   f. Navigate back, confirm return
5. Run `app-explorer screen list --unexplored` — continue until empty
6. Cap at 30 screens; ask user before continuing further
```

### Mode 2: Mobile Explorer (React Native / native apps)

**How it works:**
1. User provides APK (Android) or IPA (iOS)
2. Device interaction via one of:
   - **Android**: `adb` commands (tap, swipe, screenshot, back)
   - **iOS**: `xcrun simctl` for simulator, or Appium for real devices
   - **React Native**: Expo Dev Tools or direct Metro bundler inspection
3. **Claude Code drives BFS exploration** — same pattern as web but with device commands:
   - `adb shell screencap` → pull screenshot
   - `adb shell input tap x y` → tap element
   - `adb shell input keyevent BACK` → navigate back
4. Element detection via:
   - **View hierarchy dump**: `adb shell uiautomator dump` (Android), accessibility tree (iOS)
   - **AI vision**: Claude analyzes screenshot to identify tappable elements (fallback)
5. Screenshots uploaded to Supabase → same `explore_screens` + `explore_transitions` flow

**React Native specific**:
- Hermes bundle extraction (from Revyl's approach) can pre-identify screen components
- React Navigation structure can be read via dev tools bridge
- `__DEV__` mode gives access to component tree inspection

**Agent prompt (CLAUDE.md section)**:
```markdown
## Mobile Exploration Protocol

You are exploring a mobile app via ADB (Android) or simctl (iOS).

1. Capture screenshot: `adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png`
2. Dump view hierarchy: `adb shell uiautomator dump && adb pull /sdcard/window_dump.xml`
3. Parse XML to identify clickable elements (clickable="true", class contains Button/Tab/etc)
4. Register screen with `app-explorer screen add`
5. For each unexplored element:
   a. Tap at element center coordinates: `adb shell input tap {cx} {cy}`
   b. Wait 2s for animation/transition
   c. Screenshot + compare against known screens
   d. If new: register, record transition with action "tap '{element_text}'"
   e. Press back: `adb shell input keyevent BACK`
   f. Verify return to expected screen
6. Cap at 30 screens; ask user before continuing
```

### Mode 3: Hybrid / Dev Mode Enhanced

For apps where you have source code access (your own project):

1. **Dev Mode detects routes** statically from source code
2. **Navigation Tracker records transitions** at runtime as you manually navigate
3. **Playwright bulk-captures** screenshots at each detected route
4. **App Explorer stitches it together**: routes become screens, transitions become edges with action labels, screenshots from Catalogue attach to each screen
5. Result: auto-generated flow with zero AI exploration needed

This mode is free (no Claude API cost) and works well for web apps where you
control the codebase.

---

## Viewer (Revive Flow Builder UI)

Replace the manual Flow Builder canvas with a **read-only exploration viewer**
that renders like Revyl's interactive report.

### Reuse from existing Flow Builder

| Component | Path | Reuse |
|---|---|---|
| React Flow canvas | `designer/src/components/Canvas.tsx` | Core shell — strip manual editing, keep zoom/pan |
| Screenshot nodes | `designer/src/components/ScreenshotNode.tsx` | Keep thumbnail rendering, remove drag/rename |
| Connection edges | `designer/src/components/ConnectionEdge.tsx` | Keep color-coded edges, add action labels |
| Dagre layout | `designer/src/lib/canvas-graph.ts` | Keep TB layout, add BFS tree-edge detection |
| Supabase integration | `designer/src/lib/supabase.ts` | Reuse as-is |

### New components to build (inspired by Revyl)

| Component | What it does |
|---|---|
| **ExploreViewer** | Main page replacing Flow Builder — loads `explore_sessions` data, renders graph |
| **ScreenNode** (v2) | Screenshot thumbnail + screen title + element count badge + explored % indicator |
| **ActionEdge** | Edge with action label ("tap 'Trade'"), color-coded by type (tap=purple, navigate=blue, back=gray, swipe=orange) |
| **JourneyPanel** | Side panel listing discovered user journeys (DFS path enumeration, max 20) |
| **JourneyNavigator** | Step-through walkthrough — click next/prev to follow a path, map centers on each screen |
| **ScreenDetailPanel** | Click a node → shows full screenshot, element list with explored/unexplored status, transitions in/out |
| **CoverageBar** | Top bar showing explored % (screens found / elements explored) |
| **SessionPicker** | Dropdown to switch between explore sessions (e.g. "Crkpo Android" vs "Crkpo Web") |

### Graph rendering approach (from Revyl's AtlasGraph.tsx)

```
1. Load explore_screens + explore_transitions for session
2. BFS from start screen to classify tree-edges vs back-edges
3. Feed only tree-edges to Dagre for clean hierarchical layout
4. Render back-edges as dashed lines (cycle indicators)
5. Journey highlighting:
   - DFS enumerate up to 20 simple paths from start → leaf screens
   - Selected journey dims non-matching nodes to opacity 0.1
   - Highlighted edges get thicker stroke + glow
6. Node click → ScreenDetailPanel slides in from right
7. Dark mode by default (matches Catalogue theme)
```

### Edge styling by action type

```
tap       → solid purple (#9D61FF), smooth step
navigate  → solid blue (#3B82F6), bezier curve
back      → dashed gray (#6B7280), straight line
swipe     → solid orange (#F59E0B), smooth step
deeplink  → dotted green (#10B981), bezier curve
```

---

## CLI Commands

New `app-explorer` CLI (TypeScript, runs in the designer context).
Mirrors Revyl's interface so Claude Code / Codex agents can drive it.

```bash
# Session management
app-explorer init --name "Crkpo Exchange" --platform mobile_android
app-explorer status
app-explorer pause
app-explorer resume
app-explorer reset --yes

# Screen registration
app-explorer screen add --key "home" --title "Home Screen" --screenshot ./screen.png
app-explorer screen list [--unexplored] [--json]
app-explorer screen update --key "home" --add-element '{"label":"Trade","element_type":"tab"}'
app-explorer screen mark-explored --key "home" --element "Trade"

# Transition recording
app-explorer transition add --from "home" --to "trade" --action "tap 'Trade' tab" --type tap
app-explorer transition list [--json]

# Report generation
app-explorer report                    # Generate screen-map.json for viewer
app-explorer report --markdown         # Generate markdown summary
app-explorer export --format json      # Full export for AI agent consumption

# Web exploration launcher
app-explorer explore-web --url https://staging.crkpo.exchange --max-screens 30
app-explorer explore-web --url https://staging.crkpo.exchange --pause-for-login

# Mobile exploration launcher
app-explorer explore-mobile --apk ./app.apk --max-screens 30
app-explorer explore-mobile --device emulator-5554 --max-screens 30
```

All commands write to Supabase (explore_sessions / explore_screens /
explore_transitions) and simultaneously to a local `workspace/` directory
for offline use and agent inspection.

---

## Implementation Phases

### Phase 1 — Data model + CLI + Web Explorer (2-3 weeks)

**Goal**: Explore a web app (your Crkpo Exchange Next.js app) and get an
auto-generated flow graph.

1. **Database migration** — create `explore_sessions`, `explore_screens`,
   `explore_transitions` tables
2. **CLI scaffold** — TypeScript CLI with `init`, `screen add/list/update`,
   `transition add/list`, `report` commands
3. **Web exploration script** — extend `bulk_webapp_capture_template.cjs`:
   - Add element detection (query `a, button, [role=button], input[type=submit]`)
   - Add click-and-record loop
   - Upload screenshots to Supabase on capture
   - Write transitions to DB
4. **CLAUDE.md exploration protocol** — agent instructions for Claude Code to
   drive the BFS using the CLI
5. **Basic viewer** — Load `explore_sessions` in the designer, render with
   existing React Flow + Dagre, action labels on edges

**Deliverable**: Run `app-explorer explore-web --url <url>` with Claude Code,
get an interactive flow map in the designer.

### Phase 2 — Mobile Explorer (2-3 weeks)

**Goal**: Explore the Crkpo Exchange React Native app via ADB/simulator.

1. **ADB integration** — screenshot, tap, back, view hierarchy dump commands
   wrapped as CLI helpers
2. **iOS simulator support** — `xcrun simctl` equivalents
3. **Element detection from view hierarchy** — parse `uiautomator dump` XML,
   extract clickable elements with bounds → center coordinates
4. **AI vision fallback** — when hierarchy dump misses elements, send screenshot
   to Claude for visual element identification
5. **CLAUDE.md mobile protocol** — agent instructions for mobile BFS
6. **React Native skeleton** (optional) — extract screen names from Hermes
   bundle or React Navigation config

**Deliverable**: Run `app-explorer explore-mobile --apk <path>` with Claude Code,
get the same interactive flow map.

### Phase 3 — Viewer Polish + Journeys (1-2 weeks)

**Goal**: Match Revyl's viewer quality. Journey paths, coverage tracking,
step-through navigation.

1. **BFS tree-edge detection** — clean Dagre layout without cycle distortion
2. **Journey enumeration** — DFS path discovery (max 20 paths)
3. **JourneyPanel + JourneyNavigator** — side panel with path list, step-through
   with map centering
4. **ScreenDetailPanel** — full screenshot, element list, transition list on node click
5. **CoverageBar** — explored % indicator
6. **Action-typed edge styling** — color-coded by tap/navigate/back/swipe/deeplink
7. **Dark/light mode** — respect existing Catalogue theme tokens

### Phase 4 — Integration + Polish (1 week)

**Goal**: Wire App Explorer into the existing product.

1. **Catalogue integration** — explored screenshots appear in Grid/Gallery/Folder views
   with an "Explored" badge
2. **Feature Log linking** — link explored screens as evidence for features
3. **Landing page** — replace archived Flow Builder with App Explorer product card
4. **Session comparison** — compare two sessions side by side (e.g. before/after a release)
5. **Telegram notification** — bot posts "Exploration complete: 28 screens, 47 transitions"
   when a session finishes

---

## Project Structure

```
designer/
  src/
    components/
      ExploreViewer.tsx          # Main viewer (replaces Canvas.tsx for explore mode)
      ExploreScreenNode.tsx      # Screenshot node with element count badge
      ExploreActionEdge.tsx      # Edge with action label
      ExploreJourneyPanel.tsx    # Journey list + step-through
      ExploreScreenDetail.tsx    # Screen detail side panel
      ExploreCoverageBar.tsx     # Explored % indicator
      ExploreSessionPicker.tsx   # Session switcher dropdown
    lib/
      explore-graph.ts           # BFS tree-edge detection + Dagre layout
      explore-journeys.ts        # DFS path enumeration (max 20)
    hooks/
      use-explore-session.ts     # Load session data from Supabase
  sql/
    explore-tables.sql           # Migration for new tables

scripts/
  app-explorer.ts                # CLI entry point
  explore-web.ts                 # Playwright-based web exploration
  explore-mobile.ts              # ADB/simctl-based mobile exploration

supabase/
  migrations/
    20260418_explore_tables.sql  # Production migration
```

---

## Example: Crkpo Exchange

```
Project: Crkpo Exchange
├── Session: "Web - Staging" (Next.js)
│   ├── 24 screens discovered
│   ├── 38 transitions recorded
│   ├── Journeys:
│   │   ├── Home → Trade → Order Book → Place Order → Confirmation
│   │   ├── Home → Wallet → Deposit → QR Code
│   │   └── Home → Account → KYC → Document Upload → Pending
│   └── Coverage: 92% elements explored
│
├── Session: "Android - v2.1.0" (React Native)
│   ├── 31 screens discovered
│   ├── 52 transitions recorded
│   ├── Journeys:
│   │   ├── Splash → Login → Home → Trade → ...
│   │   ├── Home → Portfolio → Asset Detail → Withdraw
│   │   └── Home → Settings → Security → 2FA Setup
│   └── Coverage: 87% elements explored
│
└── Catalogue: All 55 unique screenshots organized by group
    ├── Group "Auth" (6 screens)
    ├── Group "Trading" (12 screens)
    ├── Group "Wallet" (8 screens)
    └── ...
```

---

## Open Questions

1. **Device provisioning for mobile** — Use local emulators, real devices via USB,
   or a cloud service? Local emulators are simplest for Phase 2; cloud can come later.

2. **AI cost control** — Each exploration run uses Claude API calls (one per
   element tap). A 30-screen app with ~10 elements per screen = ~300 API calls.
   Should we add budget caps or approval checkpoints?

3. **Auth-gated flows** — Some screens require login. Web has `PAUSE_FOR_LOGIN`.
   Mobile needs equivalent (manual login in emulator, then agent resumes).

4. **Duplicate screen detection** — Revyl says "same layout, different content =
   same screen." Do we use visual similarity (perceptual hash), screen_key naming,
   or AI judgment?

5. **Codex vs Claude Code** — Both can drive exploration. Codex is better for
   long-running autonomous tasks; Claude Code for interactive sessions.
   Support both as `agent` field on `explore_sessions`.
