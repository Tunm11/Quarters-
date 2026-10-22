# QUARTERS 2.0

A mobile-first student accommodation and roommate discovery platform, initially
focused on Nigeria.

## Project principles

- Build a mobile-first, accessible interface.
- Use Supabase for authentication, database, storage, and backend functionality.
- Keep application code, schema, and access rules version-controlled.
- Enforce authorization and data access rules on the server.
- Clearly distinguish sample data from real listings and user activity.
- Never report a successful operation unless it actually succeeds.

## Status

**Stage 0 — Foundation (current).**

This repository now contains a runnable frontend shell only:

- Landing page, Explore shell, How-it-works page, and a real 404 route.
- Dark design-token system, self-hosted Poppins, reusable UI primitives.
- Loading, empty, and error state foundations.
- **No** Supabase connection, database tables, authentication, mock API, or
  sample listings.

See [`docs/stage-0.md`](docs/stage-0.md) for the full scope record and
conventions for later stages.

## Stack

The repository was inspected first: it contained only a `README.md` on `main`,
so the foundation was established from scratch with the toolchain this
environment supports.

| Concern          | Choice                                                    |
| ---------------- | --------------------------------------------------------- |
| Framework        | React 19 + Vite 8 (TypeScript, SPA)                       |
| Language         | TypeScript 7                                              |
| Styling          | Tailwind CSS 4 (CSS-first `@theme` tokens)                |
| Routing          | React Router 7 (`createBrowserRouter`)                    |
| Icons            | `lucide-react`                                            |
| Typography       | Poppins, self-hosted via `@fontsource/poppins` (latin)    |
| Package manager  | Bun (`bun.lock`)                                          |
| Backend          | None yet — Supabase arrives in a dedicated later stage    |

The font is bundled locally, so the UI still renders with the intended
typeface when Google Fonts is unreachable. The font stack falls back to system
sans-serif if the webfont fails.

## Requirements

- Node.js 22+ (the container runs Node 22)
- Bun 1.4+ for installs and scripts

## Run the app

```bash
bun install
bun run dev
```

The dev server binds to `0.0.0.0` on `PORT` when the environment provides one,
otherwise `5173`. HMR is intentionally disabled so the app behaves well behind
Freebuff's preview proxy.

### Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `bun run dev`       | Start the Vite dev server on `0.0.0.0`                |
| `bun run build`     | Typecheck (`tsc -b`) then build static output to `dist/` |
| `bun run preview`   | Serve the production build locally                    |
| `bun run typecheck` | TypeScript build check only (`tsc -b --noEmit`)       |

### Freebuff preview

The managed preview is configured with:

- Install: `bun install`
- Dev / preview: `bun run dev` on port `5173`
- Build: `vite build` (static output in `dist/`)

## Project structure

```text
index.html                 App document (viewport, theme colour, favicon)
public/favicon.svg         Four-quarter brand mark
src/
  main.tsx                 Entry: fonts, global styles, React root
  App.tsx                  Router, lazy routes, error boundary
  pages/                   Landing, Explore, How-it-works, Not found
  components/
    layout/                App shell, header, footer, mobile tab bar, error
    ui/                    Button, icon button, input, panel, badge, skeleton
    feedback/              Loading, empty, and error states
  lib/                     Navigation config, `cn` helper
  styles/index.css         Design tokens, base styles, utilities
docs/stage-0.md            Stage 0 scope record
```

## Design tokens

Tokens live in `src/styles/index.css` under Tailwind's `@theme` block and are
consumed as normal utilities:

- Surfaces: `bg-canvas`, `bg-canvas-soft`, `bg-panel`, `bg-panel-raised`
- Text: `text-foreground`, `text-muted`, `text-subtle`
- Borders: `border-line`, `border-line-strong`
- Accent: `bg-accent`, `text-accent-soft`, `text-accent-ink`
- Feedback: `text-positive`, `text-caution`, `text-danger`
- Radii: `rounded-tile`, `rounded-card`, `rounded-sheet`, `rounded-pill`

Components should use these tokens instead of hard-coded colour values.

## Routing

| Path            | Screen                                         |
| --------------- | ---------------------------------------------- |
| `/`             | Landing / product shell                        |
| `/explore`      | Explore shell with search, filters, empty state |
| `/how-it-works` | Intended flow and stage scope                  |
| `*`             | Not-found page                                 |

Secondary routes are code-split with `React.lazy`; the shell renders a loading
state while they download, and a route-level error boundary handles failures.

## Accessibility foundations

- Skip-to-content link and a single `<main>` landmark.
- Visible `:focus-visible` outlines on all interactive elements.
- Icon-only controls require an accessible `label`; icon+text actions keep a
  visible text label (e.g. "Explore rooms", "Request a viewing").
- Filter chips expose `aria-pressed`; the mobile tab bar relies on
  `aria-current` from `NavLink`.
- Loading states announce via `role="status"`; errors use `role="alert"`.
- Reduced-motion preferences are respected globally.

## Environment and secrets

Stage 0 needs **no environment variables** and reads none. No secret and no
backend client exist in this build. Supabase keys will be introduced only in
the Supabase foundation stage and must never be committed to source.
