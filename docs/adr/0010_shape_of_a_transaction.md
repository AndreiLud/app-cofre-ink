# ADR 0010: The shape of a transaction

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Everything the product does from here reads this table. Budgets, reports, projections,
the split between people and the statement importer all sum the same rows, so the
shape of one record decides how honest every number downstream can be. Three questions
had to be answered before any screen could be built.

## Decision

### A transfer is one row, not two

Moving money from the current account into savings is one thing the person did, and it
is stored as one record with an origin and a destination. A balance query adds it on
one side and subtracts it on the other.

The alternative is double entry: two rows, one negative and one positive, tied by an
identifier. It makes per account queries uniform, and it is what an accounting system
would do. It also makes it easy to count a transfer as income in a report, which is
the single most common way a personal finance app lies to someone about how much they
earn. With one row carrying a kind, a report that sums income simply never sees it.

The cost is that any query about one account has to look at two columns. That cost is
paid once, in the balance query, and the conformance suite checks the answer on every
engine.

### The amount is signed, and the sign comes from the kind

An expense is stored negative, income positive, and a transfer positive meaning "this
much left the origin and reached the destination". Sums are then plain sums.

What callers pass is always positive: the direction comes from saying what happened,
not from remembering a minus sign. A negative amount is refused rather than quietly
made positive, because guessing what somebody meant is how money ends up on the wrong
side of a report.

### A card purchase is stamped with its invoice when it is written

The invoice a purchase belongs to is computed at the moment it is recorded, from the
closing day of the card, and stored as a calendar month.

Computing it on every read would be tidier, and it would also be wrong: changing the
closing day of a card in March would move a purchase made in January onto a different
invoice, one that has already been paid. What closed stays closed.

The rule itself: a purchase before the closing day belongs to the invoice closing that
month, and a purchase on the closing day or after belongs to the next one. Issuers
differ by a day here, and this is the choice that never surprises someone by charging
earlier than they expected.

### Installments are real rows

A purchase in twelve parts writes twelve records, tied by a group identifier, each one
on its own date and its own invoice, and each one numbered in its description. They
add up to the purchase to the cent, by the largest remainder rule from registry 0004.

The alternative, one row with a count, would need every reader to expand it, which
means every report, every projection and every export gets the chance to expand it
differently.

## Consequences

Easier:

1. A report that sums income cannot accidentally count a transfer.
2. The invoice of a card purchase is stable, which is what makes a closed invoice
   trustworthy.
3. Each installment is visible on the month it will be charged, which is what a
   projection needs.

Harder:

1. Editing one installment of a purchase is not the same as editing the purchase. The
   group identifier is there for that, and the interface has to be clear about which
   one is happening.
2. A transfer between accounts in different currencies is not modelled yet. One row
   with one amount cannot express it, and it needs its own decision.
3. Balances are computed, not stored. At the size of one person's history that is
   fast, and it stays honest. If a space ever gets slow, a materialised balance per
   account and month is the answer, not a cached total.

## Action items

1. [x] Table, repository, rules and the conformance suite on three engines.
2. [x] Invoice cycle and installment planning in the core, with property tests.
3. [ ] Transfers between currencies, when multi currency gets real use.
4. [ ] Editing a whole installment group from the interface.
