# 0062. A month on paper as it stood, and the day a month counts as over

Date: 3 October 2026

## Status

Accepted. Amends registry 0046, which put a month in a file, and decision 8 of release
1.1.0, which said a month that has gone is printed as it stood on its last day. Part 1,
section F of the request for 2.0.0.

## Context

The file of a month that had gone said its figures were as they stood on the last day, and
four of its parts were read with the data of today:

1. the holdings, at today's price and including those written down later, so the money at
   the end of September printed in October was the total of October;
2. the cards, whose purchases and payments were summed whatever their day, so the file of
   August printed after the bill was paid showed August's invoice paid, a card written
   down later appeared at nought, and an invoice closed and still owed was not there;
3. the check up, which always left the month of the day out, so on the last day of
   September only July and August were read, fewer than the three months a reading needs;
4. the limits, which took their names from the spending of the month and printed an empty
   cell for a category with a limit and nothing spent.

## Decision

1. A holding has a price on a day. `investments.list(space, { onDay })` returns what existed
   on that day, a holding with its day of purchase on or before it or, without one, written
   down on or before it, each at the last price typed up to that day. A holding with no
   price that early is read at the earliest price it has, and says so, because the first
   price of a holding written before 2.0.0 was never kept. Writing a holding down now keeps
   its first price with the others.
2. A card as it stood is `invoices.standing(space, day, { asItStood: true })`: a record
   counts if its day had come, a purchase in parts counts every part once its first part
   had, no payment dated later counts, and a card written down later with nothing on it by
   then is not there. The table of the file shows the open invoice and every closed one
   still owed.
3. A month counts as over on its last day, by one helper in `packages/core`,
   `lastWholeMonth`, which the check up and the months ahead both read. On the last day of a
   month the check up reads that month as closed, and so does the live one.
4. The file prints every amount without a sign, as its tables already did: the summary said
   "Saiu" with a minus and every table below it said the same money without one. Whether a
   line is money in or money out is in its name.
5. The file says its figures are as they stood on the last day only when every part was read
   that way. A holding read at a price from after the day takes that sentence back for the
   holdings, by name.
6. The summary has one line per benefit card under the line of the benefit, and the month
   reads day by day in a table of its own.
7. The months after a month that has gone read the cards and the records the same way as
   item 2, through `projections.monthsAhead({ asItStood: true })`: a record dated after the
   day counts only as a part of a purchase whose first part had come. They were read with
   today's records, so the file of September said R$ 120,00 in parts were still to come
   until April, from a chair bought in October, under the sentence that every figure was as
   it stood on the thirtieth. The rule is written once, `stoodBy` in
   `packages/storage/src/happened.ts`, and the cards read it from there too. Added after the
   pictures of 2.0.0 were reviewed.

## Consequences

1. The file of a month that has gone gives the same figures whenever it is printed, save for
   records written later with an earlier day, which are part of that month by their day.
2. Somebody who kept holdings before 2.0.0 sees their earliest price in the file of a month
   before it, and a sentence saying so, until a price on an earlier day is typed.
3. Item 4 is a choice taken alone and is listed in the report for the owner to confirm.
