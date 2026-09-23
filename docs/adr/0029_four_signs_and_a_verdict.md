# ADR 0029: Four signs and a word for the state of the money

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

The overview has a panel called "what needs attention", built on the findings engine of
[ADR 0022](0022_reading_the_figures_back.md). It shows the heaviest few and had a button
that made the list longer in place.

The owner asked for that button to lead somewhere instead: a section under planning with
a full financial advisory worked out from the data.

Two things had to be settled before writing any of it.

**What a longer list is worth.** Twelve lines instead of four is not an advisory, it is
the same screen with more scrolling. What somebody wants before reading a list of
findings is the question the list does not answer: what shape is my money in.

**What the word "advisory" is allowed to cover here.** Recommending where to put money
is a regulated activity performed by licensed people, and a program that guesses at it
while sounding certain is worse than one that does not try. ADR 0022 already drew this
line for the findings. The new screen sits closer to it, so it is drawn again, in the
code, in the copy on the screen, and here.

## Decision

### Four signs, each a ratio between two figures that are on another screen

1. **What is left over.** What comes in in an ordinary month, minus what goes out, as a
   share of what comes in. Good at 20 per cent, poor under 10.
2. **The reserve.** Money on hand, in months of ordinary spending. Good at three months,
   poor under one. Investments are not money on hand, which the snapshot already knew.
3. **Due right now.** What falls due in the next fifteen days against what is there to
   pay it with. Good at half of it, poor above all of it. Owing something with nothing to
   pay it from is poor whatever the arithmetic rounds to.
4. **Already spoken for.** What repeats every month, as a share of what comes in.

The fourth one was written first against spending rather than income, and the
demonstration data caught it: every peso that household spends repeats, so it read 100
per cent, poor, and dragged a comfortable household to "tight". Rent, power and the shop
are most of an ordinary month and all three repeat, so measured that way the sign is poor
for anybody tidy. Against income it says something worth knowing, which is how much of
the month is decided before anybody decides anything. It is a test now.

Every line is drawn in a named constant, every sign carries the figures it was made from,
and each one says whether more is better, so a table can be drawn from the data alone.

### A sign nobody can read says so

Three of the four need three months of records. They come back as `unknown` with a
sentence about what they need, rather than being left out of the table or shown as a
zero, because a row missing from a table is a row somebody wonders about.

### The verdict is a rule, not a score

Any sign poor and the money is tight. Every sign readable and good and it is
comfortable. Anything else is steady. Nothing is weighted, because a weight is an
opinion wearing arithmetic.

A problem is said out loud whenever it can be seen, including in the first week: nothing
on hand and a bill due on Friday is tight on any day. Saying all is well is held to a
higher bar and needs every sign readable. A household nobody can see yet is told that,
and not that it is fine.

### The screen is called a check up, not advice

In Portuguese, "Diagnóstico". It states the verdict, shows the four signs with the line
each is measured against, orders what to do first by money at stake with a link to the
screen where each is dealt with, lists everything the figures said, and closes with two
paragraphs: how it was worked out, and that it is not investment advice.

The overview's button now says "see more" and leads here. The list on the overview stays
at four lines and no longer grows.

## Consequences

1. `packages/core/src/advice/reading.ts` is pure arithmetic with no database and no
   framework, next to the findings it reuses. The thresholds are exported, so a reader
   can see where every line is drawn without reading the functions.
2. One round trip: `advice.reading()` returns the verdict, the signs and the findings
   from a single snapshot, which is the expensive half of the work.
3. The four signs are a claim about what matters, and unlike a finding they are shown
   even when there is nothing wrong. That is the point of them, and it is also the risk:
   a line drawn in the wrong place is now on a screen every month rather than only when
   something happens. Each one is a named constant with a test for both sides of it.
4. Nothing here recommends an investment, and the screen says so where somebody reading
   it can see it, not only in this file.
