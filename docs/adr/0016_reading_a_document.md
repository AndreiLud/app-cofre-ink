# ADR 0016: Reading a card invoice out of a PDF

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Every bank sends a PDF. Many send nothing else: a card invoice in Brazil often exists
only as a PDF, and the CSV, when there is one, covers the account and not the card.
Phase 7 is where the application stops asking people to type those in.

The question is not whether to read them. It is how much to promise.

## Decision

### Three layers, and the top one never writes

Bytes become lines. Lines become records with a confidence. Records go on the same
screen every other import uses, and a person says yes. Each layer is a separate file
and can be checked on its own, which is what keeps a change in the sign of an amount
from being a change in how a PDF is parsed.

### The PDF reader is written here, not brought in

The usual answer is the library that renders PDFs in browsers. It was turned down for
the same reasons the charts were: it is megabytes, most of which draw pictures this
application never shows, and the interface is meant to be installed on a phone and
opened offline.

What is needed is narrower than rendering. A PDF holds numbered objects; some hold the
instructions that draw a page; the instructions say where each run of glyphs lands. A
few hundred lines read that, and the parts this project does not need, which is most of
a PDF, cost nothing.

Three things in it are not optional and are the reason a smaller attempt fails. Streams
are packed, so they are unpacked. Modern files pack objects inside other objects, so
those are unpacked too. And a subset font numbers its glyphs from one, so the map the
file carries is read, without which a statement comes out as nonsense that looks like
text.

The objects are found by scanning for them rather than by reading the table at the end
of the file. That table is the first thing a damaged or partly downloaded file loses,
and the scan costs one pass nobody notices.

### A line that names a day and an amount is an entry

Everything else in the recogniser is deciding the sign, which is the part that can be
wrong, so it is decided in the order the evidence allows and every way of deciding
carries a different confidence.

A running balance in the last column settles it beyond doubt: the direction is the
direction the balance moved, and a statement that carries one is read almost perfectly.
A written sign is nearly as good. Words the document itself used, such as estorno or
salario, are good. A card invoice with none of those is a charge, because that is what
a card invoice is. A bank statement with none of those is the only case that is a
guess, and it arrives on the screen marked.

Nothing is inferred from position: a column at a certain distance from the left edge
means nothing, because the next bank puts it somewhere else.

### A receipt is not a small statement

One payment, labels with values beside them or under them, and an identifier the bank
will use again. It gets its own reader, and the identifier becomes the one that already
stops a record from being written twice.

### A PDF made of pictures is refused, loudly

There is no optical recognition here. A scan or a photograph has no text in it, and the
honest answer is to say so and to say what to ask the bank for instead. The alternative
is three megabytes of recognition engine that reads a photograph of a receipt at an
angle with an accuracy nobody should trust with money.

The seam is there for later: the layer above reads lines, and where the lines came from
is not its business.

## Consequences

The confidence on the screen is not decoration. Anything under two thirds shows the
line of the document it came from, so the person compares rather than trusts.

The recogniser has never seen a real bank statement. It was built against documents
written for the tests, which means it is general by construction and unproven against
any particular bank. The owner has anonymised statements to try, and what those show is
the first work of the next block: a hint per institution, recognised by the name in the
header, is a few lines each and changes nothing above it.

The interface bundle grew by about fifty kilobytes for the reader. It is loaded on every
visit and belongs behind a dynamic import when the routes are split in phase 10.
