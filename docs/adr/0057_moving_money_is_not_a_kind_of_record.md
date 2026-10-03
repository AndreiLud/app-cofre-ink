# 0057. Moving money is not a kind of record

Date: 3 October 2026

## Status

Accepted. Decisions 1 and 2 of 2.0.0, for part 2, section A. Keeps registry 0010, the shape
of a transaction, and amends registry 0043, which said a top up by Pix is written as a
transfer like any other.

## Context

The form for a record offered three kinds on one switch: money out, money in, and a transfer.
The third is a question nobody asks at the till, and it sat in front of every purchase. The
two that people do write were written wrong for want of it: a Pix into the savings account
written as money out made the month look worse by what was put aside, the savings rule and
the goals never saw it, and the importer of 1.x wrote the payment of an invoice as money out
of the bank and again as money in on the card, so the same money was spending and income.

The form also let a transfer leave a credit card, which the invoices read the wrong way round:
money taken out of a card made its invoice smaller.

## Decision

The form has money out and money in, called Saída and Entrada. Moving money between two
accounts of the same person is an action on the accounts, Mover entre contas, and inside it
is what registry 0010 says it is: one row of kind transfer that leaves one account and
reaches the other, with no migration, and every transfer already written stays editable.

A move leaves a current account, a savings account or cash, and reaches one of those or a
benefit card. Never a credit card, whose invoice is paid on the invoice screen with the month
it pays, and never an investment account, which is worth its holdings and is reached by
buying one. A move may repeat every month as a series.

The doors to it are where the money is: the accounts screen, at the top and on each account
money can leave; Recarregar on each benefit card, which is how a top up by Pix is written now
(amending registry 0043); Guardar agora under the savings rule and Pôr na meta on each goal,
with the account and the amount already in; and a line under money out on the form, which
hands over what was typed.

A transfer never leaves a credit card. Creating one, editing one so that it does, and a series
of them are refused with `cardIsNotAnOrigin`. What leaves a card is a purchase on its invoice,
which is decision 2, and only paying an invoice with another card writes one, by a path of its
own that section C of 2.0.0 describes.

A record that was really a move becomes one from the list, "Era entre contas suas", through
`transactions.toTransfer`, which asks for `transaction.update`, and for `transaction.delete`
when it joins the other half. Money out of an account that holds money becomes a move to the
other end, an account of Mover entre contas or a card whose invoice it paid; money in becomes
a move from an account money can leave; money in on a card, the payment the bank received,
becomes the payment of the invoice named. The day, the description and the mark of the bank
stay; the category, the card and the priority go. A part of a plan, an occurrence of a
series, a record divided between people, one ticked off against the bank and one on a benefit
card are refused.

The other half, the same move written on the other account, is the opposite kind, the same
amount, on that account, at most three days apart, not ticked off and not part of a plan
(`isMirrorOf` in `packages/storage`). The screen offers to join it, ticked, and joining deletes
it in the same step, all or nothing. Reading a statement afterwards knows a move that touches
the account by its amount and its days, whatever the bank called it, so the line of the half
that was deleted is not written again.

The export names a transfer by where it landed: an invoice payment when the money went into a
credit card, a move between accounts otherwise. The word transfer leaves the interface.

## Consequences

No balance and no total changes for what was already written: a transfer is read as it always
was. A household that wrote money put aside as spending can turn each of those records into
the move it was, and the month, the rule and the goals read it right from then on.

Joining the two halves deletes a record. It is the only way the double count goes away, and
the screen says which record it is before it is deleted.

The choices taken without the owner for this section are listed in the report of 2.0.0: the
other half is offered ticked, the doors open with the current account as the origin, and a
rule or a goal kept in an investment account waits for the investments of section H.
