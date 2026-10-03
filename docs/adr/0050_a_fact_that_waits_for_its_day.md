# 0050. A fact that waits for its day, and one rule for what has happened

Date: 3 October 2026

## Status

Accepted. Carries out decision 3 of the request for 1.1.0, which said a record dated ahead,
a part of a purchase in instalments and an occurrence of a series count in the balance by
themselves when their day comes. It was decided then and was not done.

## Context

Release 1.2.1 still wrote a record as a promise whenever its day was after today: the form
did, the quick entry did, and a series wrote every occurrence that way. The balance counts
only facts whose day has come, and nothing ever turned a promise into a fact. So the rent
written for the tenth stayed out of the balance on the tenth and was listed as late on the
eleventh, while the form had promised, in so many words, that it would count on the day.

Part D.1 of the same request asked for one condition, shared, that every query separating
what happened from what is still to come would use. Each query wrote its own instead. The
goals counted every fact whatever its day, the figures behind the check up read the month
in hand up to the thirty first, and the overview read "the month so far" to the end of it.

## Decision

Everything the application writes is a fact. A day that has not arrived holds a fact back
from every balance until the day arrives, and then it counts with nobody touching it.

"Planned" stays in the schema, for the records release 1.0 wrote. A promise from before
1.1.0 counts when somebody says it happened, and only a promise whose day has gone is
called late. The repository still accepts an explicit planned status on create, because a
backup or a replica from that release carries them and has to arrive as it left.

There is one rule, in `packages/storage/src/happened.ts`, and it has three forms:

1. `happenedBy(alias)`, a fact whose day is today or earlier, for every sum of what happened;
2. `stillToComeOn(alias)`, a promise or a day after today, for every list of what is coming;
3. `hasHappened(record, today)`, the same thing for a record a screen already holds.

Every query that separated the two now uses one of them: the balances, the goals, the
savings rule, the figures behind the check up and the findings, what a voucher has spent,
the reports, the months ahead, a series being removed, and the lists on the overview. A
report reads up to today in the timezone of each space it covers, since two spaces may
disagree about which day it is.

Paying, said of a record dated ahead, moves its day to today, one record or several. It
did that for one and not for several, where only the status was written, which on a fact
dated ahead changed nothing anybody could see.

A payment of a card invoice follows the same rule. It pays the invoice from its own day,
and until then it is scheduled: the invoice is still owed, stays in what falls due and in
the months ahead, and says on which day the payment leaves. The payment dialog suggests the
due day, so this was the ordinary case, and release 1.2.1 counted every transfer into the
card at once: the invoice left what falls due while the bank still held the money, and what
was left to spend read the whole invoice higher until the due day. A payment with no
invoice named on it pays down the oldest invoice from its day too. What is offered for
payment, by the dialog and by marking every earlier invoice paid, is what is left less
what a scheduled payment already covers. The month screen writes its payment as a fact
dated on the due day, like everything else.

## Consequences

The overview no longer fills with late promises from every series somebody sets up, and
the button to confirm a week of them in one go is now only for data from before 1.1.0.

A record dated ahead is marked as still to come wherever it is listed, by the day and not
by the status, so the list, the calendar, the month screen and the quick entry agree.

A limit still counts everything dated in its month, as it did before, because a bill due
on the twenty fifth belongs to the month's limit on the tenth. That is a reading of what
the month will cost, and the limit says so with the day of the month beside it.
