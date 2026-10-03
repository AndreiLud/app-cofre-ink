# 0060. What the repository keeps, what git ignores, and what the image carries

Date: 3 October 2026

## Status

Accepted. Part 2, section L of the request for 2.0.0.

## Context

Three lists decide where a file goes, and each was written as a list of exclusions, which only
catches what somebody thought of:

1. `.gitignore` hid every folder called `data`, `build` or `out`, so a source folder of that
   name would have vanished from the repository with nothing said. It did not ignore a statement
   dropped at the root, the backup the guide's own command wrote into the clone (`${PWD}`), or a
   sample statement kept while the reader learns a bank.
2. `.dockerignore` held its rules for secrets and databases at the root of the build context
   only. The build copies the whole context, so a database in `apps/server/data` or a `.env` in
   `apps/server` went into the image. The image also carried the conformance suite, which
   imports the test runner.
3. Nothing checked either list. A rule that is wrong says nothing until the repository is public.

## Decision

**What stays versioned**: the code, the tests, `docs/`, `.github`, `scripts/` and the
configuration at the root. The release runs `check` and `test` on the tag, so the tests are part
of what a release is. Nothing is marked `export-ignore`. No sample document is versioned: the
layouts the statement reader is tested on are invented, written in code by `buildPdf`, and the
frozen schema of 1.0.5 the upgrade test starts from is text in a `.ts` file, because `*.db` is
ignored.

**What git ignores**, each group commented in the file:

1. `shots/`, a folder of that name anywhere, where a review leaves its pictures and reports.
   Never `shots.spec.ts`, the camera, which is in the repository and skipped unless asked for.
2. At the root only, what a bank hands over and what this application writes out: `*.pdf`,
   `*.ofx`, `*.qfx`, `*.qif`, `*.csv`, `*.xls`, `*.xlsx`, `*.json.gz`, `cofre_*.json`,
   `*.tar.gz` and `*.sql`. Only at the root, because a rule everywhere would hide a template
   kept in `apps/web/public`, which a clean checkout would then build without.
3. The content of `samples`, never the folder, so its README comes back in; `CLAUDE.local.md`;
   `.dev.vars*`.
4. `/data/`, `apps/server/data/`, `/build/` and `/out/`, anchored, so no source folder of that
   name is hidden.

Backups are written outside the clone, to `${HOME}/cofreBackups`, which is the same folder in
bash and in PowerShell. A PostgreSQL dump is written inside its container and copied out with
`docker compose cp`, never with `>`, because in Windows PowerShell the redirect writes it again
in another encoding and the restore fails.

**What the image carries** is a list of what enters: everything is out, the five files the
first copy of the Dockerfile names, `LICENSE`, `apps/web`, `apps/server`, `packages` and
`scripts` come back, and then dependencies, builds, caches, tests, the browser flows, the review
pictures, `apps/server/data`, the conformance suite, samples, `.env` files, databases, logs and
notes to the tooling are taken out again at any depth. The last matching line wins, so the
order is the decision. Never a rule on every folder called `data` or `build`. The final image
copies `LICENSE`, because it distributes the code under it.

**Three checks prove the lists.** `scripts/checkRepository.mjs`, run by `pnpm check`, before
every commit and in CI, refuses a tracked statement, spreadsheet, backup, dump, database,
sample, review picture, secret file or anything over one megabyte that is not the lockfile, and
asks git about a list of canaries that must be ignored and must not be. A CI step forces a
statement and a large file past the rules and expects the check to fail. A CI job puts canaries
where they would be and builds a busybox image from the context, failing if any of them, the
browser flows or the conformance suite got in, or if the lockfile or the licence did not. And a
workflow of its own builds the runtime stage whenever what it is made of changes, checks the
version it reads, that no test or conformance file is inside, that the licence is the one in the
repository, and that it answers on `/health` within thirty seconds.

## Consequences

1. A statement or a backup in the clone can no longer go in with the next commit of everything,
   and a change to `.gitignore` that lets one in, or hides a source folder, fails at once.
2. The image is smaller, holds no test runner, and cannot carry somebody's database or secret
   because it happened to be in a subfolder on the machine that built it.
3. Somebody without git on the PATH, which is how this machine runs, gets a sentence instead of
   the check; CI, where git is always there, treats its absence as a failure.
