# Welcome modal — multi-script fonts recipe

**Status:** Shipped 2026-05-17. Five scripts wired into the GREETINGS rotation
in `WelcomeModal.tsx`. This doc remains as a recipe for adding further scripts
(e.g. Tamil, Bengali) in the future.

The welcome modal (`designer/src/components/WelcomeModal.tsx`) rotates through
five handwritten greetings sharing the Sanskrit root **svāgata**:

- **English** — "Welcome" in Caveat *(bundled with `tegaki`)*
- **Kannada** — "ಸ್ವಾಗತ" in Baloo Tamma 2 *(local bundle under `designer/src/assets/tegaki-fonts/`)*
- **Malayalam** — "സ്വാഗതം" in Baloo Chettan 2 *(local bundle)*
- **Telugu** — "స్వాగతం" in Mandali *(local bundle)*
- **Hindi** — "स्वागत" in Tillana *(bundled with `tegaki`)*

Adding a new script means generating a Tegaki bundle and dropping it in
`designer/src/assets/tegaki-fonts/<font-name>/`. **Use the CLI workflow below**
— the web generator at <https://gkurt.com/tegaki/generator/> currently has a
broken Google-Fonts search and an unreliable upload path.

## Recipe for adding a new script (CLI workflow)

The `tegaki-generator` package is in the Tegaki monorepo (private, not on npm).
Run it directly from a clone — it needs **bun** (`brew install oven-sh/bun/bun`).

```bash
# One-time setup
cd /tmp
git clone --depth 1 https://github.com/KurtGokhan/tegaki.git tegaki-src
cd tegaki-src
bun install                                # installs monorepo workspace deps
```

Then for each new script (substitute Google-Fonts family name + glyph subset):

```bash
cd /tmp/tegaki-src/packages/generator
bun --conditions=tegaki@dev src/cli/index.ts generate \
  "Mandali" --chars "స్వాగతం" -o /tmp/tegaki-out/mandali
```

The CLI:
- Downloads the font from Google Fonts (cached in `~/.cache/...`)
- Extracts glyph outlines via `opentype.js`
- Computes stroke skeletons (Zhang-Suen) and runs HarfBuzz shaping
- Writes `bundle.ts`, `glyphData.json`, **`glyphDataById.json`** (essential
  for Indic conjuncts), the subsetted TTF, and the full fallback TTF

Copy the output folder into the project:
```bash
cp -r /tmp/tegaki-out/mandali designer/src/assets/tegaki-fonts/
```

## Known CLI gotcha: family name comes out as "Unknown"

When the CLI downloads via the Google Fonts subset endpoint, the font's `name`
table is stripped — so `bundle.ts` lands with `family: 'Unknown Tegaki <hash>'`
and `fullFamily: 'Unknown'`. All three local bundles would then declare the
same `'Unknown'` family in `@font-face`, which collides across bundles.

**Fix** — patch the family name in the generated `bundle.ts` (also touches the
`fontFaceCSS` template literal):

```bash
sed -i '' "s/'Unknown Tegaki/'Mandali Tegaki/g; s/'Unknown'/'Mandali'/g" \
  designer/src/assets/tegaki-fonts/mandali/bundle.ts
```

Match the family name to your script. Project-internal CamelCase (`BalooTamma2`,
`BalooChettan2`, `Mandali`) is fine — it just needs to be unique per bundle.

## Wiring into the rotation

```ts
// designer/src/components/WelcomeModal.tsx
import balooTamma2 from '../assets/tegaki-fonts/baloo-tamma-2/bundle';
// ...
const GREETINGS: Greeting[] = [
  // ...
  { text: 'ಸ್ವಾಗತ', font: asBundle(balooTamma2), lang: 'kn' },
];
```

The path includes `/bundle` because the directory's entry point is `bundle.ts`,
not `index.ts`. `asBundle()` widens the generator's `as const` shape to satisfy
the `TegakiBundle` type.

## Smoke test

```js
// In DevTools console at /designer/ after logging in:
sessionStorage.setItem('agentux:welcome-pending', '1');
location.reload();
```

Confirm each greeting draws with **conjuncts joined** (e.g. Kannada "ಸ್ವ" as a
single fused glyph, not three loose codepoints). If a script renders as loose
codepoints, the bundle is missing `glyphDataById.json` — re-run the CLI and
make sure the output dir has it.

## Vite dev-server config

`designer/vite.config.ts` needs both:
- `optimizeDeps.exclude: ['tegaki']` — so Vite doesn't pre-bundle Tegaki (its
  `with { type: 'url' }` font imports are not handled by esbuild's pre-bundler
  and the TTFs 404 at runtime).
- `optimizeDeps.include: ['harfbuzzjs/hb.js', 'harfbuzzjs/hbjs.js']` — so Vite
  *does* pre-bundle `harfbuzzjs` (plain CJS) to ESM, otherwise tegaki's shaper
  crashes with `hbMod.default is not a function`.

## Notes

- Mandali (Telugu) is a true handwriting font — looks the most "alive".
- Baloo Tamma 2 / Baloo Chettan 2 are rounded/friendly — Tegaki's per-stroke
  animation supplies the handwritten feel.
- All non-Latin greetings need the harfbuzz shaper. `WelcomeModal.tsx` already
  registers it globally via `ensureShaperRegistered()` — no extra wiring per
  language.
- The full (non-subset) TTFs in each bundle are ~200–600 KB. Browsers only
  fetch them if the rendered text contains a glyph not in the subset, so for
  the welcome modal's fixed words they sit idle. Leaving them in keeps the
  bundle structure consistent with Tegaki's own pre-built bundles.
