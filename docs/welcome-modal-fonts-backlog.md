# Welcome modal — South Indian fonts backlog

The welcome modal (`designer/src/components/WelcomeModal.tsx`) currently
rotates between two handwritten greetings:

- **English** — "Welcome" in Caveat *(bundled with `tegaki`)*
- **Hindi** — "स्वागत" in Tillana *(bundled with `tegaki`)*

The intended rotation also covers Kannada, Malayalam, and Telugu, sharing
the Sanskrit root **svāgata**. None of the three South Indian scripts have
bundled Tegaki fonts, so each needs a one-time bundle generated via the
Tegaki web tool.

## Next-session steps

1. Visit the Tegaki font generator: <https://gkurt.com/tegaki/generator/>
2. For each row in the table below: pick the font, paste the glyph subset
   into the generator, download the bundle.

   | Language  | Word     | Font (Google Fonts) | Glyph subset (paste into generator) |
   |-----------|----------|---------------------|--------------------------------------|
   | Kannada   | ಸ್ವಾಗತ    | Baloo Tamma 2       | `ಸ್ವಾಗತ`                              |
   | Malayalam | സ്വാഗതം  | Baloo Chettan 2     | `സ്വാഗതം`                            |
   | Telugu    | స్వాగతం  | Mandali             | `స్వాగతం`                             |

   *Subsetting to the word's own glyphs (~5–8 chars including the implicit
   virama / vowel signs) keeps each bundle tiny.*

3. Create `designer/src/assets/tegaki-fonts/` and drop the three generated
   bundles in there (one folder per font, mirroring `node_modules/tegaki/fonts/<name>/`).

4. In `WelcomeModal.tsx`, replace the TODO comment + extend `GREETINGS`:

   ```ts
   import balooTamma2   from '../assets/tegaki-fonts/baloo-tamma-2';
   import balooChettan2 from '../assets/tegaki-fonts/baloo-chettan-2';
   import mandali       from '../assets/tegaki-fonts/mandali';

   const GREETINGS: Greeting[] = [
     { text: 'Welcome', font: caveat,        lang: 'en' },
     { text: 'ಸ್ವಾಗತ',   font: balooTamma2,   lang: 'kn' },
     { text: 'സ്വാഗതം', font: balooChettan2, lang: 'ml' },
     { text: 'స్వాగతం', font: mandali,       lang: 'te' },
     { text: 'स्वागत',   font: tillana,       lang: 'hi' },
   ];
   ```

5. Smoke-test locally: trigger a fresh first-login (clear `last_login_at`
   for your row in `user_passcodes`, or test with a freshly-minted passcode)
   and watch all five words cycle without flicker.

## Notes

- **Mandali (Telugu)** is a true handwriting font on Google Fonts — it
  should look the most "alive" of the three.
- **Baloo Tamma 2 / Baloo Chettan 2** are rounded/friendly (not strictly
  handwriting); Tegaki's per-stroke animation supplies the handwritten feel.
- **Indic conjuncts** (e.g. Kannada "ಸ್ವ") need the harfbuzz shaper.
  `WelcomeModal.tsx` already registers it globally via `ensureShaperRegistered()`
  — no extra wiring needed when you add the three new entries.
- If Vite chokes on the generated bundle import, try the generator's "ES
  module" output option, or place bundles under `public/` and load them as URLs.
