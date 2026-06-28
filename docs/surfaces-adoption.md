# Surface elevation system — adoption

> **Status:** foundation + one pilot shipped on `claude/ios-shortcuts-bookmark-sync-6auzc6`. The rest below is **planned, not built**.

Adapting [Fluid Functionalism's "surfaces"](https://www.fluidfunctionalism.com/docs/surfaces)
to the catalogue: nested UI (panel → card → dropdown → dialog) should stay
visually distinct at any depth. Instead of every component inventing its own
`rgba(255,255,255,0.0x)` overlay, components pick an elevation *level* and read
background + shadow from shared tokens. The app is dark-only, so **lightness**
carries elevation (deeper = lighter), exactly as the source system does for
dark mode.

---

## Done

- **Token ladder** — [`designer/src/styles/surfaces.scss`](../designer/src/styles/surfaces.scss):
  `--surface-1..8` and `--shadow-surface-1..8`, anchored to the existing
  palette (`surface-0` = page `#0f0f10`, `surface-1` = panel `#18181b`), even
  ~+7 lightness step per level. Imported first in `catalogue-main.tsx`.
- **Pilot** — the Links / Tools section now reads from the ladder:

  | Element | Level |
  |---|---|
  | Page | `surface-0` |
  | Links panel (`.catalogue-links`) | `surface-1` |
  | Tab bar + link cards | `surface-2` |
  | Card hover | `surface-3` + `shadow-surface-2` |

### Token reference (current — hex)

| Level | Background | | Level | Background |
|---|---|---|---|---|
| `--surface-0` | `#0f0f10` (page) | | `--surface-5` | `#34343b` |
| `--surface-1` | `#18181b` (panel) | | `--surface-6` | `#3b3b43` |
| `--surface-2` | `#1f1f23` | | `--surface-7` | `#42424b` |
| `--surface-3` | `#26262b` | | `--surface-8` | `#494953` |
| `--surface-4` | `#2d2d33` | | | |

---

## To be done

### 1. Convert the ladder to OKLCH &nbsp;<sub>— next up</sub>

The values are hand-picked hex today. Re-express the ladder in `oklch()` so the
lightness steps are *perceptually* even (hex steps aren't), with a single fixed
hue/chroma for the cool-grey tint. Single-block edit in `surfaces.scss`; nothing
downstream changes (consumers only reference `var(--surface-N)`).

- Use the **oklch-skill** (installed locally) for conversion + gamut checks.
- Verify text-on-surface contrast stays AA at every level
  (`#fafafa` titles, `#a1a1aa` body) — see the skill's contrast helper.
- Keep `surface-0` and `surface-1` visually identical to today's
  `#0f0f10` / `#18181b` so the rest of the (un-migrated) app doesn't shift.

### 2. Roll out beyond the pilot

Replace ad-hoc `rgba(255,255,255,0.0x)` / hardcoded panel greys with `var(--surface-N)`
across the app, level by level. Candidate surfaces, roughly by nesting depth:

- [ ] Page / app shell → `surface-0`
- [ ] Top-level panels (sidebar, section containers, team/members panels) → `surface-1`
- [ ] Cards & list rows (videos cards, prototype cards, gallery tiles) → `surface-2`
- [ ] Modals / dialogs (settings, family details, iOS-upload, welcome) → `surface-3`
- [ ] Popovers / dropdowns / menus / tooltips opened from within modals → `surface-4`+
- [ ] Hover/active lifts → next level up, paired with `shadow-surface-N`

Do this incrementally, one surface family per change, eyeballing each before
the next — avoid a single sweeping unreviewed restyle.

### 3. (Optional) Auto-nesting context primitive

The source system's headline feature is that components read their substrate
from React context and lift *relative* to it (`SurfaceProvider` /
`useSurface()`, clamped 1–8), so a dropdown is always one step above whatever
opened it — no manual level bookkeeping. We deliberately started with the
**static token ladder** (the 80%). If manual level assignment proves fiddly as
rollout widens, port the context primitive:

- `SurfaceContext` (default `1`), `useSurface()`, a `<Surface level?>` wrapper
  that defaults to `parent + 1` and applies `surfaceClasses(level)`.
- SCSS, not Tailwind, so expose the levels as helper classes
  (`.surface-1 { background: var(--surface-1); }`) or keep using `var()` inline.

### 4. Housekeeping

- [ ] Migrate the remaining `var(--surface-2, <rgba fallback>)` call sites to drop
      the now-redundant fallback once the token is guaranteed present.
- [ ] Decide whether a light-mode ladder is ever needed (app is dark-only today —
      probably not, but the source defines one if the app gains theme switching).
