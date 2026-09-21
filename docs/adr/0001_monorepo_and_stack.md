# ADR 0001: Monorepo and stack

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Cofre is one product that has to ship as four different things: a page on GitHub
Pages with no server, a Docker Compose stack, a cloud deployment and a desktop
installer. All four run the same screens and the same business rules. A single
developer maintains it, on Windows, over a long period, and the repository doubles as
a portfolio piece, so readability by a stranger matters as much as speed.

Forces at play:

1. One set of business rules, four runtimes. Duplication would kill the project.
2. The browser build cannot depend on Node APIs. The server build cannot depend on
   the DOM. The boundary has to be enforced by the package layout, not by discipline.
3. Test suites need to run the same code against different storage engines.
4. Windows is the development machine, so native compilation steps are a real cost.

## Decision

A pnpm workspace with Turborepo, TypeScript in strict mode, and this stack:

| layer | choice |
| --- | --- |
| package manager | pnpm via corepack, workspaces |
| task runner | Turborepo, with cache |
| language | TypeScript strict, `verbatimModuleSyntax`, no implicit any |
| web | React with Vite, TanStack Router, TanStack Query, TanStack Table |
| styling | Tailwind driven by our own tokens, Radix UI primitives underneath |
| charts | Apache ECharts |
| server | Hono, Zod for validation, Better Auth for identity |
| data | Drizzle ORM, SQLite and PostgreSQL |
| desktop | Tauri 2 |
| tests | Vitest, `fast-check` for property tests, Playwright for flows |
| lint and format | Biome |
| CI | GitHub Actions |

## Options considered

### Option A: pnpm workspace with Turborepo

| dimension | assessment |
| --- | --- |
| complexity | medium |
| cost | free |
| scalability | good up to dozens of packages |
| familiarity | high, it is the common shape of a modern TypeScript monorepo |

Pros: strict dependency boundaries, disk efficient thanks to the pnpm store, task
cache that keeps CI fast, and a layout that any TypeScript developer recognises.
Cons: pnpm on Windows needs corepack enabled, and Turborepo adds one more
configuration file to understand.

### Option B: one application with folders

| dimension | assessment |
| --- | --- |
| complexity | low at the start, high later |
| cost | free |
| scalability | poor |
| familiarity | high |

Pros: nothing to configure, fastest start.
Cons: nothing stops a screen from importing a Node module, nothing stops business
rules from importing React, and the desktop and browser builds end up carrying server
code. The boundary that this product depends on would exist only in comments.

### Option C: Nx

| dimension | assessment |
| --- | --- |
| complexity | high |
| cost | free, with a paid cloud cache |
| scalability | very good |
| familiarity | medium |

Pros: powerful generators, dependency graph tooling, good task orchestration.
Cons: heavier conceptual load and more opinionated than this project needs. For a
repository meant to be read by strangers, the extra machinery gets in the way.

## Tradeoffs

The interesting choices inside option A:

1. **React over Svelte or Solid.** Svelte would produce a smaller bundle, which
   matters for a page on GitHub Pages. React wins anyway because TanStack Router,
   Query and Table plus Radix primitives cover routing, server state, data tables,
   dialogs, menus and accessibility out of the box. Rebuilding an accessible combo
   box and a virtualised table would cost more than the bundle saves.
2. **ECharts over Recharts or visx.** The brief asks for a Sankey diagram and a
   calendar heat map. ECharts has both, renders on canvas so a year of daily data
   stays smooth, and supports a printable theme. The cost is bundle size and weak
   built in accessibility, which is why every chart in this product also renders a
   table.
3. **Hono over Express or Fastify.** Hono runs on Node, on Bun and on Cloudflare
   Workers with the same code, which is exactly the shape of the cloud mode. It is
   small, typed end to end and pairs naturally with Zod.
4. **Better Auth over rolling our own or over a hosted identity provider.** A hosted
   provider contradicts the premise of the product. Writing session handling, passkeys
   and two factor by hand is a security liability. Better Auth is a library that keeps
   the data in our own database.
5. **Biome over ESLint plus Prettier.** One binary, one configuration file, fast
   enough to run on every commit on a laptop. The plugin ecosystem is smaller, which
   this project does not need.
6. **Tauri over Electron.** Installer of a few megabytes instead of a hundred, lower
   memory, and the same web build inside. The cost is a Rust toolchain on the build
   machine and one more CI matrix, both paid only in phase 9.

## Consequences

Easier:

1. Business rules stay testable in isolation, with no browser and no database.
2. The browser, server and desktop builds share screens without copying code.
3. CI can run only what changed, thanks to the task cache.

Harder:

1. Any new dependency has to be placed in the right package, which is a decision
   every time.
2. Publishing the demo means the web app must build with no server present, so every
   server call sits behind the storage layer from the first line.
3. Tauri requires Rust on the machine that builds installers, which is a setup cost
   in phase 9 and a CI matrix on release.

To revisit:

1. Bundle size of the browser build once ECharts, SQLite WASM and the app are all in.
   If the first load gets heavy, charts and the statement pipeline become lazy routes.
2. Turborepo remote cache, only if local CI time becomes annoying.

## Action items

1. [ ] Enable corepack and pin the pnpm version in `package.json`.
2. [ ] Create the workspace with the packages listed in `CLAUDE.md`.
3. [ ] Configure Biome, TypeScript project references and Turborepo pipelines.
4. [ ] Set up GitHub Actions with lint, types, tests, build and the writing rule.
5. [ ] Install Git for Windows so that git is on the PATH outside GitHub Desktop.
