# AgentUX

AgentUX is a UX flow workspace for AI-built apps.

It helps teams do two core things:

1. Install a **Dev Module** inside their app to detect routes and runtime navigation.
2. Use a browser-based **Flow Builder** to shape user journeys from screenshots and text.

![npm](https://img.shields.io/npm/v/@yamparala27/agentux)
![license](https://img.shields.io/npm/l/@yamparala27/agentux)

## Product Overview

### 1. AgentUX Dev Module (npm package)

Install `@yamparala27/agentux` in your React or Next.js app to:

- detect routes from code
- track runtime navigation while using the app
- visualize screen-to-screen flow with `<AppMap />`
- export flow context as structured markdown/json for AI handoff

### 2. AgentUX Flow Builder (web app)

Flow Builder lives in `designer/` and runs in the browser (`/designer`).

Key capabilities:

- project + flow workspace
- canvas with pan/zoom, relayout, and **undo**
- add flows from screenshots or text (`>` and `->` supported)
- publish text draft to canvas data from **Text Flow Studio**
- placeholder screenshot nodes for planning before uploads
- screenshot and flow comparison workflows
- periodic data refresh while preserving current viewport context

### 3. Catalogue (inside Flow Builder suite)

Catalogue lives at `/designer/catalogue` and shares the same backend data as Flow Builder.

Key capabilities:

- central screenshot library across projects
- flow-based filtering with desktop sidebar + mobile bottom sheet
- sticky toolbar for filters/actions
- search + sort (latest, oldest, A-Z)
- assign, regroup, rename, replace, and bulk operations

## Repository Structure

```text
.
├── src/            # AgentUX dev module + CLI (published package)
├── designer/       # Flow Builder + Catalogue React app (Vite)
├── site/           # Landing page and built static output
├── docs/           # PRD and implementation notes
└── tests/          # Package and designer tests
```

## Quick Start

### A) Use the Dev Module in your app

```bash
npm install @yamparala27/agentux -D
npx agentux init
npx agentux scan
```

`agentux init` attempts to mount `<AppMap />` automatically in common React/Next entry files.

Manual usage is also supported:

```tsx
import { AppMap } from '@yamparala27/agentux';

export default function App() {
  return (
    <>
      <YourApp />
      <AppMap />
    </>
  );
}
```

### B) Run Flow Builder locally

```bash
cd designer
npm install
npm run dev
```

Create `designer/.env` before using real project data:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Local URLs:

- Flow Builder: `http://localhost:5173/designer/`
- Catalogue: `http://localhost:5173/designer/catalogue`

### C) Build the deployable site bundle

From repo root:

```bash
npm run build:site
```

This builds `designer/` and outputs static assets into `site/`.

## CLI Reference

```bash
agentux init [project-path]
agentux scan [project-path] [--output public/agentux.json]
```

Examples:

```bash
agentux init
agentux scan
agentux scan ../my-app --output public/agentux.json
```

## Supported Frameworks (Dev Module)

- Next.js App Router
- Next.js Pages Router
- React Router

## Development

From repo root:

```bash
npm install
npm test
npm run build
```

For designer-only build check:

```bash
cd designer
npm run build
```

## Deployment Notes

- Vercel config is in `vercel.json`
- Build command: `npm run build:site`
- Output directory: `site`
- Rewrites map `/designer` and `/designer/catalogue` to their SPA entry files

## License

MIT
