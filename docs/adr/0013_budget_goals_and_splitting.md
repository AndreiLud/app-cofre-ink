# ADR 0013: Limits, goals and the division between people

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Phase 4 is where the app stops describing the past and starts taking part in the
present. A limit is a decision made in advance. A goal is a decision about later. A
division between people is a decision two people have to agree on, which is the one
place in a personal finance app where being wrong by one cent turns into an argument.

## Decision

### One table holds every kind of limit

A limit sits on everything, on a level of priority or on one category, and that is one
row with a scope. Envelope budgeting and the method that splits spending by how much
it was needed are then the same feature seen from two angles, and neither needs its
own screen or its own table.

A limit with no month holds every month. A limit written for one month wins over the
standing one for that month, which is how a December that is not like other months is
said without inventing a second concept.

### A limit reports the rest of the month, not only the past

Forty thousand spent on the third of the month and forty thousand spent on the twenty
eighth are different facts, and a bar that fills the same way in both cases is
decoration. `progressOf` takes the day of the month and says whether what is left will
hold at the current rate: comfortable, tight, or over.

### A goal is the balance of an account

No parallel ledger of contributions to keep in step with reality. A goal points at the
account its money sits in, and what has been saved is what is in that account. Moving
money into the account is the contribution, and there is nothing to mark by hand.

The cost is that one account holds one goal at a time, otherwise the same money would
count twice. The repository refuses the second one rather than showing two goals as
nearly done.

### Settling up is not a transaction

Paying somebody back does not change what the house spent. It changes who is holding
the bill. So a settlement is its own row, never appears in a report about spending,
and can be undone without touching a single record of money.

The division itself lives in `expense_splits`: one row per person per expense, in
integer minor units, adding up to the expense exactly. `divide` in the core package
does the arithmetic with the largest remainder method, and a property test says the
parts always add up to the total, whatever the amount and whatever the shares.

`settleUp` produces the fewest payments that clear every balance, and a property test
says every balance ends at zero.

### What somebody earns is data of theirs, kept for one purpose

Dividing in proportion to income needs the incomes. They live on the membership, only
the person themselves or whoever runs the space may set one, nothing else reads the
column, and it never appears in a report. Nobody has to fill it in: without it, the
other two ways of dividing still work and the third says plainly why it cannot.

### Notices are computed, never stored

What needs attention is worked out from what is already true. Nothing is written, so a
notice cannot go stale, cannot be marked as read and then be wrong, and cannot pile up
into a list nobody opens. When the reason disappears, so does the notice.

`noticesFor` in the core package decides what is worth saying and how loud, and the
wording lives in the interface, in both languages.

## Consequences

The unique constraint on a division had to be dropped. A soft deleted row stays behind
as a tombstone, so dividing the same expense a second time collided with a share that
was already gone. The repository keeps one share per person, and the conformance suite
checks it on every engine. This is a general lesson for this schema: uniqueness and
tombstones do not mix, and the repository is where uniqueness lives.

Phase 5 draws the charts, and it has real numbers to draw: a limit and what was spent
against it, a priority and what it cost, a goal and how far along it is.
