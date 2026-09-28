# 0039. The invoice is also paid

Date: 28 September 2026

## Status

Accepted. Adds a fourth record to registry 0038, which described three.

## Context

Registry 0038 said a month is written as three ordinary records: what came in, what went
out, and the card invoice. That shipped in 1.0.0, and reading it back afterwards showed
the three are not a whole month.

An invoice is charged to the card and then paid from the account. Writing only the charge
leaves the payment out, and the payment is the half that moves the money. So every month
the account the wages arrive in kept the whole invoice it had really handed over, and the
card kept a debt that was never settled. After a year of five thousand coming in, two
thousand two hundred going out and eighteen hundred on the card, the overview read sixty
thousand in the current account and a card owing twenty one thousand, when the truth is
twelve thousand and a card at zero.

The total was right the whole time, which is why the tests and the screen both looked
correct: the two errors are equal and opposite and cancel in the sum. Only the per account
figures were wrong, and those are the ones somebody checks against their bank.

The screen was also already saying so. It prints "left over" as income minus spending
minus the invoice, which is the arithmetic of an invoice that has been paid. The balances
underneath it said something else.

## Decision

### A fourth record, from the third number

Nothing new is asked. The payment is written from the invoice amount: a transfer out of
the chosen account and into the credit account, which is exactly what the two lines on a
real bank statement say.

Paying the card was considered as a fourth field and rejected. It is not a fourth thing
somebody knows, it is the same number seen from the other side, and a field for it would
either be typed identically every month or be typed wrong and make the card drift by the
difference.

### On the day it falls due, which is often the next month

The charge belongs to the invoice of that month, so it goes on the last day that invoice
takes. The payment belongs to the day the money leaves, which is the due date, and for a
card that closes near the end of the month that date is in the month after. Both come
from the card's own cycle rather than from the calendar.

### An invoice that has not fallen due is planned, not settled

A month typed before its invoice comes due has not been paid. The application already
separates what has happened from what is going to, so the payment is written as planned
until its due date has passed, and it counts in what is coming rather than in what is
there. Nothing has to be marked paid by hand: typing that month again once the date has
passed settles it, and so does leaving it alone, because the figure that matters, what is
projected, already includes it.

### A card that is never paid off

Somebody who pays only the minimum, or nothing, now has a record that says they paid in
full. That is wrong for them, and the record is theirs to correct or delete like any
other. The alternative, assuming nobody pays their invoice, is wrong for almost everybody,
and the screen says in "what this writes" that paying it is written too.

## Consequences

1. The per account balances of somebody who uses only this screen are true, and the card
   returns to zero every month instead of sinking.
2. A month is four records, not three, and the screen still asks three questions.
3. The payment is a transfer, so it is not spending: it does not appear in a report by
   category, it does not count against a budget, and it is not on the invoice screen,
   which is right in all three cases because the spending was already counted when the
   invoice was charged.
4. A space written by 1.0.0 has months with a charge and no payment. They are not
   repaired on their own. Opening that month on the screen and saving it again writes the
   payment, and until then the drift that release shipped stays.
