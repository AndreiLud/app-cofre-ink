# ADR 0030: A plan with a month on it, and a target they have already hit

**Status:** Accepted
**Date:** 23 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

[ADR 0029](0029_four_signs_and_a_verdict.md) built the check up: four signs and a word
for the state of the money. The owner asked it to go further and act as an advisor,
because using somebody's own figures to actually help them is the point of the project.

A state is not help. Somebody told their reserve is thin already knew that. What they do
not know is how many months it takes to fix, what it costs each month, what has to wait
while it happens, and where the money would come from. All four of those are arithmetic
over records they already wrote down.

## Decision

### A plan is a sequence, not a list

Every step is funded by the same money, so each one starts when the one before it
finishes and carries the month it lands in. A screen showing five things to save for at
once, each with its own monthly figure, is describing a household with five incomes.

The order is: what is already owed, then one month of cover, then three, then the goals
they set, by the date they set. **This is the only opinion in the feature**, it is stated
on the screen, and the reason is that a household with no cover pays for the next bad
week with a card, which costs more than any goal earns.

What is already owed carries no date, because it is due this week and not out of next
month's surplus.

### A month that does not close dates nothing

Every date is made of one number: what an ordinary month leaves over. When that number
is zero or less, the steps still show what they cost, none of them carries a month, and
the first step becomes making the month close. Putting a date on a plan funded by a
surplus that does not exist would be the most confident thing this code ever said.

### The only honest target is one they have already hit

Where the screen points at somewhere to spend less, the number is their own cheapest
month in that category, out of the months behind. Never a share invented here, never a
figure from somebody else's budget.

A quarter off the shopping is someone else's number and reads as a telling off. The
least they actually spent in a month is a number they have already lived, once, without
being told to, and the gap between that and their usual month is a target with evidence
behind it. A category that never moves says so instead, which is its own useful fact:
that is a fixed cost, and the lever is elsewhere.

It understates on purpose. A category with no spending at all in a month leaves no row
behind, so the quietest month it can see is the quietest month they spent anything.

### Two findings were retired from this screen

`thinReserve` and `lowSavingRate` say what the signs and the plan now say with an order
and a month on them. They stay on the overview, which has neither. Saying the same thing
three times on one screen is how a screen stops being read.

## Consequences

1. `packages/core/src/advice/plan.ts` is pure arithmetic with no database and no
   framework. `readingOf` composes it with the signs and the findings over one snapshot,
   so every figure on the screen was read from the same records at the same moment.
2. The dates move when the records move, which is correct and will still surprise
   somebody. The screen says the arithmetic assumes the months ahead look like the
   months behind.
3. Writing the first test for the plan turned up a real defect next door: a goal created
   this morning was reported as stalled, "nothing has gone in for nought days", because
   the findings measured from the last time money went in and nothing ever had. A goal
   now measures from the day it was set up when it has never been fed, which needed
   `createdOn` on the goal line and a row in the gatherer.
4. Still nothing here about where to put money, and the screen still says so.
