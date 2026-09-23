# ADR 0021: A web application, and one that tidies itself

**Status:** Accepted. Supersedes the shell of registry 0020 and the manual fold of
registry 0018.
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Two decisions of the owner arrived together, and they turn out to be the same decision
said twice: stop asking the person to do the application's work.

Registry 0020 wrapped the same build in a Tauri crate so it could be a program with an
icon on a computer and on a telephone. Registry 0018 folded the change log when somebody
pressed a button, on the argument that rewriting history is the sort of thing a person
should say yes to.

The owner asked for neither. Cofre is to be a browser and a server, and the file is to
stay small without anybody being told what a change log is.

## Decision

### The product is a page a browser opens

`apps/desktop` is deleted: the crate, the configuration, the icon formats that only a
desktop bundler wants, and the line on the settings screen that offered to install
anything. There is no second application to keep in step with the repository layer, no
second toolchain in the way of somebody cloning this, and no screen that has to explain
that a drive cannot sign you in inside a shell.

What stays is the service worker, because it belongs to the page and not to any shell.
Cofre still opens with no connection, and a browser that offers to put it on a home
screen is still welcome to. Nothing in the interface asks for that.

### Housekeeping happens by itself, and says nothing

`tidySpace` folds the settled part of a log and gives the empty pages back to the file
system. It runs at most once a day, and the mark the space already carries, the one
registry 0018 introduced for replication, is what says whether today's pass is worth
running. No new column and no new kind of time.

In the browser it runs after the first screen has painted, on an idle callback: somebody
opening the application is waiting for their balance, not for housekeeping. On a server
it runs on the hour, over every space, and one space with a problem does not stop the
others.

It is silent on purpose. Nothing it does is visible in the product: no row changes, no
amount moves, nobody gains or loses access to anything. A message about it would be a
message about the inside of the software.

### Nothing here compresses anything, and that is the point

The owner asked for the data to be compressed so a database does not grow heavy after
years. The honest answer is that the growth is in the **number** of log entries and not
in the bytes of each one. A payload is a few hundred bytes of JSON; gzipping one of
those often makes it larger, and storing the result would need a binary column in three
engines and a migration to match.

So the compression is the fold, which removes entries rather than shrinking them, and
then `VACUUM` on SQLite, which is the only thing that makes a file on disk actually
smaller after a delete. PostgreSQL does that on its own and is not told to. What travels
over a wire is still gzip, which registry 0018 decided and which remains right, because
a bundle is the same twenty words over and over.

Lossless, in the sense that matters: every record, every amount, every date and every
identifier comes out of a fold byte for byte the same. What is lost is the intermediate
versions of rows older than a month, which nothing in the product reads.

## Consequences

1. Four modes become two that are real, the browser and a server, plus a cloud which is
   a server somebody else runs. Registry 0020's claim of a shell is withdrawn rather
   than left in the repository as an unbuilt promise.
2. A database that is left alone for a year is roughly the size of its data rather than
   the size of its history, and nobody had to know.
3. The permission check that guarded the manual fold is gone with it. `tidySpace` takes
   none, deliberately: it is the database looking after itself, not an operation on a
   space, and the caller is the application starting up.
4. If a household ever needs to replay a row's history before the cut, it reads it from
   a backup, which is a full copy and not a log.
