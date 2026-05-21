// Releases feed for the in-app What's New panel. Newest first.
//
// Authoring convention — when a PR ships a user-facing change,
// prepend (or append to the latest unreleased) entry here as part
// of the same PR. Two rules for bullets:
//
//   1. Lead with the benefit, not the mechanism. The reader is a
//      user opening the panel, not an engineer reading the diff.
//      "Save screens faster with B in the lightbox" — yes.
//      "Wired B key to the save handler" — no.
//
//   2. Keep it short. One line, no trailing period. The panel is
//      480px wide and bullets sit next to a dot marker.
//
// Images are optional. Add one only when it meaningfully shows the
// feature (a GIF of the new animation, a screenshot of the new
// page). Skip the image for keyboard-shortcut / copy-only / fix
// releases — the panel collapses cleanly without one.

// Kind drives a coloured badge in front of each bullet. Pick the
// one that best fits how the user will read the change:
//   'new'      — net-new capability / surface / shortcut
//   'improved' — existing feature got faster, clearer, or richer
//   'fix'      — a bug or papercut that's now gone
export type WhatsNewBulletKind = 'new' | 'improved' | 'fix';

export interface WhatsNewBullet {
  kind: WhatsNewBulletKind;
  text: string;
}

export interface WhatsNewRelease {
  id: string;
  date: string; // human-readable, e.g. "May 20, 2026"
  title: string;
  // Optional image / GIF banner. Relative to /designer/. Omit when
  // the release is text-only — the panel renders without a banner.
  imageUrl?: string;
  bullets: WhatsNewBullet[];
}

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    id: '2026-05-20-saved-and-videos',
    date: 'May 20, 2026',
    title: 'Saved animation, Copy morph & Videos overhaul',
    bullets: [
      { kind: 'improved', text: 'Bookmarks is now "Saved" — and you\'ll see screens fly into the Saved tab when you stash them' },
      { kind: 'improved', text: 'Copying a share link gives you a clear green checkmark instead of a silent click' },
      { kind: 'improved', text: 'Videos load instantly: see who posted and read the excerpt before deciding to load the full embed' },
      { kind: 'new', text: 'Speed through the lightbox with single keys — E edit · D delete · C crop · B save · A annotate' },
      { kind: 'new', text: 'Jump anywhere in the app with C / V / L / I / S, or hit U to start a quick upload' },
    ],
  },
  {
    id: '2026-05-19-keyboard-first-lightbox',
    date: 'May 19, 2026',
    title: 'Keyboard-first lightbox + group filter fixes',
    bullets: [
      { kind: 'new', text: 'Fine-tune crops with arrow keys — hold Shift for bigger jumps' },
      { kind: 'new', text: 'Pick search results without touching the mouse: arrow through and hit Enter' },
      { kind: 'fix', text: 'Your catalogue no longer comes up empty after login — group filters now ignore casing' },
      { kind: 'new', text: 'Share links you paste in Slack or X show a proper preview card' },
    ],
  },
  {
    id: '2026-05-16-group-detail-pages',
    date: 'May 16 – 19, 2026',
    title: 'Group detail pages, login backdrop & toolbar refinements',
    bullets: [
      { kind: 'new', text: 'Every group has its own page at /g/<key> — a tight grid of every screen, sized for your viewport' },
      { kind: 'new', text: 'Click a group icon on the login screen to land straight in that group after sign-in' },
      { kind: 'new', text: 'Browse flows from a chip strip below the toolbar — quicker than opening the dropdown' },
      { kind: 'improved', text: 'Groups without a category land in "Other" instead of muddying "Untagged"' },
    ],
  },
  {
    id: '2026-05-15-roles',
    date: 'May 15, 2026',
    title: 'Role system, Marketing Bucket & capability-aware UI',
    bullets: [
      { kind: 'new', text: 'Roles replace the admin / non-admin split — every member gets exactly the capabilities they need' },
      { kind: 'improved', text: 'Mint a passcode for a teammate and pick their role in the same step' },
      { kind: 'new', text: 'Marketing uploads now flow into a "Marketing Bucket" group, ready for an admin to promote' },
    ],
  },
];
