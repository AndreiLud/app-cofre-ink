# ADR 0025: Taking the data away

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

The project promises that the data stays where the owner puts it, and until now it kept
only the first half of that promise. Everything could be brought in and taken out, and
nothing could be taken back. There was no way to say "this is over, leave nothing".

Worse, the word delete already meant something else here. Every deletion in the
repository layer is soft: the row gets a tombstone and stays, so the deletion can reach
another device. Removing a shared space marked the space row deleted and left every row
inside it on disk, unreachable and permanent. A person who removed a space and thought
their data was gone was wrong, and had no way to find out.

The owner asked for a danger zone: erase everything in a profile, with a separate option
per space.

## Decision

### One repository, and the only DELETE in the project

`packages/storage/src/repositories/erasure.ts` is the one place that writes DELETE
rather than a tombstone, and it is not logged and does not replicate. A change log entry
saying a space was erased would be the one row left saying what used to be there.

Two operations:

1. `eraseSpace(spaceId)` removes every row of a space, table by table, in one
   transaction. A shared space goes with it, members and all. The personal space is
   emptied and stays, because the application needs one and sending somebody back
   through onboarding to get it is a worse answer than an empty screen.
2. `eraseEverything()` erases every space the person owns and leaves every space they
   merely belong to. Leaving is the only honest move on a space that is not theirs: the
   records in it belong to the people who stayed, and one member walking out does not get
   to empty the shared drawer.

Permission is `space.delete`, which is the owner alone. An admin runs a space day to day
and still cannot empty it.

### The order of the deletes comes from the schema

The schema declares a table only after the tables it points at, so walking it backwards
deletes a child before its parent. Two details that cost a bug each:

1. The log and the invitations are in the membership scope and carry a space, so they are
   swept with the rest. A space erased with its history still in the log left a shadow.
2. A table that points at itself needs two passes. Categories are the only one: a child
   names its parent and the pointer refuses to dangle, so one DELETE over a two level
   tree trips over itself in SQLite, which checks a foreign key per row. PostgreSQL
   checks at the end of the statement and never noticed. The conformance suite runs on
   both, which is the only reason this was found before it shipped.

### Spaces thrown away before this existed

Removing a space leaves its rows behind, and a deleted space is not a membership any
more, so erasing everything would walk straight past them. They are swept too, and only
when nobody else was ever in that space.

### Erasing everything means two different things, and the screen says which

In browser mode the whole database is one file in this machine's storage, so erasing
everything wipes the file, forgets the profile and the preferences, and reloads onto
onboarding. Nothing is left, including the parts the repository layer cannot reach.

In server mode it means the spaces of this account. The account itself stays, because
signing up again is a different question from erasing the data, and because the rows this
person wrote in spaces they do not own still name them as the author.

### What it does not claim

A shared space that somebody else still has on their device is not reachable from here,
and the confirmation says so in those words. Sharing is giving a copy, and a copy cannot
be ungiven. Saying anything else would be the kind of promise that makes the rest of the
project untrustworthy.

### Friction on purpose

Nothing in the zone happens without the name of the space typed out, or the words "apagar
tudo" for the whole database. It is the last panel of the data screen, it carries the one
colour the interface already uses for money leaving and for something being wrong, and
the confirmation lists what goes, in nouns, before it asks.

## Consequences

1. The one thing in the project that cannot be undone is also the one thing with an end
   to end test: a space erased while the other one keeps its records, and a database
   taken off the device that is still gone after a reload.
2. Eighteen conformance cases across the adapters count rows in the tables themselves
   rather than asking a repository, because a repository that hides a row and a database
   that no longer holds it look identical from the outside, and that difference is the
   whole point here.
3. `packages/storage/src/adapters/sqliteWasm.ts` gained `wipeSqliteWasmOpfs`, and the
   pool is now installed once per worker rather than once per open, because installing it
   twice under the same name is an error.
4. `spaces.remove` is untouched. It still marks a space deleted so the deletion can
   travel, which is a different job from this one. Somebody who wants the rows gone now
   has a place to go, and the sweep above catches what the old path left behind.
