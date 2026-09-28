# 0040. A server of theirs is not a destination

Date: 28 September 2026

## Status

Accepted. Amends registry 0017, which listed the places a copy can live, and registry
0036, which built the thing that keeps one up to date.

## Context

The automatic backup offered three places: a server of theirs, an online database, a
WebDAV folder. Reading the code against the documents afterwards showed that one of the
three had never worked the way the documents said, and could not be made to without
answering a question the model does not have an answer for.

It never ran on its own. The loop that fires on every change, when the application opens
and on a clock skipped a server destination outright, and only the button ran it. The
panel did not know that: it reported the backup as on, named the server as the place, and
offered the schedule, none of which was true for that one choice.

Pressing the button did not work either. The spaces go in the order the list gives them,
which is the personal one first, and a server refuses a second personal space for an
account that already has one, which every account made through the interface does. The run
stopped on the first space, so no shared space ever reached the server, and the refusal
arrived after the space row had already been written, leaving a space on the server with
nobody in it. The one message written to explain that could not be shown, because the
error carried no rule for the screen to test.

Each of those is fixable on its own. What is not fixable by the same hand is the
difference underneath them: the other two places hold a file that this device writes,
reads back and compares, entry by entry, and stops to ask when both sides moved. A server
does not hold a copy of the spaces. It holds the spaces, and merges them record by record
with whoever else is writing. That is not a backup, it is the other half of server mode,
and the panel was offering it under a heading that promised the first thing.

The personal space is where the two meet and cannot agree. A copy in a folder carries a
personal space happily, because it is a copy. A server cannot take a second personal life
for one account, and it should not: registry 0017 already says a personal life moves
between devices as a backup and not as a sync.

## Decision

`DestinationKind` is `"webdav" | "database"`. A server of theirs is not one of the places
the automatic backup writes to, and the picker does not offer it.

The paths that existed only for it go with it: the address and sign in fields in the
panel, the branch in the run, and the two sentences written for its refusals. A browser
still carrying the word "server" in its settings reads back as nothing chosen, which is
the same door registry 0036 already built for Dropbox, for Drive and for the file.

What somebody who wanted that does instead is one of two things, and both already exist.
Run in server mode, where the data is on the server, several devices meet in one space and
several people share one. Or keep the copy in a folder or a database, which is a copy and
behaves like one.

### What this costs

Somebody keeping their data in this browser and also running their own server has no
button that pushes one into the other. They move it with a backup: download a copy here,
restore it there. That is one action by hand instead of a copy that keeps itself, and it
is what was really on offer before, minus the parts that did not work.

The route on the server that exchanges a change log is untouched and still tested. It is
what server mode is built on. Only the browser side that spoke to it from the data screen
is gone.

## Consequences

1. The automatic backup now does on both of its places exactly what the documents say: it
   runs on every change once the typing stops, plus the two the person asked for.
2. Nobody is shown a backup reported as on that never runs.
3. The three faults found in the server path are gone with the path, rather than fixed one
   at a time in a corner nothing else uses.
4. A person who had picked a server finds the backup off and nothing chosen, with their
   data untouched. The panel asks them to pick one of the two that are left.
