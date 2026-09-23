# ADR 0002: Storage adapters and the repository layer

**Status:** Accepted, with the tool choices replaced by registry 0008
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

The same screens must read and write data in four places: a browser with no server,
a SQLite file on a home server, a managed PostgreSQL in the cloud and a SQLite file
inside a desktop application. Switching mode cannot require touching a single screen.

On top of that, every row belongs to a space and permission has to be checked before
any read or write. If that check lived in the screens or in the API handlers, a new
screen could forget it. It has to live at the only door to the data.

The browser mode carries a specific question that the owner asked to settle in phase
zero: can SQLite really run in a page served by GitHub Pages, which cannot set custom
response headers?

## Decision

A single package, `packages/storage`, exposes repositories in domain terms
(`transactions.list`, `accounts.create`) and nothing else. It accepts an actor
context on construction and scopes every query by space. Adapters implement a narrow
driver port beneath it.

| adapter | engine | where |
| --- | --- | --- |
| `browserSqlite` | `@sqlite.org/sqlite-wasm` with the `opfs-sahpool` virtual file system, inside a dedicated worker | browser mode and the public demo |
| `nodeSqlite` | `better-sqlite3` | server mode with SQLite |
| `desktopSqlite` | Tauri SQL plugin over the same schema | desktop mode |
| `postgres` | `postgres` driver with Drizzle | cloud mode and server mode with PostgreSQL |

Rules that come with the decision:

1. Schemas live in `packages/db` as two Drizzle dialect definitions, SQLite and
   PostgreSQL, with a parity test that fails when a table or a column exists in one
   and not in the other. Migrations are generated per dialect and both run in CI.
2. Every adapter passes the same conformance suite, exported by `packages/storage`
   as a reusable set of tests. A new adapter is finished when the suite is green.
3. The permission suite is part of that conformance suite. Every role is tested
   against every repository method, on every adapter.
4. In the browser the database runs in a worker. The user interface never blocks on a
   query and never touches the driver directly.
5. PostgreSQL adds row level security policies keyed on the space membership, as a
   second line of defence behind the repository layer, never as a replacement for it.

## Browser feasibility on GitHub Pages

The concern is real but solvable. The classic OPFS backend for SQLite WASM uses
`SharedArrayBuffer`, which browsers only expose when the page is cross origin
isolated, and cross origin isolation needs two response headers that GitHub Pages
does not let us set.

The official SQLite WASM build ships a second persistent backend, the OPFS synchronous
access handle pool, which does not use `SharedArrayBuffer` and therefore does not need
cross origin isolation. It requires a worker, and it is available in current Chrome,
Edge, Firefox and Safari. GitHub Pages serves `.wasm` with the correct media type and
the file sizes involved are well inside its limits.

Because this is the load bearing assumption of the browser mode, the very first task
of phase 1 is a spike: a page opens a database, writes rows, reloads and reads them
back, served with no isolation headers. Nothing else in phase 1 starts before that
spike is green.

**Verified on 21 September 2026.** The spike passed on the first attempt. With no
isolation headers and no `SharedArrayBuffer`, SQLite 3.53.4 opened a database through
the pool backend, wrote five thousand rows in 195 milliseconds and read them back
after a reload. Aggregating ten thousand rows by month took 63 milliseconds inside the
worker. Firefox and Safari are still to be checked when the demo goes live, with a
runtime capability check choosing the fallback if needed.

**Removed on 23 September 2026.** The spike page, its server and the note holding its
numbers were deleted before the repository was published. They were kept as the
evidence for the paragraph above, and what now stands in their place is better
evidence: `packages/storage/src/adapters/sqliteWasm.ts` is the same backend in the
real product, and the conformance suite runs the same tests against it and against the
other three adapters. The measurements above are the record of what the spike showed,
and this paragraph is the record that it existed.

Fallbacks, in the order they would be taken:

1. Ship a service worker that injects the isolation headers, and use the regular OPFS
   backend. Costs a service worker on every load and breaks in private windows.
2. Keep the database in memory and persist a serialised copy into IndexedDB on a
   debounce. Simple and portable, at the cost of memory and of a slower first paint
   with a large history.
3. Replace SQLite in the browser with a repository implementation over IndexedDB
   behind the same port. The screens do not change. Queries get more code and reports
   get slower, which is acceptable for a single person dataset.

## Options considered for the query layer

### Option A: repositories over a narrow driver port

| dimension | assessment |
| --- | --- |
| complexity | medium |
| portability | high |
| testability | high |

Pros: one place to enforce permission, one conformance suite, adapters stay small and
dumb. Screens depend on domain methods, not on SQL.
Cons: every new query is a method, so the layer grows. Some reports need handwritten
SQL per dialect.

### Option B: Drizzle used directly from the screens and the API

| dimension | assessment |
| --- | --- |
| complexity | low |
| portability | low |
| testability | low |

Pros: less code, full query flexibility everywhere.
Cons: Drizzle has different builders for SQLite and PostgreSQL, so every call site
would branch on dialect. Permission would be a convention instead of a guarantee.
Rejected on the first point alone.

### Option C: one engine only, PostgreSQL everywhere

| dimension | assessment |
| --- | --- |
| complexity | low |
| portability | none |
| testability | high |

Pros: a single dialect, real row level security, no WASM.
Cons: kills the browser mode, kills the offline desktop, kills the public demo and
turns a local first product into a hosted one. Rejected against the premise.

## Consequences

Easier:

1. Moving between modes is a data migration, never a rewrite.
2. A permission bug is one test away from being caught, in every adapter at once.
3. The demo is a static deployment with no backend to pay for or keep alive.

Harder:

1. Two dialects means two migration sets and a parity test to keep them honest.
2. Reports that need window functions have to be expressed in a way both engines
   support, or written twice behind one repository method.
3. OPFS data is tied to the browser origin and disappears if the user clears site
   data. The interface has to say so during onboarding and offer an export.

To revisit:

1. Whether the desktop app keeps the Tauri SQL plugin or embeds the same
   `better-sqlite3` through a sidecar, decided in phase 9 with real numbers.
2. Whether report queries need a small query builder of their own, decided in phase 5.

## Action items

1. [ ] Spike: SQLite WASM with `opfs-sahpool` deployed on GitHub Pages, verified in
   three browsers, before anything else in phase 1.
2. [ ] Define the driver port and the repository interfaces.
3. [ ] Write the conformance suite, including the permission matrix, before the
   second adapter exists.
4. [ ] Generate migrations for both dialects and run both in CI.
5. [ ] Write the onboarding warning about clearing site data in browser mode.
