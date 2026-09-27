# 0038. A month in three numbers

Date: 27 September 2026

## Status

Accepted. Adds a second way in to the model registry 0010 describes, and changes nothing
about it.

## Context

Everything in this application is built on somebody writing down what they spend. Phase 2
made a record fast to write, phase 6 made a statement readable so a bank could write them
for you, and registry 0011 made a whole record out of one line of text. All three answer
the same person: one who keeps a ledger, or is willing to be handed one.

Plenty of people are neither. They will not log a coffee, they will not import a
statement every month, and a month of records that stops on the fourth is worse than no
records at all, because every screen then reads a half month as a cheap one. For them the
application opens on a balance that is wrong, a check up that scolds them for a saving
rate it cannot see, and a projection built on nothing.

But those same people do know three numbers, because the bank and the card tell them
without being asked: what came in, what went out, and what the card invoice was. Somebody
who never writes down a single purchase can still say, at the end of September, that five
thousand came in, that two thousand two hundred left the account and that the card asked
for eighteen hundred. That is enough to answer most of what this application exists to
answer: whether there is money left, whether it is better or worse than the month before,
how much of the income the card eats, and what next year looks like at this pace.

What it is not enough for is anything that needs a category or a day: which sort of
spending grew, what falls due on Thursday, whether the supermarket is over its limit.
Those screens stay empty, and that is the honest trade.

## Decision

### Three fields, on a screen of their own, beside the list

A screen inside the records section, next to the list, the invoices and the calendar. It
asks for a month and three amounts: what came in, what went out apart from the card, and
what the card invoice came to. Nothing is turned on and nothing is turned off. It is a
second door to the same room, and somebody can use it for one month, the list for the
next, and both in the same month.

There is no simple mode. A mode would mean a second application inside this one, with
every screen having to know which of the two it is in, and with a moment where somebody
turns it off and finds out what it was hiding. A screen has none of that: what it wrote
is still there when nobody opens it again.

### What it writes are ordinary records

Three rows in `transactions`, one per number, exactly the rows somebody would have
written by hand. Income and spending go to an account the person picks, the card one to
the credit account.

This is the whole of the design. Nothing downstream is told these three are special: the
balances add them up, the rules may sort them, the reports count them, the invoice screen
shows the card one, the projection reads that month like any other, the backup carries
them, the change log replicates them, and a person can open any of the three in the list
and change it as they would change a supermarket receipt.

The alternative, a `month_totals` table holding a summary, was rejected. Every screen
that already knows how to read a record would have to be taught to read a summary too,
the two would have to be kept from being counted twice, and any screen that was not
taught would be quietly wrong. The cost of writing records instead is that three rows
carry amounts nobody itemised, which is exactly what they are said to be on their face.

### The last day of the month, and the last day of the invoice

A number that covers a whole month is written on the last day of it. Every report that
asks about a month asks from its first day to its last, so the record is always inside
the range, and a date in the middle would claim the money had all gone by then.

The card is the exception, because its record has to land on the invoice of that month
rather than in the middle of the next one. It is written on the last day that invoice
still takes, which is the closing day minus one, or the last day of the month before when
the card closes on the first. Working that out was how the fault in `invoicePeriod` was
found and fixed in the same release.

### A mark, so a month typed twice is corrected

Each of the three carries `mes:2026-09:income` in `external_id`, which is the field that
already exists to say whether a row here and a row arriving are the same thing. Typing
the same month again updates those three rows. Clearing a field removes its row, because
an empty field means the month has no such number, not that the number is zero.

A bank never writes an identifier that looks like this, and a record written by hand
carries nothing there, so this screen never touches a row it did not write.

### It says what is already in the month

The one way somebody gets a wrong answer here is by writing four records by hand and then
typing the whole month as a total, which counts those four twice. So before the fields the
screen says how many records the month already holds and what they add up to, coming in
and going out. It does not refuse and it does not subtract: whether those four are inside
the total is a thing only the person knows.

## Consequences

1. Somebody who will not keep a ledger gets a balance, a trend, a projection and a check
   up that work, from three numbers a month.
2. Every screen that reads records keeps working with no change at all.
3. The screens that need a category or a day are empty for them, and stay empty. The
   check up will say there is nothing sorted, which is true.
4. Three rows in a space may be totals rather than purchases. They say so in their
   description and they behave like any other row, including being editable and being
   deleted with the rest.
5. A person who uses both ways can count the same money twice. The screen says what is
   already there, and cannot do more than that.
