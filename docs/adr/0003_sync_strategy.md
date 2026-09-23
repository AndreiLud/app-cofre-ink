# ADR 0003: Offline sync for shared spaces

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

A shared space has more than one member, and the members are not always online. Two
people can edit the same grocery transaction on the subway with no signal, and the
app has to end up in one state that both of them recognise. In server and cloud mode
the database is shared, so sync is only about the client cache. In browser and desktop
mode the database is genuinely local, so sync is a real replication problem.

The owner chose to prepare the model now and build the engine in phase 6. That choice
only works if the schema decisions taken in phase 1 are the right ones, because adding
a logical clock to a table with a year of real data is painful.

## Decision

Build our own replication on a change log, with hybrid logical clocks and last write
wins resolved per field. No external sync service.

Schema commitments taken in phase 1:

1. Every row has an identifier generated on the client (UUID version 7), so two
   offline devices never collide and rows sort by creation time.
2. Every row carries `space_id`, `created_at`, `updated_at`, `updated_by` and
   `deleted_at`. Deletion is a tombstone, never a physical delete, until a compaction
   job runs on data older than the retention window.
3. Every row carries a hybrid logical clock stamp, stored as a sortable string. It
   combines wall clock milliseconds, a counter and the device identifier, so ordering
   stays stable even when a device clock is wrong.
4. Every write also appends to a `changes` table: space, entity, entity identifier,
   the fields that changed, the clock stamp, the device and the actor. This is the
   unit of replication.
5. Each device keeps the highest clock stamp it has seen per space, which is what it
   sends when it asks for what it missed.

Resolution rules:

1. Field level last write wins, ordered by clock stamp, with the device identifier as
   the deterministic tiebreak. Two people editing different fields of the same
   transaction both keep their edit.
2. Amounts are never merged or summed during resolution. The whole field wins or
   loses.
3. Expense splits and settle ups are append only. Correcting one means writing a new
   record that supersedes it, which keeps the history auditable.
4. Membership, roles and invitations are decided by the server, never by client
   resolution. A client change log entry that tries to grant a role is rejected. This
   is the one place where last write wins would be a privilege escalation bug.
5. When resolution discards an edit that a person made, the activity log keeps both
   versions so the person can see what happened and redo it.

## Options considered

### Option A: own change log with hybrid logical clocks

| dimension | assessment |
| --- | --- |
| complexity | high, concentrated in one package |
| cost | development time only |
| portability | works in all four modes |
| familiarity | the algorithms are well documented |

Pros: no external service, no vendor, works with SQLite and PostgreSQL alike, the
protocol is ours to debug, and it is the part of this repository a reader will find
most interesting.
Cons: it is real distributed systems work. Needs property tests, needs a story for
clock skew, and gets no help from a vendor when something goes wrong.

### Option B: ElectricSQL or PowerSync

| dimension | assessment |
| --- | --- |
| complexity | low in our code, high in the deployment |
| cost | a service to run or a subscription |
| portability | PostgreSQL only |
| familiarity | medium |

Pros: replication solved by people who do only that, with a proven conflict model.
Cons: both require PostgreSQL plus a sync service that is always reachable. The
browser only mode on GitHub Pages and the offline desktop would either lose shared
spaces or force everyone into a hosted deployment. It also ties the project to a
vendor, which contradicts the premise that you own your setup.

### Option C: a CRDT library such as Automerge or Yjs

| dimension | assessment |
| --- | --- |
| complexity | medium |
| cost | free |
| portability | good |
| familiarity | low |

Pros: conflict resolution comes for free and is mathematically sound.
Cons: these libraries model documents, not relational data. A year of transactions
becomes a document that has to be loaded in memory to be queried, which kills the
reports and the SQL that the rest of the product depends on. The merge semantics also
do not match money: a counter that merges two edits into a sum is exactly what we do
not want.

## Tradeoffs

Field level last write wins is not the strongest model available, but it matches the
domain. Financial records are mostly created once and edited rarely, by a person who
knows what they are doing. The expensive alternatives buy strong merge semantics for
a conflict that will be rare, and they cost the offline modes that the product exists
for.

The real risk is not the algorithm, it is the surface area: pulling, pushing,
retrying, compacting and migrating. That is why the engine waits for phase 6, when
the entities it replicates are stable.

## Consequences

Easier:

1. Browser and desktop keep working with no server at all, and gain shared spaces the
   moment one is configured.
2. Any adapter can replicate, because the change log is ordinary rows.
3. The activity log required by the product comes almost free from the change log.

Harder:

1. Phase 1 writes change log entries that nothing reads yet. That code has to be
   correct anyway, and tested.
2. Storage grows with history, so compaction and a retention window are needed.
3. Every new entity has to declare how it replicates, which becomes part of the
   checklist for adding a table.

To revisit:

1. Whether a small subset of entities deserves stronger merge semantics, once real
   conflicts are observed.
2. End to end encryption of the change log, which would make a shared space private
   even from the server that relays it. Attractive, deliberately out of scope for now.

## Action items

1. [ ] Add the identifier, clock, tombstone and authorship columns to the base table
   helper in phase 1.
2. [ ] Implement the hybrid logical clock with property tests covering clock skew and
   ordering stability.
3. [ ] Write every mutation through a single path that appends to the change log.
4. [ ] Design the pull and push endpoints in phase 6, with a replay test that applies
   the same change set in different orders and asserts the same final state.
