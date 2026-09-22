# ADR 0026: A copy that is a database, and a screen ordered by how often

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Two things were wrong with the data screen, and they turned out to be the same thing.

The destinations a space could be copied to were a file, a server, a WebDAV folder,
Dropbox and Google Drive. The last two keep files. So does the first, and so does the
third. Every one of them therefore had to read a whole file, merge it and write it back,
and every one of them had to say something about what happens when two devices do that
at the same moment. Registry 0017 has a table of who can promise what, which is a table
nobody should have to read about their own money.

And the screen itself had six sections of equal weight, all open, every one of them
something a person does once a year or never. Somebody arriving to save a copy had to
read the whole thing first.

The owner asked for both: take the two drives out, integrate with something that is
actually a database, and make the screen simpler.

## Decision

### The destination keeps rows, not a file

A space is already a log: an append only list of changes, each one immutable, each one
carrying the stamp that orders it. A file destination throws that away, packs the log
into one blob and hands the blob around. A database does not have to.

`packages/cloud/src/libsql.ts` keeps the log as rows in two tables, `cofre_changes` and
`cofre_people`. Reading is a SELECT; writing is an INSERT of what the other side does
not have. Two devices appending to a log cannot lose each other's writes, whatever order
they arrive in, so there is no version to compare, no file to overwrite, and nothing for
the screen to warn about. It is the first destination for which `safeTogether` is true by
construction rather than by a header the service happens to support.

### libSQL over HTTP, which is not one vendor

It speaks the libSQL HTTP protocol: SQLite over a POST to `/v2/pipeline`. Turso answers
it, and so does a `sqld` somebody runs on their own machine. One destination, one
implementation, and the choice of who holds the data stays with the owner, which is the
whole stance of this project.

Checked before writing any of it: the endpoint answers a browser directly, with
`access-control-allow-origin: *`. No server of ours in between, which was the condition
for it being worth doing at all.

### Airtable, which was the example, does not fit

Not because it is not a database but because of two numbers: a thousand records per base
and a thousand API calls per month on the free plan. A year of records passes the first,
and one sync spends several of the second. It was ruled out on arithmetic.

### The screen is ordered by how often, not by what the code calls it

1. Where the data is, when it was last copied, and whether there is a copy anywhere
   else. That is the question the screen is really being asked, and it is answered before
   anything on it can be pressed. "Never" is in the one colour this interface uses for
   something being wrong.
2. The three things people actually do: save a copy, bring one back, read a statement in.
   One sentence each, saying what it does rather than what it is called.
3. Everything else behind two lines of text that say what is inside, in words somebody
   would use out loud. The one about keeping a copy elsewhere opens by itself once it is
   set up, because then it is not a rarity any more.
4. The zone that erases, last, in red, unchanged from registry 0025.

`Disclosure` is the native `details` element rather than a state and a button, because
the browser already gives that element a keyboard, a role, an announcement and a place in
the find on page, and every one of those is a thing to get wrong by hand.

### Reading a file back asks first

It writes into the space, so it says what it will do before it does it, and what it says
is the part somebody needs to hear: it only adds what is missing, nothing already here is
removed or replaced, and opening the same file twice duplicates nothing. That is what the
restore has always done. It had never said so.

## Consequences

1. `packages/cloud` loses `dropbox.ts`, `googleDrive.ts` and `oauth.ts`, and with them the
   only part of this project that asked somebody to register an application in somebody
   else's console before they could keep a copy of their own money.
2. The token for a database lives in this browser, like the WebDAV password before it.
   That is the same trade the project already made and says out loud beside the field: a
   token here is readable by anything that can run script on this page, and the
   alternative is a server of ours holding it, which this project will not do.
3. The store keeps, between a read and a write, the identifiers it saw. A bundle carries
   the whole log every time, and without that the cost of a sync would grow with the age
   of the space rather than with what changed. People are exempt from it: a log entry is
   written once and never again, a person can be renamed, and the first version of this
   file skipped them too, which meant a rename was never seen. The test that caught it is
   the one that keeps it caught.
4. What is not done: reading a space straight out of that database instead of syncing
   into it. The repository layer issues raw SQL and the dialect matches, so it is
   possible, and it is a different feature from this one.
