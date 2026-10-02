# ADR 0019: The months ahead, and the money put aside

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

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

1. **Already certain.** Two things, and neither of them is a guess.

   Every record the opening balance has not already counted, which is exactly a day that has
   not arrived, whatever the record is marked, and a day that has passed with nobody saying
   it happened. The opening balance is what the accounts hold on the day the projection is
   made, so those two are what is left of the table, and together they are all of it.

   And what the cards will charge: for each card, what is left on each invoice, counted in
   the month its due day falls in. A card purchase is left out of the first half and counted
   only here, because it is money that leaves the bank on the day the invoice is paid and not
   on the afternoon of the purchase. An invoice that fell due before today and is still owed
   counts in the first month ahead, because there is no earlier month to put it in.

   Amended in 1.1.0, twice, the second time by the sweep before the tag. Until then the first
   half was records still waiting to be confirmed, which a card purchase never is, so none of
   what the cards were about to charge was in the months ahead at all. Widening it to planned
   records alone was still short: a record dated in a month ahead and written as a fact is
   not planned, and an opening balance that stops at today does not hold it either, so it
   appeared in no figure anywhere. That is what the later parts of a purchase in six are, and
   what a month filled in from the month screen before it arrives is.
2. **Recurring.** Series that fall due in that month and have not written their record
   yet. A series that already wrote it is in the first group, and counting it here as
   well is the single most common way a projection goes wrong. The record carries
   `recurrence_id`, so the question is answered exactly and not by matching amounts.
3. **Habitual.** The median of the last months, cut to the part of the month the opening
   balance has not already counted, minus the two groups above, floored at zero. It is what
   is left of ordinary life once the things we already know about are removed.

   The cut matters only for the month the reading is made in. The opening balance counts
   every record whose day has come, so the days from the first of that month up to and
   including today are already inside it, and a whole month of habit on top of them counted
   those days twice: the household's own salary, already received, was credited a second
   time, and the groceries already bought were charged again. What the first month adds is
   the median times the days after today over the days the month has: on the fifteenth of a
   month of thirty one days, sixteen thirty firsts of it, and on the last day of a month,
   nothing at all. A month wholly behind today adds no habit, because the opening holds all
   of it, and every month after the current one adds the whole median. `daysStillToCome` is
   the one place that measures this.

   Corrected after 1.1.0. The fault is older than that release, which fixed the same double
   count in the first group and left this one, and it was written down in the report of 1.1.0
   rather than quietly carried.

   What the cut does not do is spread a lumpy bill fairly. A household whose rent left on the
   fifth still carries rent sized money inside the prorated habit for the rest of the month,
   so the first month can still read high, by less. The sharper answer is the median minus
   what that month has actually spent so far, which needs a second read and overshoots the
   other way near the end of a quiet month. The share is what ships, because it needs no new
   read, it moves one way through the month, and somebody can recompute it in their head.

The median and not the mean, because one dentist does not make a year.

And of whole months only. The months behind were read as the window ending at the month before
the first projected one, which is right when a projection starts where the money stands,
because the month before this one is over. It is wrong for a reading that starts further ahead,
which the month on paper asks for: a report made on the fifteenth of September about the months
from November took September, eleven days old, and October, which had not happened at all. A
month of eleven days enters a median as a cheap month and drags the habit down with it, so the
report said the household usually spends less than it does. A month counts as over once the day
the reading is made on has reached its last day, which is also what makes a report about a month
that has gone able to count that month: it is read as that month stood on its last day.
Corrected after 1.1.0.

The month it all starts from is where the money stands on the day the projection is made,
and that figure comes from the balances and `moneyOnHand`, with the prices somebody typed
for what is invested, which makes it the same figure the overview opens with. Without those
prices it was the same function over two different inputs, so the projection opened at what
was paid into the broker while the overview showed what it is worth. It used to be worked out here instead, by adding the opening balances
up and then adding every settled record that was not a transfer, and the second half of
that is wrong: a transfer nets to nothing only when both of its accounts are inside the
total. Paying a card invoice is a transfer into an account that is deliberately outside it,
so the projection opened over by every invoice the household had ever paid. Corrected in
1.1.0, which is also when the day this is counted up to started being passed in rather than
meaning "every record ever written", so a report on a month that has gone is a report as
that month ended.

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
