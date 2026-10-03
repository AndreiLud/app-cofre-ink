# 0049. Reading a month of three numbers back

Date: 2 October 2026

## Status

Accepted. Extends registry 0038, which decided that three numbers are a complete way to write
a month down, and adds what the product says back about one.

## Context

Registry 0038 gave a household that will not keep a ledger a way in: what came in, what went
out, what the card charged. Three fields and four records, the fourth being the payment of the
invoice that registry 0039 added, and every other screen reads them because they are ordinary
records.

What the screen then said about the month was the three numbers, their difference, and a count
of whatever had been written by hand in the same month, with its two totals, so the money was
not counted twice. That is all. So the one question the three numbers exist to answer, which is whether this month was a
normal one, had no answer on that screen or anywhere else that a household typing three numbers
would look: the check up reads categories they do not have, and the reports screen draws charts
of a month that is three records.

Three readings were asked for. Each of them can be got wrong in a way that is worse than not
having it.

## Decision

Three readings, all worked out in `packages/core/src/entry/monthReading.ts` with no framework
import, none of them holding a word of copy, and none of them adding up a figure another screen
owns, which is the rule registry 0044 set.

**This month against the middle of the closed months before it.** The median of up to six, and
never fewer than three: the middle of two months is not a usual month, and the block says so
with the count rather than averaging what it has.

The verdict waits for the month. A month three days old has spent almost nothing, and a screen
that reads that as thrift tells a household it is winning on the third and leaves it to find out
on the thirtieth. So a verdict is stated when the month is over, or when it is the month today
falls in and four fifths of it has gone, and otherwise both figures are shown with a sentence
saying it is too early to say. That line, four fifths, is the one the check up already draws for
the same reason, and it is now drawn once in `MONTH_MOSTLY_GONE` rather than in each of them.
This is the one way this reading can do harm, and the restraint is the design.

**What the month went on, out of the records that are not one of the three typed totals.** The
share on each line is of that whole, which includes the line for money nobody sorted, so the
shares add up over the lines that are drawn. The three typed numbers
are deliberately not in that ranking. They carry no category, and a total somebody typed is not
a kind of spending: counted in, the block's top line says that ninety per cent of the month went
on nothing in particular, which is the typed total looking at itself. They are named apart
instead, as the amount of the month this ranking cannot see, and only when there is one.

(Corrected in 2.0.0: this said the shares add up over the lines that are drawn. The screen drew
five lines, and each share is of every line, so a month that went on more than five things
showed shares that added up to less than the whole with nothing said about the rest. Since
2.0.0 what is past the fifth line is one more line, "o resto", so the lines drawn add up to the
whole they are shares of.)

Money nobody sorted still gets a line of its own, as it does on the reports screen. A household
that has not sorted half its month should be told that rather than have it folded away.

This is the one new total in the three, and it exists because it answers a different question
from the reports screen's own sum: that one adds up every expense of the month including the
typed totals, which is right there, and this one leaves them out and says so. The block links to
Reports for the whole.

**Which limits the month is breaking, or is close to.** Read as a whole month, with no pace and
no projection. That is the decision rather than an omission: three typed numbers are a claim
about the whole of a month, and measuring them against how far through the month today is would
tell a household on the third that it is spending ten times too fast when all it did was say
what the month cost. Four fifths of a limit is close enough to say out loud, and a limit of
nothing is not a limit.

A limit on a category cannot see a typed total, which carries none, so when every limit of the
month is a category or a priority the block says so. Otherwise silence would read as safety.

**None of the three is drawn for somebody who only sees their own records.** Each is a household
figure, and narrowed to one person's rows it is a household limit measured against one person's
spending, which is worse than silence. Registry 0041 is what makes that answerable.

**Lists, not tables, and no boxes.** The screen has one table and keeps one. Registry 0023 does
not say that in those words: what it rules is one section title and one filled button per screen,
and the rest of it is about surfaces, line weights and colour. The one table is decided here, for
two reasons of this screen's own: the shapes below are lists everywhere else in the product, and
the browser tests locate the written records by asking for the table without naming it. The shapes are the ones the check up already
uses for its trend and its exposure.

## Consequences

The limits warning goes above the form and the other two below the table. A limit already broken
is the one thing somebody has to see the second the month is typed; a comparison is something
they read afterwards.

Saving the month now invalidates the reports and the budgets as well, which it did not, so the
three blocks are not stale about the month they are about.

The ranking reads the records the screen already fetched, which is capped at a thousand. A month
holding more than that is not ranked at all rather than ranked out of whichever thousand came
back, and a household typing three numbers does not have a thousand records in a month.

A card invoice is written on the last day of the invoice period, which for a card closing early
in the month falls in the month before. The comparison reads the reports screen's own grouping,
so it counts that invoice where the rest of the product counts it rather than inventing a month
of its own.

Two thresholds that were written twice each are now written once: four fifths of a month, and
the fifty units of currency under which a difference is not worth a sentence.
