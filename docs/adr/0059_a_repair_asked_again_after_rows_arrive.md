# 0059. A repair asked again after rows arrive, and the invoice of a series joins them

Date: 3 October 2026

## Status

Accepted. Completes registry 0051, which put the repairs in one place and wrote them
through the change log. Part 1, items G.2 and G.6 of the request for 2.0.0.

## Context

Migration 0015 gave every occurrence of a series on a card the invoice it belonged to,
which releases before 1.1.0 never worked out. It did that where the rows lie, and the
change log still held each of those rows with no invoice. Three things write rows from a
log or a file, and each of them wrote the empty invoice back:

1. a restore, which writes every row of the file at the moment of the restore, newer than
   anything already here;
2. the exchange between devices, which folds the whole history of a row and so takes the
   insert of release 1.0.5 over a change nobody logged;
3. "keep theirs", which empties the space and writes the log of the other side.

Registry 0051 solved the second for the repairs it holds, because a repair written through
the writer is newer than the row it repairs. It does not solve the first and the third: in
both, the old row arrives newer than the repair, or the repair is not there at all.

## Decision

1. The invoice of a series is a repair like the others, in
   `packages/storage/src/repositories/repairs.ts`, written through the writer with the
   closing day of the card, which is the rule every writer of the column uses. Migration
   0015 keeps its name, so a database that took it does not take it twice, and does
   nothing.
2. The repairs are asked again after rows arrive: at the end of a restore, after the
   automatic copy brings anything back, after "keep both" and "keep theirs", and on a
   server after a device pushes changes, in which case what the repairs write goes back in
   the same answer. Each time only for the spaces the person may change, the same rule as
   on opening.
3. A record that names the invoice of a month that does not exist, which the route that
   pays an invoice accepted until G.6, is put back the way it is when nobody chose a
   month: a purchase on a card takes the invoice of its day, and a payment names none, so
   it pays the oldest invoice still owed. Which month was meant cannot be told.

## Consequences

1. A database of release 1.0.5 moving to 2.0.0 gets the invoices of its series on the
   first opening, through the log, so the other devices and the copies kept elsewhere learn
   it. A database that took 0015 already has them where the rows lie, and the log learns
   them the first time any of the three writes the empty invoice back.
2. Every repair has to stay safe to run at any moment, not only on opening: it looks for
   rows it has not repaired yet and writes nothing when there are none.
3. The server tells at start how many rows each repair put right.
