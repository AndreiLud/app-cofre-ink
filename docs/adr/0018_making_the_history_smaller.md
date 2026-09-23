# ADR 0018: Making the history smaller

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Registry 0003 decided that a space carries an append only log of changes, and that two
devices agree by folding that log. It is the reason sync is simple and the reason a file
works as well as a server. It is also a log that only grows: a household that writes
fifty records a month, edits a third of them and settles an invoice every month adds a
few thousand entries a year, and every entry travels every time.

Two different problems hide in that sentence. The log is larger than the data it
describes, and what travels is JSON, which is the most repetitive text a computer ever
sends. The owner asked for the data to be compressed. Both problems answer to that, in
different ways, and only one of them is a decision.

## Decision

### The log is folded up to a watermark, and the watermark is part of the space

`compactChanges(driver, spaceId, { before })` takes every row that has more than one
entry older than the cut, and replaces that row's old entries with a single `insert`
that carries the newest state, the newest entry's identifier and the newest entry's
clock. The row's history after the cut is untouched. The space then records
`compacted_before`, which is the cut.

Keeping the newest entry's identifier and clock, rather than making new ones, is what
makes this safe. A device that already folded those entries sees an entry it has seen,
with a clock it has seen, and nothing moves.

### A peer that arrives late is told, rather than silently corrected

`applyChanges` now drops an incoming entry when its clock is at or below the watermark
**and** the row it is about already exists here. The second half is the whole of the
rule. Without it, a device that was away for a year would have its only copy of a row
rejected because the row is old. With it, an old entry about a row we already know is
noise, and an old entry about a row we have never seen is the row itself.

That is the honest limit: compaction gives up the ability to replay a row's history
before the cut. Nothing in the product reads that history. If something ever does, it
reads it from a backup, which is a full copy and not a log.

### What travels is gzip, and what is stored is gzip

`packBundle` writes a bundle as gzip at level 6, `unpackBundle` reads gzip or plain
JSON. Every destination writes the packed form under a name that ends in `.json.gz`,
and reads either, so a file written before this change still opens. Level 6 and not 9
because the last two levels of deflate buy about two percent for about twice the time,
and this runs on a telephone.

Gzip and not a format with a dictionary, and not a binary encoding of the log, because
gzip is in every browser, every server and every drive, and a file that ends in `.gz` is
one that the owner can open with tools they already have. A backup nobody can read
without this application is not a backup.

## Consequences

1. A space can be trimmed on purpose, from a screen, and the trim is described by one
   date. Nothing happens on its own: an application that silently deletes history is one
   nobody trusts.
2. The clock keeps working. The watermark is a clock value, comparable with every other
   clock value, so no new kind of time was invented.
3. A bundle is roughly a fifth of what it was on the wire, and the exact figure is
   whatever the data deserves, because gzip is honest about repetition.
4. `compacted_before` is a column on `spaces`, migration `0009_compacted_log`, so an
   existing database gains it without being rewritten.
5. Two devices that both compact at different dates still agree, because folding is
   idempotent and the watermark only ever refuses entries about rows both of them have.
