# AgentUX

An agent-agnostic visual feedback tool. Map all screens of your app, correct flows, and copy structured output that helps AI coding agents find the exact code you're referring to.

![npm](https://img.shields.io/npm/v/@yamparala27/agentux)
![license](https://img.shields.io/npm/l/@yamparala27/agentux)

## Installation

```bash
npm install @yamparala27/agentux -D
npx agentux init
npx agentux scan
```

`agentux init` finds your app root and mounts `<AppMap />` automatically in one of these files:

- `app/layout.*` for Next.js App Router
- `pages/_app.*` for Next.js Pages Router
- `src/App.*` or `src/main.*` for standard React apps

If you prefer, you can still wire it in manually:

## Usage

Add the `<AppMap />` component to your application. A floating button appears in the bottom-right corner. Click it to open an interactive map of your entire app.

```tsx
import { AppMap } from '@yamparala27/agentux';

function App() {
  return (
    <>
      <YourApp />
      <AppMap />
    </>
  );
}
```

When you click the floating button, AgentUX now starts with a `Run AgentUX` panel:

- `Load agentux.json` loads the project structure from `public/agentux.json`
- `Restart runtime capture` refreshes the runtime flow map
- `Refresh all` reloads both the structure scan and runtime state

The default view is the UX flow map, and the `Structure` view groups main screens and nested sub-screens by route path.

## Features

- **Route Auto-Detection** — Automatically scans your file structure to discover every screen. Supports Next.js App Router (`app/`), Next.js Pages Router (`pages/`), and React Router v6 (`createBrowserRouter`).

- **Navigation Flow Mapping** — Detects `<Link>`, `<NavLink>`, `useNavigate()`, and `router.push()` calls across your codebase to map how screens connect to each other.

- **Runtime Tracking** — Tracks live navigation events as you use your app. Discovers routes and flows that static analysis alone might miss.

- **Interactive Canvas** — Drag-and-drop node graph powered by React Flow. Rearrange screens, zoom, pan, and auto-layout to get the view you need.

- **Structured Export** — One-click copy to clipboard. Generates Markdown with screen names, route paths, component file paths, and navigation flows — optimized for AI coding agents.

- **Static Analysis** — Parses your source files using Babel AST to find route definitions and navigation links. No guessing, no regex — accurate detection across TypeScript and JSX.

- **Zero Config** — Drop `<AppMap />` into your app and it works. No config files, no build plugins, no setup scripts.

## How It Works

Instead of telling an AI agent "fix the button on the settings page", AgentUX gives the agent a complete map of your app — every screen, every route path, every component file, and how they connect.

The agent gets structured output like:

```markdown
## Screens
### Dashboard
- **Path**: `/dashboard`
- **Component**: `app/dashboard/page.tsx`

### User Detail
- **Path**: `/users/:id`
- **Component**: `app/users/[id]/page.tsx`

## Navigation Flows
- Home → Dashboard (`<Link>` in `app/page.tsx:7`)
- Dashboard → Users (`useNavigate` in `app/dashboard/page.tsx:12`)
- Users → User Detail (`<Link>` in `app/users/page.tsx:9`)
```

This lets the agent search your codebase for the exact file and line number, rather than guessing which component you mean.

## Static Analysis (Recommended)

For a complete map without needing to visit every page, run static analysis first:

```ts
import { analyzeProject } from '@yamparala27/agentux/analysis';
import { writeFileSync } from 'fs';

const data = await analyzeProject('./');
writeFileSync('agentux.json', JSON.stringify(data, null, 2));
```

Or use the CLI, which writes `public/agentux.json` for you:

```bash
npx agentux scan
```

Then pass the result to the component:

```tsx
import { AppMap } from '@yamparala27/agentux';
import mapData from '../agentux.json';

function App() {
  return (
    <>
      <YourApp />
      <AppMap data={mapData} />
    </>
  );
}
```

## Configuration

```tsx
<AppMap
  data={mapData}                // Pre-computed data from static analysis
  position="bottom-right"       // Floating button position
  runtimeDetection={true}       // Track live navigation events
  devOnly={true}                // Hide in production (default: true)
/>
```

## Supported Frameworks

| Framework | Route Detection | Link Detection |
|---|---|---|
| Next.js App Router | `app/` directory scanning | `<Link href>` |
| Next.js Pages Router | `pages/` directory scanning | `<Link href>` |
| React Router v6 | `createBrowserRouter` config | `<Link to>`, `useNavigate` |

## Requirements

- React 18 or newer
- Desktop browsers (development tool)

## Development

```bash
npm install
npm test          # Run tests
npm run build     # Build package
npm run dev       # Watch mode
```

## Local Install In Another Project

To use AgentUX locally without publishing it to npm, package a tarball and install it via a `file:` link:

```bash
npm run pack:local
```

That command builds the package, creates a `.tgz`, and prints an installable local link like:

```bash
npm install file:/absolute/path/to/yamparala27-agentux-0.1.0.tgz
npx agentux init
```

You can also paste the same `file:` link into another project's `package.json`:

```json
{
  "devDependencies": {
    "@yamparala27/agentux": "file:/absolute/path/to/yamparala27-agentux-0.1.0.tgz"
  }
}
```

This is the safest local workflow for a React component package because it avoids the duplicate-React issues that can happen with `npm link`.

## License

MIT
