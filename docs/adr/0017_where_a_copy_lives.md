# ADR 0017: Where a copy of a space can live

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Until now there was one way for two devices to agree: run a server. That is the right
answer for a family sharing a space, and it is the wrong answer for one person with a
laptop and a phone who will never run anything. The owner asked for the widest set of
choices that can be offered honestly, naming drives, online databases and even a
spreadsheet.

## Decision

### A file is the second shape of a peer

The engine from registry 0003 needs two things from the other side: what it has, and
somewhere to put what this device has. A server gives both in one request. A file gives
neither, and yet works, because the change log is a set of entries with identifiers and
folding it twice changes nothing. So a second engine reads the file, applies what is in
it, and puts the union back.

Everything below is that one engine with a different way of reading and writing a file,
which is why the guarantees are the same everywhere and only the plumbing differs.

### Five destinations, and each one says what it costs

**A file the person moves.** No token, no address, nothing to allow, nothing anybody
else can switch off. It lands in the downloads folder, and the folder they leave it in
is whatever they already sync: a drive, a network share, a memory stick. It is the
destination everything else is measured against, and the only one that cannot break.

**A server of theirs.** Already built. Still the best answer when more than one person
is involved, because it is the only one where membership means anything.

**A WebDAV folder.** Nextcloud, ownCloud, a Synology box, most hosting panels. It keeps
a version of every file and honours a write that says which version it expects, so two
devices saving at once is safe rather than lucky. Its problem is the browser: a server
that does not allow this page to call it refuses, and the screen says that is what
happened and what to do about it.

**Dropbox.** The one drive whose API was designed by somebody who had thought about two
devices writing at once: every file has a revision and an upload can name the one it
expects.

**Google Drive.** Convenient, and the file goes in the corner of the drive that only
this application can see. It has no version to check on upload, so the store compares
the time the file was last changed and refuses when it moved. That narrows the window
in which two devices can lose a write; it does not close it, and the screen says so
before anything is set up.

An online database was considered and turned down as a destination of its own. A
browser cannot hold a database connection, and the thing people mean when they ask for
one is already built: the server takes a PostgreSQL address, so a managed database is a
server of theirs pointed at it.

### A spreadsheet is a mirror, not a peer

Google Sheets is offered, and only in one direction. A spreadsheet has no identity for
a row and people edit them freely, so treating one as a source of truth is how a month
of records quietly changes. It is rewritten from the records each time, which is why it
cannot double them, and the way back already exists and is better: save the sheet as
XLSX or CSV and import it, with a screen to check it first.

### No secret of this project is involved, anywhere

Every one of these services wants an application to identify itself, and this project
cannot hold a secret: anybody can clone it. So the application is the owner's own, made
in their own account, and the sign in uses the flow designed for exactly this. The
browser makes a random number, keeps it, and sends only its hash; the code that comes
back is worth nothing without the number that never left the device.

The token that results is kept in this browser and nowhere else. That is a real trade,
and the screen says it next to the field: anything that can run script on this page can
read it. The alternative is a server of ours holding tokens for other people, which
this project will not do.

### A space that arrives is taken, once

Membership does not travel, so a space that arrives in a file has nobody in it, and
whoever read it becomes its owner. A space that already has anybody in it is never
adopted. The one case that is refused on purpose is the personal space of another
device arriving where the person already has one: syncing joins the same space in two
places, and two personal spaces are two different spaces. The way to move a personal
life between devices is the backup, which merges it, and the refusal says so.

## Consequences

A sync file holds the whole history of a space and grows with it. A few thousand
changes a year is about a megabyte, which no drive notices, and compacting old entries
is a later problem that must not be solved by dropping them: a device that has been
away for a year needs them.

The stores were written against services that answer the way the real ones do, in the
tests, and none of them has been run against a real account. What has been run, end to
end and in two separate browsers with nothing shared between them, is the file: a space
written on one side arrives whole on the other.

A browser calling a drive depends on that drive allowing it. Dropbox and Google do;
WebDAV servers usually do not until somebody configures them. The desktop application
of phase 9 has no such limit and is where this gets easier.
