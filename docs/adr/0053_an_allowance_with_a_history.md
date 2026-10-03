# 0053. An allowance with a history, and one place that reads a voucher

Date: 3 October 2026

## Status

Accepted. Amends registry 0043, which made a benefit card an allowance with a day on it and
said the figure was exact from the next landing onwards. Carries out decision 4 of 2.0.0.

## Context

Registry 0043 worked out what is on a voucher from three numbers on the account: what lands,
the day it lands, and whether what is left carries. Every landing since the card was written
down was multiplied by the amount the account had today. So a raise from 900 to 1,000 after
ten landings added 1,000 to what was on the card at once, and the reports changed the income
of ten months already closed.

Two readings of a voucher existed, the line of the card and the benefit a report counts as
money that came in, and they gathered their figures apart. They disagreed about the day
counting starts: the line counted spending from the day the card was written down, the
report counted the allowance from the start of that period, and a lunch from earlier in the
same period was left out of one and paid for in the other.

## Decision

An allowance has versions. A change applies from its first landing after the day it was
made and never touches one that already landed, which is decision 4 of 2.0.0. The account
keeps the current version and the day it applies from, and the versions it replaced, each
with its own first day, in two columns added by migration 0017. Kept on the account rather
than in a table of their own: it is a handful of entries read whole with the account and
written with it, and as part of the row it travels, is backed up and is restored with no
second path for any of that.

Each landing is worked out with the version in force on its own day, one landing a month,
so a change of the day lands once in the month it changed.

What a voucher is read from is decided once, in `packages/core/src/accounts/benefit.ts`:
the versions, where counting starts, and what happened on the card with its day. Where
counting starts is `countingFrom`. With a figure somebody gave, that figure on its day, the
landings after it and what happened from that day on. With none, the allowance of the
period the card was written down in, and what happened from the first day of that period.
Storage gathers those three things in one module and both readings go through the core.

The backup format rises to version 2, once for the release, so that 1.x refuses a file of
2.0.0 as newer instead of quietly losing what 2.0.0 adds.

## Consequences

A raise shows on the day it lands, and a month already closed keeps the allowance it had.

The corrections that follow on vouchers, what was on the card on a day somebody says,
top ups, refunds and an income written on the card by hand, are movements and starting
points read in the same place, not a new sum somewhere else.
