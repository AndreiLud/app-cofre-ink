# 0055. A refund on a benefit card is a purchase taken back

Date: 3 October 2026

## Status

Accepted. Decided with the owner for part 1, item B.5 of 2.0.0. Amends registry 0043, which
said a benefit card takes no income.

## Context

A voucher takes no income, because the allowance is not money arriving in a household's
hands, and a purchase is always money going out. So a lunch refunded to a meal card had no
way to be written down at all, and the reader of statements, finding one, had nowhere to put
it either.

A top up by Pix had a way, a move between accounts, which the application itself told
people to use, and nothing read it: the money left the current account and arrived nowhere.

## Decision

A refund on a benefit card is the purchase taken back, in whole or in part: a purchase on
the same card and in the same category, written with the sign the other way round. It adds
back to what is left on the card, it takes off what was spent in that category, in every
report, limit and finding that adds up spending, and it is never income, because nothing
came in. It is offered from the purchase itself, up to what the purchase cost, and the
reader of statements writes the same thing when it finds one on a voucher. The repository
method is `transactions.refund`, which asks for `transaction.create`, with its probe.

Editing a refund keeps it one: correcting how much was refunded does not turn it into a
second purchase.

A move into a voucher whose day has come adds to what is on it, and a move off one, which
nothing should write and an old record may hold, takes from it.

## Consequences

The sum of a category is what was spent less what came back, which is what a household
means by what a month of lunches cost.

A list shows a refund as an amount in the colour of money arriving, beside the purchase it
takes back, with a description that says it is a refund.
