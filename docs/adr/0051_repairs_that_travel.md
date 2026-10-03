# 0051. Repairs that travel, and the moment a database took 2.0.0

Date: 3 October 2026

## Status

Accepted. Follows registry 0050, which made a record dated ahead a fact that waits for its
day. Part 1, item G.2 of the request for 2.0.0 will add the second repair to the same place.

## Context

Registry 0050 changed what the application writes. It did not change what releases 1.1.0
to 1.2.1 had already written: every record dated ahead from the form and the quick entry,
every occurrence of a series, and the payment the month screen writes before its day, all
of them promises that nothing turns into facts. A database those releases wrote is full of
them, and each one is called late the day after its day.

Decision 1 of 2.0.0 says a promise is only what release 1.0 wrote. Those stay.

Two things make the repair harder than an update over a table.

1. No row says which release wrote it. A row says when it was written.
2. A change made to the table and not to the change log does not last. Migration 0015
   repaired rows that way, and a restore, a copy kept elsewhere and the exchange between
   devices write the old row back from the log. That is item G.2.

A restore also writes every row it brings back at the moment of the restore, so the moment
a restored row was written says nothing about the release that made the file.

## Decision

A repair is written through the writer, as somebody allowed to change the space, so it
enters the change log with a stamp newer than the row it repairs, and an older copy of that
row arriving later loses to it. Repairs live in `packages/storage/src/repositories/repairs.ts`
and look only for what they have not repaired yet, so they run on every opening: the
browser runs them as the person who opens it, for every space that person may change, and
a server runs them when it starts, for every space, as its owner, from a device called
"server". Running them is `space.update`, proved by the permission probes like every other
call in the table.

A migration that changes no shape, `0016_release_2_0_0`, records the moment a database moved
to 2.0.0. The promises releases 1.1.0 to 1.2.1 wrote are the ones this database wrote after
taking `0013_benefit_quota` and before taking `0016`, strictly between the two. Those become
facts, and their day holds them back from then on, like any other.

## Options that were turned down

1. Every promise becomes a fact. Simple, and it would count a bill from release 1.0 that
   nobody ever said happened, which is what decision 1 says not to do.
2. The day 1.1.0 was published as the boundary. A database still on 1.0.5 after that day
   wrote promises of 1.0 after it.
3. The moment a row was written, compared with the moment of 0013 alone, with no upper end.
   Every promise restored from a file later would count as written by 1.2.1, because a
   restore writes every row at the moment of the restore.

## Consequences

A promise restored from a file is left a promise, whatever release wrote the file, because
nothing here can tell. The overview lists those as late, to be answered in one go. The note
for whoever updates from 1.x says so.

A database made by 2.0.0 takes 0013 and 0016 in the same run, so it has nothing to repair,
and neither does a browser whose clock never moves, which is the browser tests.
