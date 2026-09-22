# ADR 0011: Reading a record from one line of text

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Most records are written in a hurry: standing at a counter, walking out of a shop,
remembering something in bed. A form with five fields is five chances to give up, and
an app nobody writes into is an app that lies about everything else, because the
numbers are missing half the money.

So the product takes a line like `ifood 42,90 ontem nubank` and turns it into a
record. Three things had to be decided before that could be trusted.

## Decision

### It says what it understood, before anything is written

The reader returns a reading, never a record. The screen shows that reading back in
plain words, the button writes it, and what is missing is named rather than filled in.
`readQuickEntry` in `packages/core` has no side effects and no knowledge of storage,
which is what lets it be tested with a property test over arbitrary text.

The alternative, writing straight from the line and letting the person fix it
afterwards, is faster by one click and wrong in a way that is hard to notice: a value
read as 4290 instead of 42,90 sits in a list looking like any other row.

### Ambiguity is left open, never guessed

A word that names two accounts leaves the account unset, and the screen falls back to
the first account and says so. A line with no amount is refused with a reason. The
only thing the reader assumes is the day, which defaults to today and is shown.

### The rules it does apply are written down

1. The amount is the first thing in the line that reads as a number. A leading plus
   makes it income, a leading minus makes it an expense, and the value stored is always
   positive because the direction lives in the kind.
2. A day written as day and month belongs to this year, unless that would put it more
   than half a year into the future, which means it was last year. Bills fall due
   months ahead, so the future alone is not suspicious.
3. A day that has not arrived makes the record planned, whatever else the line says.
4. A linking word such as `no` or `de` is dropped from the description only when what
   follows it was read as something else. So `no nubank` loses the `no`, and
   `pao de queijo` keeps the `de`.

Portuguese and English words live in the same vocabulary, so nobody has to switch
language to write `uber 30 today`.

## Consequences

The reader is the first piece of the product that guesses at all, and it is the
easiest to widen later: recurring bills, categories and payees are all words in the
same line. Statement import in phase 7 will reuse the money parser but not this one,
because a bank file has columns and needs no guessing.

Anything the reader gets wrong is visible before it is written, and every record it
writes can be taken back in one click from the same place it was typed.
