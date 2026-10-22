# Stage 0 — Foundation

## Starting point (inspected before changes)

- Repository: `Tunm11/Quarters-`, branch `main`, tracking `origin/main`.
- Working tree was clean with a single commit: "Initialize README with project
  details".
- One tracked file: `README.md`. No `package.json`, lockfile, framework,
  source directory, tests, or CI configuration existed.
- Toolchain available: Node.js 22.23.2, Bun 1.4.2, npm 10.9.8, pnpm, yarn.
- Freebuff reported no preview configuration at all (`installCommand`,
  `previewCommand`, `previewPort`, and `buildCommand` were all `null`), which is
  why no dev command was set. The commands are now configured (see below).

## Decisions

1. **React + Vite + TypeScript SPA.** Vite is the toolchain this environment
   supports, React Router gives explicit routes, and a static SPA can be built
   and served without a custom server.
2. **Tailwind CSS 4 with CSS-first tokens.** Tokens are defined once in
   `src/styles/index.css` inside `@theme`, so they generate real utilities and
   stay themeable without a JS config file.
3. **No backend, no auth, no data layer.** No Convex, no Supabase client, no
   mock API, no fake auth, and no seeded listings. `git` history and source
   contain no secrets.
4. **Self-hosted Poppins.** `@fontsource/poppins` (latin subset, weights
   400–700) ships with the build, so the typeface does not depend on a CDN.
   The font stack falls back to system sans-serif.
5. **Honest UI.** Every empty state says listings are not loaded. Nothing is
   presented as live inventory, and no sample listing data exists.

## Implemented

### Design tokens (`src/styles/index.css`)

Charcoal surface scale (`canvas` → `panel-hover`), soft-white/muted/subtle text,
hairline borders, restrained purple accent, muted feedback colours, rounded
surface radii, and two depth shadows. Base layer sets the dark colour scheme,
typography, selection colour, scrollbars, global `:focus-visible` rings, and
reduced-motion handling. Utilities: `bg-grid`, `bg-glow`, `mask-fade-b`,
`.skip-link`.

### UI foundations (`src/components/ui`)

- `Button` — primary/secondary/ghost/soft, three sizes, visible label, optional
  leading/trailing icon, loading state with `aria-busy`. `buttonClasses()` lets
  router links look like buttons without copying classes.
- `IconButton` — icon-only control with a **required** accessible `label`.
- `Input` — labelled field (visually hidden label supported), optional icon and
  description wired through `aria-describedby`.
- `Panel` — rounded surface in default/raised/accent tones.
- `Badge` — neutral/accent/outline/positive metadata labels.
- `Skeleton` — decorative loading placeholder.

### Feedback states (`src/components/feedback`)

- `LoadingState` — `role="status"`, `aria-live="polite"`, page and inline
  variants. Used as the route chunk fallback.
- `EmptyState` — icon, title, description, actions, and an optional honest note.
  Used by Explore and the 404 route.
- `ErrorState` — `role="alert"` with optional dev-only detail and actions. Used
  by the router error boundary.

### Layout and routing (`src/components/layout`, `src/App.tsx`)

- App shell with skip link, sticky header, footer, mobile bottom tab bar
  (icon + visible label per tab, safe-area padding), and `ScrollRestoration`.
- Routes: `/`, `/explore`, `/how-it-works`, and `*`. Explore and How-it-works
  are lazy-loaded inside a shared Suspense boundary.
- Route-level `errorElement` renders `RouteError` with a reload action and,
  in development only, the underlying message.

### Screens (`src/pages`)

- **Landing** — hero with honest Stage 0 badge, CTAs into Explore and the
  flow, a clearly labelled interface preview built from skeletons, planned
  cities (marked as not live), capability panels, three-step flow, and an
  explicit "real today / not built yet" status split.
- **Explore** — search field, city and room-type filter chips with
  `aria-pressed`, reset controls, and an empty state that distinguishes "no
  filters" from "filters applied to an empty result set".
- **How it works** — intended student flow, what this stage includes, and what
  is deferred, with a note that no mock backend or simulated auth exists.
- **Not found** — 404 screen with routes back into the app.

### Tooling

`package.json` scripts: `dev`, `build`, `preview`, `typecheck`. Vite binds to
`0.0.0.0`, reads `PORT`, uses `strictPort`, and sets `hmr: false` for the
preview proxy. TypeScript is split into `tsconfig.app.json` (browser code) and
`tsconfig.node.json` (Vite config), referenced by `tsconfig.json` so
`tsc -b --noEmit` works.

## Commands executed during Stage 0

| Command | Result |
| --- | --- |
| `git status --short --branch`, `git log`, `git branch -a` | Clean tree on `main`, one commit, no other local branches |
| `bun add react react-dom react-router-dom lucide-react @fontsource/poppins` | Installed (React 19.3.1, Router 7.18.4, lucide 1.61.0, fontsource 5.3.0) |
| `bun add -d vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite` | Installed (Vite 8.3.5, TypeScript 7.0.2, Tailwind 4.3.3) |
| `bun tsc -b --noEmit` | First run failed: TypeScript 7 removed `baseUrl`. Removed it and re-ran — exits 0. |
| `bun run build` | Succeeds: typecheck + `vite build`, output in `dist/` |
| `bun tsc -b --noEmit` (after font subset change) | Exits 0 |

## Verification performed

| Check | Result |
| --- | --- |
| `bun tsc -b --noEmit` (final run) | Exit 0, no diagnostics |
| `bun run build` (final run) | Exit 0; CSS contains the custom tokens, `bg-grid`, `mask-fade-b`, and safe-area padding utilities |
| HTTP requests to the dev server: `/`, `/explore`, `/how-it-works`, an unknown path, `/src/main.tsx`, all page modules, `styles/index.css` | All 200; unknown paths correctly served by the SPA shell |
| Render smoke check (temporary script: Vite `ssrLoadModule` + `react-dom/server`; deleted after use) | Landing, Explore, How-it-works, and Not-found all rendered real markup with expected content |
| `freebuff-preview start` / `status` | Preview ready and listening on port 5173, HTTP status 200 |

No automated test suite is committed; none was claimed. Visual review in a
browser (screenshots) was not performed in this environment — the pages were
verified through markup rendering and HTTP responses instead.

## Limits of this stage

- No Supabase project, schema, migrations, or client — by design.
- No accounts, sessions, listings, roommate matching, messaging, or payments.
- No automated tests or CI pipeline.
- Filters and search are UI state only; nothing is filtered because no data
  source is connected.
- Poppins is restricted to the Latin subset. Nigerian-language glyph coverage
  beyond that is a font/typography decision for a later stage.

## Preview configuration (saved)

```bash
freebuff-preview set-install "bun install"
freebuff-preview set "bun run dev" 5173
freebuff-preview set-build "vite build"
```

`bun run dev` binds to `0.0.0.0` and honours `PORT` when Freebuff injects it.
`vite build` produces the static `dist/` output and exits; it does not start a
server.

## Next stage (not started)

Supabase foundation: project configuration through environment variables,
schema and access-rule design, a typed client, real session handling, and
replacing the Explore empty state with actual listings. No mock fallbacks.
