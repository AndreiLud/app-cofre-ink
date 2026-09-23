# ADR 0031: Whether it is getting better, and the months already spent

**Status:** Accepted
**Date:** 23 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

The check up reads one moment: what shape the money is in today, what is wrong today,
what to do from today. The owner asked for the two things a person actually sitting with
an advisor would ask next, and for this to be what the project is for.

The first is whether any of it worked. Somebody who has been trying for three months
wants to know if the trying shows, and no screen in the product could say.

The second is the card. It is the one bill most households cannot predict, because it is
not a price anybody agreed to: it is a month of small decisions, totalled after all of
them are made. In Brazil it is also where the future gets spent, through instalments, and
nothing in the product said how much of the months ahead was already gone.

## Decision

### Two windows of the same length

The three closed months just gone against the three before them: what came in, what went
out, what an ordinary month kept, and what is on hand. Each one says which way it went
and nothing is scored.

Six months is not a preference. Three is the least that makes a median mean anything, and
this needs two of them; with five, one window is a habit and the other is a rumour. Below
six the panel is not drawn at all.

### A balance from before is walked backwards, transfers and all

The records hold what somebody has now, never what they had in June, so the earlier
balance is today's with every movement since undone. That is why the snapshot now carries
the monthly net movement of the accounts somebody spends from, and not only what came in
and what went out.

Counting only income and spending would be wrong in the one direction a tool like this
must never be wrong in: money moved into an investment leaves those accounts without
being spent, so the walk back would report a household that saved less than it did.

Both sides of the months of cover are measured against the same ordinary month, so what
moved is the balance and not the yardstick. A reserve that grew because spending fell is
true of the ratio and false of the money.

### The card says what is ordinary, and what is already gone

An ordinary invoice is the middle of the closed ones, as a share of what comes in, with
the newest one placed against it outside a band of noise. Then the part nothing else in
the product says: what instalments already bought take out of each month ahead, and the
month the last of it lands in.

There is no invented line about what share of an income a card ought to be, because there
is no honest one. The one thing flagged is derived and not decided here: **a month ahead
whose instalments already take more than an ordinary month leaves over is a month that
was spent before it began.**

Instalments are read by the day each part falls and not by its status. A purchase in six
parts is six rows a month apart carrying the status of the purchase, so a part dated in
February is money leaving in February however it is marked today.

## Consequences

1. The Snapshot grew three series: the monthly net movement, the closed invoices, and the
   instalments ahead. All three are gathered facts, and the arithmetic over them stays in
   `packages/core` with no database in sight.
2. `Progress` and `progressOf` were already taken by the budget, so this is `Trend` and
   `trendOf`. The compiler found it, which is the argument for `export *` over a barrel
   somebody maintains by hand.
3. The check up is now six panels. It is a report and reads like one, and each panel says
   in its title what it is, so the person can stop where they like.
4. Reading a balance from before is the first figure here that cannot be checked against
   another screen: nothing else in the product shows what June looked like. It is the
   piece most likely to be wrong, which is why it is walked from a single arithmetic that
   the balance itself is made of, and why a transfer to an investment is a conformance
   test on every adapter.
