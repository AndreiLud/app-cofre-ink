# ADR 0015: Reading files in, taking everything out, and meeting a server

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Phase 6 is the one that makes the project's promise checkable. Until now the data was
in the application; from here it can arrive from a bank, leave in a file the owner
keeps, come back somewhere else, and meet a server so two devices agree.

Four things had to be decided: how a statement becomes records, what a backup is, what
happens when a backup lands in a database that already holds some of it, and how much
of the replication engine the browser is allowed to run.

## Decision

### Reading a file is a separate package, and it never writes anything

`packages/importers` reads CSV, OFX, QIF, XLSX and the application's own JSON, guesses
which column is which, and produces draft records. It has no database and no framework:
bytes in, records out. That is what lets the same reader run in the browser tab, on the
server, and in a test with a fixture file.

Reading never throws. A photograph, half a download, a spreadsheet of something else:
each comes back as a result with no records and a line saying it could not be read. A
screen can show that. A screen cannot show an exception.

### The person decides what is a duplicate

The reader marks what looks like a record that is already there and stops. When the bank
gave an identifier, the match is certain, the row arrives unticked and cannot be ticked.
When only the day, the amount and the start of the description match, it is a
suggestion, ticked, and the person may untick it.

That identifier is now a column on the records table, added by migration 0008, so the
same statement read twice does not become two months of spending. It is not unique in
the database: two banks hand out the same strings, and somebody who really wants the
same entry twice is allowed to have it.

### A file is written in one database transaction, or not at all

The import path does not call the ordinary create once per line. Three hundred lines
would be three hundred database transactions, and a failure halfway would leave half a
statement, which is worse than none: nobody can tell which half is missing. Every line
is checked first, then all of them are written together.

The rules of the space still run, so an imported statement arrives sorted the way a
typed record would be. A card gets its invoice month stamped the same way too.

### A backup is plain JSON, and it carries a space, not an installation

`exportSpace` writes the space and every row in it. Membership does not travel, for the
same reason it does not replicate: who belongs to a space is decided by whoever runs the
server, and a file that could grant a role would be a way to grant yourself one.
Whoever restores a backup becomes the owner of what they restored.

The file names the people its rows point at, by identifier and name only. No address,
nothing that would let the file sign anybody in, and enough for a restore to say who a
share belonged to.

### Restoring is decided per row, not per file

Three situations, three answers.

A row whose identifier is already in the space it belongs to is left alone. That is the
same file opened twice, and the second time changes nothing.

A row whose identifier is taken by something in another space gets a new identifier, and
everything pointing at it follows. That is a backup being restored beside its original,
which is what happens on a server where somebody else already has the same space.

A row that points at a person this database has never heard of is left out and counted,
never rewritten to belong to whoever is restoring. A share of an expense that says the
wrong name is worse than a share that is missing and reported.

A personal space goes back into the personal space the person already has, because
nobody has two.

### Sync is one button, in the browser, against a server of yours

The engine landed in the previous block and is the same on both ends. What phase 6 adds
is the browser side: an address, a sign in, and a button that says which space it is
about to send. Nothing syncs on a timer and nothing syncs on load, because the whole
point of browser mode is that the data is not going anywhere unless somebody says so.

### A device writes under a profile, and may speak for it

A browser that keeps its data locally has no account. It has a profile made on that
device, and every record it writes is in that name. The server has never heard of that
identifier, so the first rule of the protocol, that a device may push only what it
wrote itself, would have refused every push a browser ever made.

The rule is now this. A device may push what it wrote, as the account it signed in with
or as a profile it declares, and the server writes that profile down as somebody the
records point at. What it may never do is declare a profile that belongs to an account:
that is the line that stops a member of a shared space from putting words in another
member's mouth, and it is checked against the authentication tables rather than guessed.

### A space that arrives from a device is taken by whoever pushed it

Membership does not replicate, so a space born in a browser reaches a server as rows
with nobody in them. The push that carries the creation of the space is allowed to land
even though the caller is not a member yet, and then the caller adopts it and becomes
its owner.

A space that already exists on the server is a different matter: the caller has to be a
member of it, and a space that has anybody at all in it can never be adopted. Without
that, guessing an identifier would be a way to walk into somebody else's money.

### A report on paper is the same report

There is no PDF writer in this project. The print stylesheet turns the theme to black on
white, drops every control, keeps the tables and the drawings, and adds a line saying
which space and which month the page is about. The browser's own print dialogue saves it
as a PDF. A library that draws a second, worse copy of the same report would be a second
thing to keep in step.

## Consequences

The interface bundle grew by about fifty kilobytes, which is the zip reader that
spreadsheets need. It is loaded on every visit today and belongs behind a dynamic import
when the routes are split in phase 10.

`existing` reads at most five thousand records around the days a file covers. A person
importing ten years in one file will see fewer suggestions, not wrong ones.

The importers package has no way to read a PDF statement. That is phase 7, and it is a
different problem: recognising a document rather than parsing a format.
