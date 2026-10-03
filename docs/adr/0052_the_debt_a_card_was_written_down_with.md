# 0052. The debt a card was written down with is an invoice

Date: 3 October 2026

## Status

Accepted. Carries out decision 2 of the request for 2.0.0, which says the opening balance
of a card from before 1.1.0 goes on counting everywhere a card counts.

## Context

Release 1.0 asked for an opening balance on every account, a card included, and somebody
who already owed 1,500 on a card typed that. Release 1.1.0 made the invoice a thing with a
state, built from purchases and payments, and never read the opening balance. So the
balance of the card counted the debt and nothing made from the invoices did: the line of
cards on the overview, what falls due, what is left to spend, the limit still available
and the months ahead.

It was worse than a missing figure. The payment that settled that debt was written by hand
and names no invoice, and a payment that names none pays down the oldest invoice owing. With
the debt invisible, that was the oldest purchase, so recent invoices came out paid without
having been.

## Decision

The opening balance of a card is an invoice of its own, closed and owed: the last invoice
that had closed on the day the card was written down, in the timezone of its space, which is
the invoice that debt was on. The request said the month the card was written down in; the
invoice that closes in that month may still be open on that day, and an invoice still taking
purchases cannot be the debt somebody had already run up, so the one before it is used when
that happens.

It is the first invoice a payment with no invoice named pays down, ahead of every month in
order, because it is older than anything charged since. The invoice says how much of it is
the opening balance, so the invoice screen can explain an invoice with no purchase on it. A
positive opening balance is credit in the card's favour, which is an invoice in credit. An
opening balance in another currency than the space counts in has no rate stored with it, so
that invoice says it does not know its total rather than adding two currencies.

## Consequences

Every figure made from invoices counts the debt, because they are all made from the same
list. The balance of the card and the invoices now agree.

Nothing is written to the database. A card made since 1.1.0 has no opening balance, because
what it already owes is written as a purchase on the open invoice, so it has no opening
invoice either.
