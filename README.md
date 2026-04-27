# AgentUX Catalogue

**Screenshots. Videos. Links.**

Your team's single source of truth for product screenshots, competitive video references, and saved links — organized by brand, searchable, and accessible from anywhere including Telegram.

## What's in this repo

| Path | Purpose |
| --- | --- |
| `designer/` | Catalogue React app (Vite + React 19 + Supabase). Served at `/designer/`. |
| `site/` | Landing page and built static output deployed to Vercel. |
| `supabase/` | Edge functions (Telegram bot) and SQL migrations. |
| `docs/` | Plans and setup guides (infinite scroll, Telegram bot setup, etc.). |

> Flow Builder, Dev Module, Feature Log, Compare View, Archive, and Figma capture tooling were moved to [AgentUX-other](https://github.com/yamparalarahul27/AgentUX-other) on Apr 27, 2026 as part of the Catalogue-only repo split.

## Quick Start

```bash
cd designer
npm install
npm run dev
```

Create `designer/.env` for real data:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Local URL: `http://localhost:5173/designer/`

## Build

From repo root:

```bash
npm run build:site
```

Builds `designer/` and emits static assets into `site/designer/`.

## Deployment

- Vercel config: [`vercel.json`](vercel.json)
- Build command: `npm run build:site`
- Output directory: `site`
- Rewrites map `/designer` to the Catalogue SPA entry

## Telegram Bot

Edge function lives at [`supabase/functions/telegram-bot`](supabase/functions/telegram-bot). Setup notes: [`docs/telegram-bot-setup.md`](docs/telegram-bot-setup.md).

## License

MIT
