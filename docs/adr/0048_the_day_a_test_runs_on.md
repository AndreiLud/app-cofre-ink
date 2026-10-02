# 0048. The day a test runs on

Date: 2 October 2026

## Status

Accepted.

## Context

Release 1.1.0 was tagged on 30 September 2026 with every check green: the readings, the unit
tests, the conformance suite on three engines, the build and one hundred and fifty nine flows
in a real browser. On 1 October, with nobody having touched a line of it, three of those tests
were red.

Nothing had broken. The tests had been written against the day they were run on.

This product is full of rules that depend on the day, and they are there for good reasons:

1. A series never writes a record for a month before the one it was written down in, which is
   the rule that stops a rent paid since 2019 arriving as six years of promises nobody made.
   So a test that starts a series six days ago and expects an overdue promise gets one only
   when six days ago is in the same month as today, which is to say from the seventh onwards.
2. The records screen opens on this month. The demonstration data is dated backwards from
   today, as far as sixteen days back, so for the first half of a month most of it is in the
   month before and the list a test looks at is nearly empty.
3. A card invoice closes on one day of the month and falls due on another, so which invoice is
   open, which has closed, and whether the next one falls due inside the fifteen days the
   overview looks ahead are all answers that change through a month.

A test that is red for a reason with no cause is worse than a test that is missing. It teaches
whoever reads the suite that red is weather, and the next real failure is read as weather too.

## Decision

**The browser suite runs on one fixed day**, set in `apps/web/e2e/support.ts` and applied by
the browser clock before the first page load, which is the one place every flow passes through.
The day is 28 October 2026, chosen so that two things hold at once: the demonstration data,
which reaches sixteen days back, all lands in the month the screens open on, and the open
invoice of the sample card falls due thirteen days later, which is inside the fifteen days the
overview looks ahead.

**A test that counts days counts from that day, never from the real one.** `onTheDay` and
`dayField` in the same module are how a test says "six days before" or "seventy days before",
because the dates in a test run in the test and the dates in the application run in the page,
and the two have to be the same day or the test is asserting against a mixture.

**A test that needs another day says so for itself** by setting the clock again. None does
today, and the ones that are about a day say which day in their own words.

**The conformance suite has the same problem and the same rule**, by other means: it has no
browser clock, so a test that materialises a series uses the month it is running in, read from
the same function the application reads it from, and derives every date in the test from that.
Fixed dates are still right wherever nothing consults the clock, which is most of the suite.

What this does not do is pretend the clock is not there. The application still reads the real
day, the timezone of the space still decides which day that is, and the one thing a test cannot
check this way is the turn of a month or of a year actually happening. Those are tested by
naming the dates in the arithmetic, in the core, where there is no clock at all: `daysToLanding`
crosses December, `periodOf` crosses February, and `daysStillToCome` knows how long a February
is in a leap year.

## Consequences

The suite says the same thing on every day of the month, and on any day of any year.

The three tests that were red on 1 October are green, and two of them were rewritten rather
than patched: one derives its month from the day the suite runs on, the other its start date.

A test that wants to see what the first days of a month look like now has to say so. That is
the right trade: it was previously impossible to say anything about which day a test saw.

One fragility came out when the data moved into the month the screens open on, and it is the
kind this change is expected to surface: a record of the demonstration data is called "Mercado
do mês", and the checkbox that selects its row is labelled with its description, so a field
looked up by the short label "Mês" began matching two elements. Field lookups by a short label
say that they mean the whole label now.

The day will have to move eventually, when 28 October 2026 is far enough in the past that a
rate, an index or a projection horizon written in the fixtures stops making sense beside it.
Moving it is one constant and a run of the suite, which is the point of there being one.
