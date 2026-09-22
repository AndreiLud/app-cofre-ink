# ADR 0022: Reading the figures back, and five ways in

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Until now Cofre recorded, sorted, limited and projected. Everything on a screen was
something the person had written or something arithmetic had done with it. What it never
did was say anything.

The owner asked for tips and suggestions, worked out by algorithms that read the data
and offer solutions to problems, financial or about saving.

This is where finance software usually goes wrong. A number appears, it is called
advice, and nobody can say where it came from. Or worse, it becomes a recommendation
about what to buy, from software that has no business making one.

## Decision

### Fifteen findings, each of which can be recomputed by hand

`packages/core/src/advice/findings.ts` takes a snapshot of a space and returns findings.
A finding is allowed to exist only when it passes three tests:

1. It can be recomputed by hand from the figures it carries.
2. It says something the person cannot see by looking at one screen.
3. It ends in something to do, or it is not worth a line on a screen.

They are: more went out than came in, a category well above or well below its usual
month, a budget passed, a budget being spent faster than the month is passing, what
repeats every month and what it comes to in a year, something that repeats and quietly
went up, the same charge twice, a reserve measured in months of ordinary spending, what
is left over as a share of what came in, an invoice larger than the balance, bills due
soon adding up to more than there is, a goal that stopped, rather more cash than the
next months need, and a month that went better than usual.

Two of the fifteen are good news, on purpose. A screen that only ever tells somebody off
is a screen they stop reading.

### The numbers are in the sentence, always

A finding carries the figures it was made from, and every sentence puts them in. "You
are spending too much on eating out" is not a finding. "Restaurante is 675 above its
usual month, which is 225" is, because the person can go and check.

The sentence lives in the interface and the arithmetic does not know any words, so the
same finding reads in Portuguese, in English, and as a row of numbers.

### Nothing about what to buy

Deliberately absent: what to invest in, which fund to hold, where to put money. This
reads a household's own spending and says what it found. Telling somebody what to invest
in is a different job, done by people who are licensed to do it, and software that
blurs the two is software that has picked up a liability it cannot carry.

The nearest thing to it, "rather more cash than the next months need", says exactly that
and stops: how much is beyond three months of cover, and that it is worth keeping apart
from day to day money. Not where to put it.

### The order is money at stake and never a score

Findings are sorted by weight, then by the amount of money involved. A budget passed by
two hundred comes before one passed by twenty. There is no invented number out of ten,
because somebody who reads three lines should read the three that matter and should be
able to see why those three.

### A median and not an average, everywhere

One dentist does not make a year. Every comparison against "usual" uses the median of
the months behind, the same one the projection of registry 0019 uses, and no category is
compared at all until there are three months to compare against.

### Five sections, and the findings land in the first one

Eleven links in a row was eleven decisions before the first one. The screens are grouped
into five by the question somebody came to answer: the overview, records, planning,
reports and settings. The screens inside the section you are in are on a second line
under it. The command palette still reaches every screen by name, so nothing became
harder to find for somebody who already knows what they want.

The findings go on the overview, four at a time, beside the notices about today rather
than on a screen of their own. A person who opens Cofre to see their balance is exactly
the person who should be told that a subscription went up.

## Consequences

1. `packages/core` gains the subsystem with the highest ratio of tests to code in the
   project: twenty seven against a snapshot written by hand, because every threshold in
   it is a judgement that somebody will want to argue with.
2. The snapshot is gathered by one repository that reads through the others rather than
   copying their arithmetic, so a budget means on this screen exactly what it means on
   the budget screen.
3. A new finding is a case in one function, a code in one union and a sentence in two
   files. Nothing else moves.
4. The thresholds are constants with names, in one place, and each of them is a
   judgement rather than a fact: fifty units of currency of noise, thirty per cent above
   usual, three months of reserve, ten per cent left over, sixty days for a goal to have
   stopped. They are written down so they can be argued with.
