# 0036. A copy that keeps itself up to date, and the one question it may not answer

Date: 27 September 2026

## Status

Accepted. Amends registry 0017, which chose where a copy can live, and registry 0035,
which put a copy in one place on the screen. The replication engine of registry 0003 is
unchanged and is what this runs on.

## Context

Registry 0035 put everything about a copy in one section and left four destinations
inside it, one of which was a file the person carries. That put a thing somebody does by
hand in a list beside three things a machine does on its own, and it left the product
with no answer to the ordinary question: can this keep a copy for me, without me.

Until now the answer was no, on purpose. Registry 0015 says nothing syncs on a timer and
nothing syncs on load, because the whole point of browser mode is that the data is not
going anywhere unless somebody says so. That reasoning is about consent, and consent is
satisfied by asking once rather than by asking every time.

## Decision

### Two halves, and the file is not a destination

A copy is made by a person or by a machine. The first is a file downloaded and kept, with
a button that writes one and a button that reads one back. The second is a place: a
server of theirs, an online database, a WebDAV folder.

The file store is gone. A destination is somewhere this application can reach by itself,
and a downloads folder is somewhere a person goes.

What that costs is real and is written down here rather than discovered later. Two
browsers with no server between them used to agree by carrying a packed change log back
and forth, which merged record by record. They now exchange a backup, which brings a
money life across and adds what is missing, but does not merge two people editing the
same record at once. Whoever needs that runs a server, which is what a server is for.

### Turning it on is the explicit action

The fifth golden rule stands and its wording is now precise: nothing leaves the device
without an explicit action by the owner, and switching this on is that action. After it,
a change is the reason it exists, so a change is not a setting. The two that cost a round
trip when nothing changed are settings, and both are asked for: when the application
opens, and every so often.

A change waits four seconds for the typing to stop. Somebody writing one record touches
the database several times in a second, and a copy that answered every one of those would
be a copy that spends its life uploading.

### It compares before it writes, and never by a date

Comparing two files by when they were written is the obvious way and the wrong one: two
devices that each wrote one record are both newer than the other, and whichever answered
last would win by a clock. Entries carry identifiers, so the question has an answer that
is not a guess: who holds something the other one does not.

Five answers. Nothing there yet, write. The same on both sides, write nothing at all. One
side ahead, send or receive. And both sides wrote since they last agreed, which is the
one a machine may not answer, because answering it means throwing away records somebody
typed.

### The question, and three ways out of it

Keeping both is offered first and is the default action, because the engine underneath
merges record by record and loses nothing. It exists as the answer rather than as the
behaviour, so that the person who wanted one side to win can still have that.

The two that lose something hand back a file of the side that is about to go, before it
goes: the packed log of the place, or a backup of what is here. Undoing is then the same
door as any other file, which is why this needs no undo of its own.

Keeping the copy that is over there empties the rows of the space here first and writes
the other side's log in their place, because anything short of that is the two of them
merged, which is the answer the person just said no to. Emptying a space without removing
it is a new method in the repository layer and asks for the role that pouring a whole
space in asks for, which is the same decision.

### A server of theirs is not compared

It keeps the exchange it has: change log in, change log out, merged record by record on
both ends. There the two sides are the same space rather than a copy of it, and a shared
space with two people writing at once is exactly what that engine is for. Comparing whole
files there would replace something that works with something coarser.

## Consequences

A person who wants their money kept somewhere else picks a place once, tests it, turns it
on, and stops thinking about it. The screen says on or off, where, and when it last
managed it, so a copy that has stopped working is visible rather than assumed.

What is not solved: a browser with nothing in it cannot find what a folder holds. The
places keep one file per space, named after the space, and a device that has never seen
those spaces does not know what to ask for. Bringing the data back to a new browser is
therefore still a file somebody fetches and restores, which works and is one step more
than it should be. An index at the destination would close that, and is not written yet.

The automatic path can never make a copy smaller: it writes the union of what both sides
hold, and the only way to write less is the answer a person gave with a file of the
difference in their hands.
