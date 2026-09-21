# Cofre

Personal finance app that anyone can clone and run with their own database, in the
browser, on their own server, in the cloud or as a desktop app. Shared spaces let a
couple, a family or a group of friends keep some money life together and the rest
private. Open source, no telemetry, data stays where the owner puts it.

This file is the entry point for any future session. Read it first, then the ADRs
listed at the end.

## Product in one paragraph

Someone opens Cofre and sees, in seconds, how much they have, how much is left to
spend this month, what falls due in the next days and whether they are saving what
they planned. Every record belongs to a space. The personal space is private and
cannot be shared. A shared space has members with roles, split expenses and a
settle up flow. The app works offline and syncs when it can reach a server.

## Decisions already taken

1. Name: Cofre. Package scope: `@cofre/*`.
2. Code, schema, routes, commits, ADRs and this file are written in English. Product
   documents for the owner (`docs/produto.md`, `LEIAME.md`) and the interface are in
   Portuguese, with English available through i18n.
3. Browser and server adapters are both built in phase 1, validated by the same
   integration suite.
4. Sync is prepared from day one (stable identifiers, logical clock, change log) and
   the engine itself lands in phase 6. No external sync service.
5. Visual direction: "Papel e tinta". Typographic, dense, no decorative cards.
6. Interface voice: direct, plain, no cheerleading.
7. Investment prices are entered by hand. CDI, Selic and IPCA come from the public
   SGS API of the Banco Central, cached for offline use.

## Golden rules

1. **Writing rule.** No hyphen, en dash or em dash as punctuation, as a list marker
   or to join words, in any text written for people: documents, interface copy, error
   messages, code comments, commit messages, pull requests, changelog. Use a comma, a
   colon, a period, parentheses, or rewrite. Lists are numbered or become prose. File
   names, folders and routes avoid the character too (underscore or camelCase). The
   exception is syntax that requires it, such as command line flags and third party
   package names. `node scripts/checkWriting.mjs` enforces this in CI and before every
   commit.
2. **Money is always an integer number of cents.** Never a floating point number.
   Amounts carry a currency. A record in another currency stores the rate used at the
   time. Default currency is BRL.
3. **Every data row carries `space_id`, not null.** Permission checks live in the
   repository layer in `packages/storage` and are covered by tests that run against
   every adapter. No screen and no route reads data without going through that layer.
   PostgreSQL adds row level security on top.
4. **No secrets in the repository.** `.env.example` is complete and commented.
5. **No telemetry.** Nothing leaves the device or the owner's server without an
   explicit action by the owner, and the interface says so when it is about to happen.
6. **Business rules live in `packages/core`**, in plain TypeScript with no framework
   import. It is the package with the highest test coverage.

## Repository layout

```
apps/
  web/        React, Vite, TanStack Router, Query and Table, Tailwind, ECharts, PWA
  server/     Hono, Zod, Better Auth, scheduled jobs
  desktop/    Tauri 2 wrapping the web build with local SQLite
packages/
  core/       business rules, pure TypeScript, no framework
  db/         schema described once, generated for SQLite and PostgreSQL, migrations
  storage/    repository layer and adapters, one permission model
  importers/  CSV, OFX, QIF, XLSX, JSON readers and the statement pipeline
  ui/         design tokens, components, chart presets
docs/
  produto.md  product brief in Portuguese
  adr/        architecture decision records
scripts/
  checkWriting.mjs
```

## Commands

| command | what it does |
| --- | --- |
| `pnpm install` | installs the workspace |
| `pnpm dev` | runs web and server in watch mode |
| `pnpm build` | builds every package and app |
| `pnpm lint` | Biome lint and format check |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm test` | Vitest across packages |
| `pnpm test:e2e` | Playwright flows in a real browser |
| `pnpm check:writing` | writing rule over Markdown and translations |
| `docker compose up -d` | the server and the interface in one container |
| `pnpm run configurar` | setup wizard that asks the mode and writes the config, still to be written |

The server needs `.env`. Copy `.env.example` and fill `COFRE_SECRET`. On Node 22 it
runs with `--experimental-sqlite`, which the scripts already pass. Node 24 needs
nothing.

## Conventions

1. TypeScript strict everywhere. No `any` that survives review.
2. File names in camelCase, React components in PascalCase, folders lowercase. No
   hyphen in any path.
3. Commits follow Conventional Commits in English, small and frequent, for example
   `feat: add recurring bills engine`. Never set the git user name or email.
4. Database tables and columns in snake_case and English: `spaces`, `transactions`,
   `space_id`.
5. Dates that mean a calendar day are stored as text in the ISO calendar form.
   Instants are stored as integer milliseconds in UTC. The space timezone defaults to
   America/Sao_Paulo.
6. Every chart ships with a title that states the finding and a table equivalent.
7. Accessibility target is WCAG 2.2 AA. Keyboard first, visible focus, reduced motion
   respected.

## How a phase ends

1. `pnpm check`, `pnpm test`, `pnpm build` all green.
2. Playwright screenshots of the new screens, reviewed before showing them.
3. A short summary for the owner: what shipped, what is pending, what comes next.
4. Wait for approval before starting the next phase.

## Phase log

| phase | state |
| --- | --- |
| 0. Discovery, product brief, ADRs, visual direction | done |
| 1 block A. Storage spike, monorepo, CI, money primitives, design system | done |
| 1 block B. Data model, repository layer, adapters, conformance suite | done |
| 1 block C. Browser mode end to end: worker, onboarding, shell, spaces, members | done |
| 1 block D. Browser flows in Playwright, server with authentication, invitations, Docker | done |
| 1 block E. The interface in server mode: sign in, invitation screen, mode switch | done |
| 2 block A. Transaction model, invoice cycle, installments, balances | done |
| 2 block B. The screens: register, list with filters, balances on the overview | done |
| 2 block C. Card invoice screen, quick entry by free text, bulk edit, saved filters | next |
| 3. Categories, priorities, rules, recurrences, calendar | planned |
| 4. Budget, savings rule, goals, expense splitting, alerts | planned |
| 5. Dashboard, consolidated view, reports and charts | planned |
| 6. Import, export, backup, migration, sync engine | planned |
| 7. Statement and receipt recognition | planned |
| 8. Projections, scenarios, investments, simulators | planned |
| 9. Desktop, PWA, demo deploy, deployment guides | planned |
| 10. Accessibility audit, copy review, performance, README | planned |

## Architecture decision records

| record | subject |
| --- | --- |
| [0001](docs/adr/0001_monorepo_and_stack.md) | monorepo and stack |
| [0002](docs/adr/0002_storage_adapters.md) | storage adapters and repository layer |
| [0003](docs/adr/0003_sync_strategy.md) | offline sync for shared spaces |
| [0004](docs/adr/0004_money_time_and_identifiers.md) | money, time and identifiers |
| [0005](docs/adr/0005_spaces_and_permissions.md) | spaces, roles and permissions |
| [0006](docs/adr/0006_visual_direction.md) | visual direction and design system |
| [0007](docs/adr/0007_language_and_writing_rule.md) | language policy and writing rule |
| [0008](docs/adr/0008_storage_implementation.md) | how the storage layer is actually built |
| [0009](docs/adr/0009_authentication_and_identity.md) | authentication, identity and invitations |
| [0010](docs/adr/0010_shape_of_a_transaction.md) | the shape of a transaction |
