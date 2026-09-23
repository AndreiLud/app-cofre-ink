# Cofre Ink

Personal finance app that anyone can clone and run with their own database, in the
browser, on their own server or in a cloud. Shared spaces let a
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

1. Name: Cofre Ink, which is what a person sees: the interface, the tab, the icon, the
   manifest and the documents. The code keeps the shorter one, because a package scope
   and an environment variable are names for a reader of the source and renaming them
   would be a day of churn for nobody: `@cofre/*`, `COFRE_*`, `cofre.db`. The interface
   never writes the name out: it says `{{app}}` and `APP_NAME` in
   `apps/web/src/i18n/index.ts` fills it in.
2. Code, schema, routes, commits, ADRs and this file are written in English. The
   interface is in Portuguese with English available through i18n, and every document
   meant to be read by somebody who is not working on the code exists in both: the
   README carries English first and Portuguese after it, and `docs/` holds the two side
   by side.
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
   names, folders and routes avoid the character too (underscore or camelCase), as a
   preference and not as a rule: the rule is about writing, so a name that identifies
   something may carry it, as the repository `AndreiLud/app-cofre-ink` does, and syntax
   that requires it (command line flags, third party package names) always may.
   `node scripts/checkWriting.mjs` enforces this in CI and before every commit.
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
  web/        React, Vite, TanStack Router and Query, Tailwind, PWA
  server/     Hono, Zod, Better Auth, scheduled jobs
packages/
  core/       business rules, pure TypeScript, no framework
  db/         schema described once, generated for SQLite and PostgreSQL, migrations
  storage/    repository layer and adapters, one permission model
  importers/  CSV, OFX, QIF, XLSX, JSON and PDF readers, and the statement pipeline
  cloud/      where a copy can live: a file, WebDAV, an online database, a spreadsheet
  ui/         design tokens, components, charts drawn as SVG
docs/
  produto.md  product brief in Portuguese
  instalar.md how to run, publish and package it, in Portuguese
  adr/        architecture decision records
scripts/
  checkWriting.mjs
  makeIcons.mjs           draws the mark and writes every icon format
  buildServiceWorker.mjs  writes the worker from what the build produced
  copyFallback.mjs        the page a static host serves for an unknown address
  checkTranslations.mjs   the two languages say the same things
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
| `pnpm check:translations` | the two languages hold the same keys and the same names |
| `docker compose up -d` | the server and the interface in one container, built and run on 21 September 2026 |
| `pnpm --filter @cofre/web icons` | redraws every icon, for the browser and for the shell |
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
| 2 block C. Card invoice screen, quick entry by free text, bulk edit, saved filters | done |
| 3 block A. Categories with two levels, spending priority, the screens that use them | done |
| 3 block B. Rules that sort on their own, recurrences, the calendar | done |
| 4. Budget, savings rule, goals, expense splitting, alerts | done |
| 5. Dashboard, consolidated view, reports and charts | done |
| 6 block A. Replication engine, one round trip over the server | done |
| 6 block B. Readers for CSV, OFX, QIF, XLSX and JSON, the import path and its screen | done |
| 6 block C. Export, backup, restore, sync in the browser, the report on paper | done |
| 6 block D. Destinations: a file, WebDAV, a database, a spreadsheet as a mirror | done |
| 7. Statement and receipt recognition: the PDF reader, the recogniser, the review | done |
| 7 pending. Hints per institution, once real statements are in hand | waiting on samples |
| 8. Projections, scenarios, investments, simulators | done |
| 9. Offline, publishing anywhere, the guides | done |
| 9 revised. The shell dropped, housekeeping made automatic, findings, five sections | done |
| 10. Accessibility audit, copy review, performance, README and LEIAME | done |
| 10 review. Charts on a telephone, the rate limit, a failure with a name | done |
| 11. Cards as a thing of their own: credit, debit, multiple, benefit, prepaid | done |
| 12. The danger zone: erasing a space, and erasing everything | done |
| 13. VA and VR as one, a database destination, the data screen redrawn | done |
| 14. More than one person per device, and a gate in front of the sign in | done |
| 15. The front door: two doors, nothing asked, and the defaults made correctable | done |
| 16. The check up: four signs, a verdict, and what to do first | done |
| 17. The plan: an order, a month on each step, and where the money comes from | done |
| 18. The trend against the months before, and what the card has already spent | done |
| 19. If the income stops, the dearer months of the year, and idle money | done |
| 20. Cofre Ink: the name in one place, a drop for a mark, and the copy audited | done |
| Next. Real statements for the recogniser, and whatever the owner asks for | waiting |

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
| [0011](docs/adr/0011_reading_one_line_of_text.md) | reading a record from one line of text |
| [0012](docs/adr/0012_rules_and_recurrences.md) | rules that sort, and series that write |
| [0013](docs/adr/0013_budget_goals_and_splitting.md) | limits, goals and the division between people |
| [0014](docs/adr/0014_charts_and_sizes.md) | charts drawn by hand, and screens that survive a resize |
| [0015](docs/adr/0015_import_export_and_sync.md) | reading files in, taking everything out, meeting a server |
| [0016](docs/adr/0016_reading_a_document.md) | reading a card invoice and a receipt out of a PDF |
| [0017](docs/adr/0017_where_a_copy_lives.md) | where a copy of a space can live, and what it costs |
| [0018](docs/adr/0018_making_the_history_smaller.md) | folding the change log, and packing what travels |
| [0019](docs/adr/0019_the_months_ahead.md) | projections, scenarios, interest and what is put aside |
| [0020](docs/adr/0020_an_application_in_a_window.md) | offline, icons and a build that serves from anywhere |
| [0021](docs/adr/0021_a_web_application_that_tidies_itself.md) | no shell, and housekeeping nobody is asked about |
| [0022](docs/adr/0022_reading_the_figures_back.md) | findings over a household's own records, and five ways in |
| [0023](docs/adr/0023_surfaces_weight_and_one_colour.md) | three surfaces, two line weights and one colour |
| [0024](docs/adr/0024_the_plastic_and_the_money.md) | cards, the accounts they reach, and which pot a voucher is |
| [0025](docs/adr/0025_taking_the_data_away.md) | erasing a space, erasing everything, and what neither can reach |
| [0026](docs/adr/0026_a_copy_that_is_a_database.md) | a copy that is a database, and a screen ordered by how often |
| [0027](docs/adr/0027_a_cost_before_a_password.md) | a cost before a password, and no captcha from anybody else |
| [0028](docs/adr/0028_the_front_door.md) | the front door of an address anybody can open |
| [0029](docs/adr/0029_four_signs_and_a_verdict.md) | four signs, and a word for the state of the money |
| [0030](docs/adr/0030_a_plan_with_a_month_on_it.md) | a plan with a month on it, and a target they have already hit |
| [0031](docs/adr/0031_whether_it_is_getting_better.md) | whether it is getting better, and the months already spent |
| [0032](docs/adr/0032_the_year_ahead_and_the_one_income.md) | the year ahead, the one income, and what standing still costs |
| [0033](docs/adr/0033_the_name_and_the_drop.md) | the name, the drop, and the one place the name lives |
