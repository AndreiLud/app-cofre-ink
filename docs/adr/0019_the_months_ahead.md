# ADR 0019: The months ahead, and the money put aside

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

Everything the application had done until now was about money that has already moved.
Phase 8 is about money that has not: what the next twelve months look like, what changes
if something changes, what an amount put aside becomes, and what is already put aside.

This is the part of a finance application where products lie. A number appears, it is
called a forecast, and nobody can say where it came from. The rule for this phase was
decided before any of it was written: every number on these two screens has to be
something the owner can take to pieces.

## Decision

### A month is three sources, kept apart and never added twice

`project` builds each month out of three things and reports them separately:

1. **Written.** Records that already exist with a date in that month. Not a guess.
2. **Recurring.** Series that fall due in that month and have not written their record
   yet. A series that already wrote it is in the first group, and counting it here as
   well is the single most common way a projection goes wrong. The record carries
   `recurrence_id`, so the question is answered exactly and not by matching amounts.
3. **Habitual.** The median of the last months, minus the two groups above, floored at
   zero. It is what is left of ordinary life once the things we already know about are
   removed.

The median and not the mean, because one dentist does not make a year.

### A scenario is an adjustment applied to the projection, not a second projection

A scenario is a name and a list of adjustments, each one a category and either a
percentage or an amount, stored as JSON on the space. `applyScenario` takes a projection
and returns a projection. It is a pure function, it runs in the browser, and turning a
scenario on and off changes nothing that is stored. `firstShortfall` then answers the
only question a scenario is really asked: in which month does this run out.

### Interest is arithmetic with a ceiling

`packages/core/src/plan/interest.ts` is compound interest and nothing else: a yearly rate
becomes a monthly factor by the twelfth root, `futureValue` and `monthsToReach` are the
two directions of the same formula, and `independence` is the amount whose safe
withdrawal covers a month of spending.

Every function passes through `capped()`, because a person will type three hundred
percent to see what happens and an integer of cents that passes the safe range silently
becomes a lie. A number that would pass the ceiling comes back at the ceiling.

### Prices are typed by hand, indices come from the Banco Central

A holding is a quantity and a series of prices the owner typed, with the quantity held at
eight decimal places so that a fraction of a share or of a coin is exact. There is no
price feed: every free one dies, every paid one needs a key, and a key in a clone of this
repository belongs to somebody else.

Indices are different, because they are public and they are one number a month. CDI,
Selic and IPCA come from the SGS service of the Banco Central, series 4391, 4390 and 433,
and are kept in `index_rates`, which is the one table in the schema with no `space_id`:
inflation is not personal. They are cached, so the comparison works with no connection,
and they are fetched only when the owner asks, because nothing leaves the device on its
own.

## Consequences

1. Two screens, and both of them show their working. A month in the projection can be
   opened into the three groups that made it, and the comparison against the CDI is the
   same arithmetic applied to the same dates.
2. The projection needs history to be worth anything. With one month of records the
   habitual part is that month, which is honest and not useful, and the screen says so.
3. `index_rates` being global means it does not replicate. A second device fetches it
   again, which costs one small request.
4. Prices by hand means the portfolio is as fresh as the owner's patience. The screen
   shows the date of the price it used, next to the value it produced.
5. A scenario is cheap to add and cheap to delete, and none of them touch a record.
