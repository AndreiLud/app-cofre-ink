# Contributing

## Getting set up

```bash
git clone https://github.com/AndreiLud/app-cofre-ink
cd app-cofre-ink
pnpm install
pnpm dev
```

`pnpm install` also installs the Git hooks. They run Biome on what is staged, the
writing rule and the translations check before every commit, and the writing rule again
over the commit message.

## Before you push

```bash
pnpm check      # lint, types, the writing rule, the two languages
pnpm test       # the unit and property suites
pnpm test:e2e   # the flows, in a real browser
```

CI runs all of it on Node 22 and on Node 24.

## The rules that are not negotiable

### The writing rule

**No hyphen, en dash or em dash as punctuation, as a list marker, or to join words**, in
anything written for a person: documents, interface copy, error messages, code comments,
commit messages, pull requests. Use a comma, a colon, a period, parentheses, or rewrite
the sentence. Lists are numbered or become prose.

Inside a code span, a fenced block or a link destination it is allowed, because that is
not prose. A name that identifies something may carry it: the repository is called
`app-cofre-ink`, and a command line flag is written the way the command expects it.

`node scripts/checkWriting.mjs` enforces it, in CI and before every commit. The reason
is in [decision record 0007](../adr/0007_language_and_writing_rule.md).

### Money is an integer number of minor units

Never a floating point number, anywhere, for any reason. `packages/core` has the
primitives.

### Every row carries a space, and the check is in the repository layer

Not in a screen, not in a route. If you are adding a repository method, it names the
permission it needs, and that permission exists in the matrix in
`packages/storage/src/actor.ts`. The conformance suite fails if it does not.

### Business rules live in `packages/core`

Plain TypeScript with no framework import. If a rule is in a component, it exists in
browser mode and not on the server.

### No secrets in the repository

`.env.example` is complete and commented, with no real value. `.env` is ignored.

### No telemetry

Nothing leaves the device or the owner's server without an explicit action, and the
interface says so when it is about to.

## Conventions

1. **TypeScript strict everywhere.** No `any` that survives review.
2. **File names in camelCase**, React components in PascalCase, folders lowercase.
3. **Database tables and columns in snake_case English**: `spaces`, `space_id`.
4. **A date that means a calendar day** is text in the ISO form. An instant is an
   integer of milliseconds in UTC.
5. **Commits follow Conventional Commits, in English**, small and frequent:
   `feat: add recurring bills engine`.
6. **Every chart ships with a title that states the finding**, and a table saying the
   same thing.
7. **Accessibility is WCAG 2.2 AA.** Keyboard first, visible focus, reduced motion
   respected.
8. **Comments say why, not what.** The code already says what.

## Where things go

| you are adding | it goes in |
| --- | --- |
| a calculation with no dependencies | `packages/core` |
| a table or a column | `packages/db`, with a migration |
| a way to read or write data | `packages/storage`, with a permission and a conformance test |
| a reader for a file format | `packages/importers` |
| a place a copy can live | `packages/cloud` |
| a component or a chart | `packages/ui` |
| a screen | `apps/web/src/pages` |
| a route | `apps/server/src/app.ts`, three lines, no permission check |

## Adding a repository method

1. Write it in the right repository in `packages/storage/src/repositories`.
2. Name the permission it needs and add it to the matrix in `actor.ts` if it is new.
3. Add it to the conformance suite, which runs it against all four adapters.
4. Add it to the remote session in `apps/web/src/storage/remoteSession.ts` and to the
   route in `apps/server/src/app.ts`, so both modes have it.

Step 4 is the one people forget. A method that exists only locally is a screen that
works in browser mode and breaks on a server.

## Adding interface copy

Every string lives in `apps/web/src/locales/pt.json` and `en.json`. Both files hold the
same keys, checked by `pnpm check:translations`.

The product name is never written out. Say `{{app}}` and it is filled in from one
constant.

## Writing a decision record

Anything expensive to reverse gets one, in `docs/adr`, numbered in order. It says what
was decided, what the options were, why the others were rejected, and what it would
cost to change later. If a decision is superseded, the old record is amended rather
than deleted: a record that has been edited to look right was never a record.

## Reporting something

[The issues](https://github.com/AndreiLud/app-cofre-ink/issues). For a bug, the thing
that helps most is which of the three modes you were in, and what the screen said.
Never paste a backup or a statement: they are your money, in full.
