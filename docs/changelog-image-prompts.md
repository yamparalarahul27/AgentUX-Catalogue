# Changelog illustration prompts

Image-gen prompts for the `imageUrl` figure on each changelog release
(`designer/public/whats-new.json` → rendered by `ChangelogPage.tsx`).

The look is **minimal, clean, dark + frosted-glass** — tuned for Grok, which
reads plain natural-language descriptions better than long keyword stacks.
Earlier drafts came out too flashy; the rules below kill the glow, particles,
and neon that caused that.

## How to use

1. Take the **house style** block.
2. Swap `{CENTERPIECE}` for the one-line centerpiece under the release you want.
3. (Optional) paste the **negative prompt** if your agent supports one.

One physical idea per image. No text, no words, no real UI — always abstract.

### House style (the fixed part)

```
A minimal, clean illustration on a near-black background. {CENTERPIECE}.
Calm, even lighting with lots of empty dark space around it. Matte frosted
glass, not glossy. No glow, no particles, no neon. Muted monochrome with one
faint cool-blue tint. Quiet and elegant. 3:2 aspect ratio.
```

### Negative prompt

```
text, words, letters, numbers, watermark, logo, busy, cluttered, noisy,
neon overload, rainbow, garish colors, photorealistic people, clip-art,
flat vector, harsh shadows, skeuomorphic gloss, low contrast mush
```

---

<details open>
<summary><strong>June 2026</strong></summary>

- **Customize your toolbar** — `a frosted-glass toolbar strip where a few control chips lift away and one chip pins itself into place`
- **Prototype cards: live preview + share** — `a frosted-glass card holding a small abstract page layout, a tiny share mark in its corner`
- **Share HTML prototypes** — `a single frosted-glass card holding a simple abstract web-page layout of a few soft blocks, a thin link mark resting beside it`
- **Videos tag filter — scrollable strip** — `a single horizontal row of small frosted-glass tag pills sliding sideways, the pills at both ends softly fading into the dark`
- **Saved Links — flat card grid** — `an even, uniform grid of slim frosted-glass cards in calm rows, each with one tiny host-dot`
- **Share saved videos with a link** — `a frosted-glass video tile with a soft play triangle, a thin quiet line arcing from it to a small copied-link mark`
- **Saved Links — new card-grid layout** — `two columns of frosted-glass cards side by side, each holding small stacked tiles in tidy rows`
- **Buttons pop when you press them** — `a single frosted-glass pill button pressed slightly inward, one faint soft ring marking the tap`
- **Branded loading screen for shared prototypes** — `a centered frosted-glass disc with three small dots in a row, a calm loading moment`
- **Polished tooltips across the whole app** — `a small frosted-glass icon with a slim tooltip bubble resting beside it`
- **Smoother tooltips on catalogue cards** — `a frosted-glass card with a row of tiny action icons, one showing a small tooltip bubble beside it`
- **Favicon follows your browser theme** — `two overlapping frosted-glass browser-tab shapes, one dark and one light, meeting along a soft seam`
- **Mobile polish** — `a tall frosted-glass phone outline with its content sitting neatly clear of the bottom edge`
- **Labeling Studio: cleaner lightbox** — `a clean frosted-glass lightbox panel showing a single calm image with no clutter of icons`
- **Offline indicator polish** — `a small frosted-glass status pill resting just above a row of dock dots, clearly separated`
- **Crop works offline now** — `a frosted-glass image card with a crop frame, a small sync arrow curving away to mark a pending upload`
- **Edit offline — changes sync when you reconnect** — `a frosted-glass status pill with a circular arrow, a small stack of cards queued behind it`
- **Offline indicator + auto-refresh on reconnect** — `a small frosted-glass pill floating at the bottom of dark space, marking a connection state`
- **Open the app, see your catalogue instantly** — `a frosted-glass grid of cards appearing instantly, fully formed, with no loading bars`
- **Videos: YouTube tab + Quick Upload tightening** — `a frosted-glass card with a soft play triangle, sitting beneath a small tab marker`

</details>

<details>
<summary><strong>May 2026</strong></summary>

- **New sounds: click feedback + welcome chime** — `a single frosted-glass speaker shape with two faint concentric arcs, very subtle`
- **Videos: search across saved X posts** — `a frosted-glass search bar above a row of small tag pills, one pill softly highlighted`
- **Refreshed favicon + home-screen icons** — `a single frosted-glass app-icon tile centered in dark space, crisp and clean`
- **Lightbox: resize handles + UI-E tab** — `a frosted-glass image with a rectangular selection frame, small grips at its corners and edges`
- **Elements browse + detail: Cropped view** — `a frosted-glass card toggling between a full image and a tightly cropped region of it`
- **AI labelling suggests element locations** — `a frosted-glass screenshot with a dashed rectangular outline marking a suggested region`
- **Labelling Studio — three fixes** — `a clean frosted-glass grid of cards in tidy paginated rows`
- **Labelling Studio — lightbox opens on every card** — `a single frosted-glass card opening into a larger centered image`
- **Cards join the splash fall-in + crisper empty-state** — `frosted-glass cards gently settling into a grid from above with a soft tilt`
- **Catalogue lands with a flourish** — `a frosted-glass header bar, chip strip and first cards descending into place from above`
- **Refresh toast — quieter rework** — `a frosted-glass toast card with one slim, quiet ring around its edge`
- **New AgentUX brandmark + mobile polish** — `a single frosted-glass brand-mark tile centered in dark space`
- **Browse the catalogue by element** — `a frosted-glass grid where each tile shows a small, different abstract element`
- **Sound effects & haptic feedback** — `a frosted-glass phone shape with two faint soft arcs beside it, suggesting a gentle buzz`
- **Lightbox edit — group dropdown shows brand icons** — `a frosted-glass dropdown list where each row carries a small brand-dot beside the name`
- **Crop — dashed guide lines** — `a frosted-glass image with a crop frame drawn in dashed lines and round solid grips`
- **Icon buttons feel alive** — `a single frosted-glass icon button lifting slightly in a calm hover state`
- **Videos — X and Family Values split into tabs** — `a frosted-glass panel split by two tab markers at the top, one active`
- **Videos — preview locks background scroll** — `a frosted-glass phone with a centered preview panel, the background held still behind it`
- **Advance Search — entity-aware chips** — `a frosted-glass search bar holding a few small structured chips inside it`
- **Search → click → lightbox in one click** — `a small frosted-glass result row opening directly into a larger centered image`
- **Changelog has a home** — `a vertical frosted-glass timeline of stacked entry cards`
- **Lightbox — cleaner layout** — `a clean frosted-glass lightbox with a title strip atop a slim side panel`
- **Lightbox — squircle corners** — `a frosted-glass button row with smooth, continuous squircle corners`
- **Coverage score** — `a frosted-glass card with two slim horizontal progress bars at different fill levels`
- **Crop — easier to confirm on mobile** — `a frosted-glass phone with a crop frame and two big sticky buttons at the bottom`
- **Mobile lightbox — swipe to navigate** — `a frosted-glass image mid-swipe, a second image sliding in from the side`
- **Search — clearer, clearable, Enter goes where expected** — `a frosted-glass search bar with a clean result list and one highlighted match`
- **Quieter app — idle Canvas + smoother sign-in** — `a calm frosted-glass canvas perfectly at rest in dark space`
- **Canvas view — new chrome layout** — `a frosted-glass canvas with a small exit pill at the top-left and a centered mark`
- **Mobile lightbox sits flush with the browser bar** — `a frosted-glass phone where the bottom panel sits flush against the browser bar`
- **New loading indicator — Echo Ring** — `a set of concentric diamond ripples in frosted glass, a quiet loading pulse`
- **Mobile viewport fits properly** — `a frosted-glass phone where the panel fits perfectly inside the visible screen`
- **Lightbox right-side polish** — `a frosted-glass action card with clean rounded edges matching the card above it`
- **Canvas view — infinite pannable Gallery** — `an expansive frosted-glass field of small image tiles extending in every direction`
- **Typing key feedback while you edit** — `a single frosted-glass key cap shown at the bottom of dark space, lightly pressed`
- **Lightbox quality of life** — `a frosted-glass image with generous, calm space above and below it`
- **Quick Upload paste affordance** — `a frosted-glass drop zone with a small paste link beneath it`
- **Paste from clipboard + UI Element tagging** — `a frosted-glass drop zone with a small paste pill beside it`
- **Mobile header, PWA install & filter chip strip** — `a frosted-glass phone header collapsed to compact marks, a chip row below it`
- **What's New panel + App-update toast** — `a frosted-glass star mark with a small panel of stacked notes beside it`
- **Saved animation, Copy morph & Videos overhaul** — `a frosted-glass card sliding into a saved tab with a soft, minimal motion trail`
- **Keyboard-first lightbox + group filter fixes** — `a frosted-glass image with a small key cap beside it, faint arrow marks`
- **Group detail pages** — `a frosted-glass page tile showing a tight grid of small screens`
- **Role system & capability-aware UI** — `a frosted-glass key shape paired with a small set of capability dots`
- **Auth Gate, RLS Hardening & Telegram Bot Security** — `a frosted-glass shield centered in dark space, calm and solid`
- **Categorised Search Modal** — `a frosted-glass spotlight-style search panel with categorised result rows`
- **Trash, Groups Taxonomy & Carousel Share View** — `a frosted-glass bin shape with a small restore arrow curving back out of it`
- **Identity pill, Logout, Drag-Drop Upload & Progress Ribbon** — `a frosted-glass identity pill with a small dropdown panel below it`
- **Labelling Studio, Comments Polish & Lightbox Focus** — `a frosted-glass panel of structured metadata fields in tidy sections`
- **Edit-Icon Modal, Four-Side Crop & Sticky Quick Upload** — `a frosted-glass image with a crop frame adjustable on all four sides`
- **Group Rename, Live Chip Strip, Lucide Icons & Toolbar Polish** — `a frosted-glass row of group chips refreshing in place`

</details>

<details>
<summary><strong>April 2026</strong></summary>

- **Group Chip Strip, Folder Upload & Toolbar Polish** — `a frosted-glass strip of group chips floating above a toolbar`
- **Area Annotations, Annotation Filter & Bulk Flow** — `a frosted-glass screenshot with a single drawn rectangular region marked on it`
- **Lightbox & Quick Upload Polish** — `a frosted-glass image with faint arrow marks stepping to the next card`
- **Catalogue Goes Solo — Repo Split & Cleanup** — `a single clean frosted-glass tile standing alone, simplified, in dark space`
- **ThumbHash Image Placeholders** — `a frosted-glass card resolving from a soft blur into a sharp image`
- **Telegram Bot, X Video Links & Feature Log** — `a frosted-glass paper-plane mark sending a small image card toward a grid`
- **Feature Log Lifecycle, Global Scope & Navigation** — `a frosted-glass board of cards arranged in three tidy columns`
- **Folder View, Group Appearance & Gallery Workflow** — `a frosted-glass folder card with a small carousel of preview tiles`
- **Compare Mode, Team Flows & CD Page** — `two frosted-glass image panels side by side for comparison`
- **Videos Tab, AgentUX Branding & CD Page** — `a frosted-glass card with a soft play triangle, a fresh section tile`
- **Mobile UX Overhaul & Filter Sheet** — `a frosted-glass phone with a bottom sheet sliding up from the base`
- **Catalogue Core Features** — `a frosted-glass grid of cards with a small sort control above it`
- **Flow Builder Canvas Enhancements** — `a frosted-glass canvas with a few connected nodes linked by thin lines`

</details>

<details>
<summary><strong>March 2026</strong></summary>

- **Designer Flow Builder** — `a frosted-glass canvas with draggable, connected nodes`
- **Landing Page & MVP Definition** — `a single clean frosted-glass landing-page tile centered in dark space`
- **Project Launch** — `a frosted-glass map of connected route nodes, an app map`

</details>
