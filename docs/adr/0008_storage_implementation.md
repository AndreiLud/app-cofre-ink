# ADR 0008: How the storage layer is actually built

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)
**Supersedes:** the implementation choices inside registry 0002, whose structure and
reasoning stand unchanged

## Context

Registry 0002 settled the shape of the storage layer: repositories over a narrow
driver port, one conformance suite, four adapters. It also named two tools, Drizzle
for the schema and `better-sqlite3` for SQLite on a server. Building it showed that
both names were wrong, for different reasons, and the reasons are worth writing down
because they will come up again.

## Decision

### The schema is described once, in our own vocabulary

`packages/db` holds a small description of tables and columns, and generates the SQL
for SQLite and for PostgreSQL from it.

Drizzle models a schema per dialect: `sqliteTable` and `pgTable` produce different
objects with different types, and its query builders are typed against one of them. A
repository written on top would have to exist twice, or give up its types behind a
cast. Since the repositories here write portable SQL through the driver port, the only
thing an ORM would still do is generate DDL, and generating DDL from a hundred lines
of description is not a problem worth a dependency.

What the description buys, beyond the DDL: a table in the space scope cannot be
declared without `space_id`, because the function that builds tables adds it and
refuses to let a table declare it by hand. The rule from registry 0005 is enforced by
the type system instead of by review.

The drift test in the conformance suite reads the shape of a database that has just
run every migration and compares it against the description, on every adapter. That is
what keeps the two dialects honest.

### SQLite on a server comes from Node itself

`better-sqlite3` version 13 has no prebuilt binary for Node 22 on Windows. Installing
it falls back to compiling with node gyp, which needs a C++ toolchain that a person
setting up their own finance app does not have and should not need. The install failed
on the development machine, which is a fair simulation of the first person who clones
the repository.

`node:sqlite` ships inside Node. It is stable from Node 24 and available on Node 22
behind `--experimental-sqlite`, which the test configuration passes when it detects an
older Node. No compiler, no prebuilt binary, no postinstall script.

The WebAssembly build covers the browser, and the conformance suite runs it under Node
as well, so the engine that serves the browser mode is tested on every commit.

### PostgreSQL is tested with PGlite

PGlite is PostgreSQL compiled to WebAssembly. The suite gets the real dialect, real
constraints and real error messages with no container and no service, which means the
PostgreSQL adapter is covered in CI from the first day instead of from the day someone
sets up Docker. The adapter itself takes a query function rather than a client, so the
same code serves PGlite in tests and a network driver in production.

### Not being a member means the space does not exist

While writing the permission matrix, half the operations answered "you may not" and
half answered "there is nothing here", for the same person. The rule is now one rule:
someone who does not belong to a space is told the space does not exist, and someone
who does belong is told plainly that their role does not allow the action. The first
answer reveals nothing, the second is the one a person can act on.

## Options considered

### Drizzle with two dialect schemas

Pros: a known tool, generated migrations, types on queries.
Cons: the repository layer would be written twice or lose its types, which is the
opposite of what registry 0002 was trying to buy. Rejected.

### Raw SQL with no description at all

Pros: nothing to maintain but the migrations.
Cons: no single source of truth, so the two dialects drift, and nothing stops a table
from being created without `space_id`. Rejected.

### Keeping `better-sqlite3` and asking for build tools

Pros: the fastest SQLite available to Node.
Cons: a compiler as a prerequisite of a self hosted application. The performance
difference does not matter at the size of one person's financial history. Rejected.

## Consequences

Easier:

1. Anyone can install the project with Node and pnpm and nothing else.
2. The same repositories run on three engines today, proven by 240 tests.
3. Adding a table is one description plus one migration, and the drift test catches a
   forgotten migration.

Harder:

1. Queries are strings, so a typo is caught by a test instead of by the compiler. The
   row mappers and the conformance suite are the answer, and every repository method
   is exercised by at least one test.
2. Placeholders are question marks, converted for PostgreSQL by position, so a
   question mark inside a string literal in SQL would break. No query needs one.
3. Migrations are ours to maintain.

To revisit:

1. Row level security in PostgreSQL, which belongs with the server in phase 6.
2. The driver for a real PostgreSQL over the network, which arrives with the server.
3. A test that migrates a database created by an older version, to catch a migration
   that was never written.

## Action items

1. [x] Schema description, DDL generation and the drift test.
2. [x] Adapters for `node:sqlite`, SQLite as WebAssembly and PostgreSQL.
3. [x] Conformance suite with the permission matrix, green on all three.
4. [ ] Row level security policies, in phase 6.
5. [ ] Migration test from an older baseline, in phase 2.
