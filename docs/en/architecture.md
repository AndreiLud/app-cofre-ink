# Architecture

## The one idea

**No screen ever touches a database.**

A screen asks a session for what it needs. A session is an object with repositories on
it: `session.transactions.list(...)`, `session.spaces.create(...)`. There are two
implementations of that object and the screens cannot tell them apart.

1. **The local session.** The repository layer runs in the browser, on top of SQLite
   compiled to WebAssembly, in a dedicated worker, writing to the origin private file
   system.
2. **The remote session.** The same calls become HTTP requests, and the same repository
   layer runs on a server against SQLite or PostgreSQL.

Everything else follows from that. The product can be a folder of static files with no
server at all, or a server with accounts and shared spaces, without two versions of
anything. A permission check is written once instead of once per route. A bug in a rule
is fixed in one place for both modes.

```
   screens (apps/web)
        |
        |  one interface, two implementations
        v
   +----------------------+          +------------------------+
   | local session        |          | remote session         |
   | packages/storage     |          | fetch to apps/server   |
   | in a worker          |          |                        |
   +----------+-----------+          +-----------+------------+
              |                                  |
              v                                  v
     SQLite WASM in OPFS                 packages/storage again,
                                         on node:sqlite or PostgreSQL
```

## The packages

| package | what it holds | what it must never do |
| --- | --- | --- |
| `@cofre/core` | money, dates, the logical clock, identifiers, reading a record from one line of text, the findings over a household | import a framework, or touch a database |
| `@cofre/db` | the schema described once as data, generated as DDL for SQLite and for PostgreSQL, and the migrations | run queries |
| `@cofre/storage` | the repository layer, the four adapters, the permission model, the change log, the conformance suite | know about HTTP or about React |
| `@cofre/importers` | readers for CSV, OFX, QIF, XLSX, JSON and PDF, and the pipeline that turns a file into records for review | write anything |
| `@cofre/cloud` | where a copy can live, and the public indices from the Banco Central | hold a credential |
| `@cofre/ui` | design tokens, components, charts drawn as SVG | know what a transaction is |
| `apps/web` | screens, routing, the worker, both languages, the service worker | contain a business rule |
| `apps/server` | routes, authentication, configuration, scheduled tidying | contain a permission check |

The last two rows are the ones that cost the most to keep true and are worth the most.
A business rule that leaks into a screen exists in browser mode and not on the server.
A permission check that leaks into a route protects that route and nothing else.

## The four adapters, one suite

| adapter | engine | used by |
| --- | --- | --- |
| `sqliteWasm` | `@sqlite.org/sqlite-wasm` with the pool virtual file system, in a worker | browser mode |
| `nodeSqlite` | `node:sqlite` | a server with a file |
| `pglite` | PostgreSQL compiled to WebAssembly | tests, and a server with no PostgreSQL |
| `postgres` | a real PostgreSQL | a server with one |

They all implement one `Driver` interface, and `packages/storage/src/conformance` is a
suite that runs against every one of them, including who is allowed to see what. An
adapter is finished when it passes that suite, and not before. That is where 960 of the
1399 tests in this repository are.

PostgreSQL carries row level security on top, so a mistake in application code is
caught by the database rather than by nobody.

## The schema is data

`packages/db` describes each table as an object: columns, types, constraints, whether
it carries a space, whether it is replicated. Two generators turn that description into
the DDL for SQLite and for PostgreSQL. Nothing is written twice, and a column that
exists in one and not the other is not possible.

Twelve migrations, applied in order, recorded in a table.

## Writing, and the change log

Every write goes through one writer. It does four things in one transaction:

1. Stamps the row with a logical clock, a hybrid of wall time and a counter, so two
   devices that wrote while apart can be ordered without trusting either clock.
2. Writes the row.
3. Writes an entry into `changes` describing the write: which entity, which identifier,
   which operation, what the payload was, which device, which actor.
4. Commits.

That change log is what sync is made of, and it is why sync was designed in from the
first phase even though the engine arrived in phase 6. A device that has been away
sends what it wrote and asks for what it missed.

The log is folded once a day by a housekeeping job, so it does not grow forever. The
settled part of the history becomes a single entry per row.

## The interface

React 19 with TanStack Router for addresses and TanStack Query for what is in flight.
Tailwind 4 for style, with the tokens in `@cofre/ui`. Both languages through i18next,
with the language not in use fetched only when somebody asks for it.

Which of the two opens is the first of four answers that speaks: the `lang` parameter of
the address, when it says `pt` or `en`; the choice this browser holds; the zone of the
device, where Brazil opens in Portuguese and anywhere else opens in English; and
Portuguese when the device will not say. The order is `firstLanguage` in `@cofre/core`,
so it is one pure function with its own tests, and nothing in it asks a service
anything. A language that came from the address is written down as a choice and the
parameter is taken back out of the address bar. A language that came from the clock is
never written down, so somebody who travels does not come back to an interface that
translated itself. The reasoning is in
[decision record 0034](../adr/0034_which_language_opens.md).

The database runs in a dedicated worker, so a query over ten thousand rows does not
stop the page from painting.

A service worker written by hand, generated at build time from what the build actually
produced. Everything with a hash in its name is cached forever, the page itself is
asked for over the network with the cached copy as the fallback, and nothing else is
cached at all.

## The server

Hono, on Node, reading the TypeScript directly with no build step. Zod validates every
input at the edge. Better Auth owns identity. The routes are thin on purpose: each one
finds out who is asking, opens a session on the repository layer as that person, and
calls one method.

Ahead of the two routes worth attacking there is a gate: a proof of work challenge that
costs the caller about a second and costs the server one hash to check.
