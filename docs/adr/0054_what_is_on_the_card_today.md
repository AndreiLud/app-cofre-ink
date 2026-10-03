# 0054. What is on the card today, said once and kept with its day

Date: 3 October 2026

## Status

Accepted. Revises decision 4 of the request for 1.1.0, which wrote a voucher down with no
opening balance at all, and amends registry 0043. Carries out decision 3 of 2.0.0.

## Context

Since 1.1.0 a voucher is written down empty, and what is on it is worked out from the
allowance. For a card that has been in somebody's pocket for a year that is a guess: the
allowance of this period, when the card in fact carries several months of what was not
spent. Somebody who knows the figure had nowhere to put it.

## Decision

The form that writes a voucher down, and the one that corrects it, ask "how much is on the
card today", only for a card whose leftover carries. The field may stay empty.

Given, it is kept with the day it was given, in a column added by migration 0018, and
counting starts there: that figure, the landings after that day, and what happened from
that day on. Said again later, it counts from the later day. Empty, the allowance of the
period the card is written down in is what it holds, and every purchase dated in that
period counts against it (registry 0053).

A card that resets does not take it. What was there is taken back on the next landing, so a
figure for today is true for the rest of one period, and the allowance of the period says
the same thing better. The repository refuses it there.

A voucher written down by release 1.0 has an opening balance and no day: it was true on the
day the card was written down, and it goes on being the starting point. Its edit shows that
figure in the new field.

## Consequences

A card with a long history shows what is on it from the day somebody says so, and the
edit only moves that day when the figure is changed.
