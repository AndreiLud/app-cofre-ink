# ADR 0005: Spaces, roles and permissions

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

The product separates money into spaces. One of them is personal and private. The
others are shared with a partner, a family or a group of friends. This is the feature
that makes the product different from a spreadsheet, and it is also the feature where
a bug is not an inconvenience but a betrayal: showing someone else's personal spending
to their partner is the worst thing this application could do.

So the permission model is not a feature of the API. It is a property of the data
layer, tested on every adapter, in every mode.

## Decision

### The model

1. A space has a kind, either personal or shared, plus a name, a colour and an icon.
2. A personal space has exactly one member, the owner, and cannot receive invitations.
   This is enforced by a database constraint and by the repository layer, not by the
   interface.
3. Every data table has `space_id`, not null, with a foreign key. There is no global
   table of transactions, accounts, budgets or goals.
4. Membership is its own table: space, user, role, state, who invited, when it was
   accepted.
5. Repositories are built with an actor context that carries the user and the spaces
   that user belongs to, with roles. Every query is scoped by that context. There is
   no way to ask a repository for data without it.

### Roles

| role | read | create transactions | edit and delete | manage members | settings | delete space |
| --- | --- | --- | --- | --- | --- | --- |
| owner | all | yes | yes | yes | yes | yes |
| admin | all | yes | yes | yes | yes | no |
| editor | all | yes | yes | no | no | no |
| viewer | all | no | no | no | no | no |
| logger | own records only | yes | own records, while not reconciled | no | no | no |

The logger role exists for a child or for someone who helps with the house. They
register what they spent and see what they registered, nothing else.

### Consolidated view

The selector switches between one space and everything the person can see. The
consolidated view is the union of the spaces where the actor is a member. Another
person's personal space never appears, for the simple reason that the actor is not a
member of it, so the scoping already excludes it. There is no special case to get
wrong.

Sharing only totals is a separate, explicit feature: a member can publish an aggregate
into a shared space, for example how much they contributed to the house this month,
without exposing a single row. The aggregate is a record of its own, not a view over
private data.

### Enforcement, in layers

1. The repository layer scopes every query and checks the role before every mutation.
   This is the single source of truth and it works in all four modes.
2. The conformance suite runs a permission matrix against every adapter: for each
   role, for each repository method, assert allowed or denied. A new repository method
   with no entry in the matrix fails the suite.
3. PostgreSQL adds row level security policies keyed on membership, so a mistake in
   application code does not become a data leak in the cloud mode.
4. The API validates that the space in the request belongs to the session, and never
   trusts a space identifier coming from the client as authorisation by itself.
5. Sync never resolves membership or role changes on the client, as recorded in
   registry 0003.

### Leaving and removing

1. Data created inside a shared space stays in the space. It is the shared history of
   the group and removing it would rewrite everyone's reports.
2. Before leaving, the person can export their own part, in the same formats the
   product exports everything else.
3. The owner cannot leave without transferring ownership first.
4. Removing a member keeps their records and keeps their name in the activity log.
   Outstanding balances are shown and have to be acknowledged before the removal
   completes.

## Options considered

### Option A: scoping in the repository layer

Pros: one door, one guarantee, works offline and online, testable without a server.
Cons: every method needs the actor context, which makes signatures longer.

### Option B: scoping in the API layer

Pros: familiar, easy to read in route handlers.
Cons: the browser and desktop modes have no API layer, so the guarantee would exist
only in two modes out of four. Rejected.

### Option C: row level security as the only mechanism

Pros: the database enforces it, which is the strongest possible place.
Cons: SQLite has no row level security, so again it would cover only part of the
product. Kept as a second layer, not as the mechanism.

## Consequences

Easier:

1. A new screen cannot accidentally read across spaces, because there is no method
   that would let it.
2. The consolidated view is a natural consequence of the model instead of a feature
   with its own rules.
3. Auditing is straightforward: the permission matrix is a table a person can read.

Harder:

1. Every repository method carries the actor context, including in tests.
2. Moving a transaction between spaces is a real operation with checks on both sides,
   not an update of one column.
3. Reports that span spaces have to be composed from per space queries, which costs
   some performance in the consolidated view. Acceptable at personal data volumes.

To revisit:

1. Finer grained roles, for example a member who can see only certain categories. Not
   now, because it multiplies the permission matrix.
2. Invitation links with expiry and single use, designed in phase 1 and hardened when
   the server mode is exercised for real.

## Action items

1. [ ] Base table helper that adds `space_id` and refuses to create a table without it.
2. [ ] Membership table, roles enumeration and the actor context type.
3. [ ] Permission matrix as data, plus the conformance test that walks it.
4. [ ] Row level security policies and a test that connects as a restricted role and
   fails to read another space.
5. [ ] Interface rule: the current space is visible at every moment, including in the
   quick entry form and in the command palette.
