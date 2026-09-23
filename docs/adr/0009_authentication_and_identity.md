# ADR 0009: Authentication and identity on the server

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Registry 0001 chose Better Auth rather than writing session handling by hand, for the
usual reason: password hashing, session rotation, cookie flags, passkeys and two
factor are easy to get subtly wrong and hard to test. Registry 0008 then removed both
Drizzle and the native SQLite driver, which are the two databases Better Auth is
usually plugged into. The two decisions had to be made to meet.

There is a second question underneath. Better Auth owns a table of people. Cofre also
has a table of people, and every space, membership and record points at it. Either
they are the same table, or one mirrors the other.

## Decision

### The library talks to the same database, with no second ORM

Better Auth accepts a `node:sqlite` handle or a PostgreSQL pool directly, so it opens
nothing of its own: the server hands it the same connection the repositories use. No
Kysely dialect to write, no Drizzle, no second pool to keep in step.

### Better Auth owns four tables, named our way

`auth_users`, `auth_sessions`, `auth_accounts` and `auth_verifications` belong to the
library. Its camel case field names are mapped to our snake case columns in the
configuration, so the schema reads the same everywhere.

Those four tables live in the shared schema description, which means one migration
path for every mode. In browser mode they are created and stay empty, because there is
nobody to sign in to. Four empty tables is a smaller price than a second migration
history that only some installs run.

### Identity is mirrored into our own table, in one direction

The signed in person is written into `users` on every authenticated request, from the
identity the library holds. Cofre reads only its own table.

The reason is concrete: our instants are integers of milliseconds, by registry 0004,
and the library writes dates as text. Pointing both at one table would force one of
the two models to bend, and every query in the product would carry the consequence.
The mirror costs one upsert per request and keeps both models honest. The direction is
fixed: what the sign in screen holds wins, and Cofre never writes back.

### Invitations are ours

A link carries a token of thirty two random bytes, valid for seven days, usable once,
carrying the role it grants. Reading the link tells you the name of the space, the
colour, the role and who invited you, and nothing else: a link can be forwarded, so it
must not be a window into the money. Accepting it requires an account, which is what
ties the acceptance to a person.

## Options considered

### Writing a Kysely dialect for the SQLite that ships with Node

Prepared and then dropped: the library turned out to accept the handle directly. Worth
recording because the same work will come back if the library ever narrows what it
accepts.

### One table for both, shared between the library and the product

Fewer rows and one source of truth for the email address. Rejected on the type
mismatch above, and because it would put a library's migration in charge of the table
every record in the product points at.

### Writing the authentication by hand

Around two hundred and fifty lines with the primitives in Node. Tempting while the
adapter question was open, and rejected once it was not needed. The cost is not the
first version, it is every later one: passkeys, two factor, rate limiting and session
revocation.

## Consequences

Easier:

1. One database, one connection, one migration path.
2. Passkeys and two factor become configuration, not a project.
3. The API tests sign up and sign in for real, so the whole path is covered.

Harder:

1. An email address exists in two tables, kept in step in one direction. Anyone
   reading the schema has to understand which one is the source of truth.
2. One extra write per authenticated request. Negligible at this size, and worth
   revisiting if the server ever serves many people.
3. The library decides the shape of its four tables. A version that changes them
   becomes a migration we have to write.

To revisit:

1. Rate limiting on sign in, before this is exposed to the internet.
2. Email verification, once the server can send email.
3. Row level security in PostgreSQL, still open from registry 0005.

## Action items

1. [x] Tables, field mapping and the mirrored identity.
2. [x] Invitations by link, single use, with a preview that reveals almost nothing.
3. [x] API tests covering sign up, sign out, roles and invitations.
4. [ ] Rate limiting and email verification.
5. [ ] The interface in server mode, which is the next block.
