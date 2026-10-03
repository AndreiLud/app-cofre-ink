# 0063. An invoice paid with another card, or in parts

Date: 3 October 2026

## Status

Accepted. Amends registry 0010, the shape of a transaction, and registry 0039, the invoice is
also paid. Part 2, section C of the request for 2.0.0, and decisions 2 and 3 of it.

## Context

A household pays an invoice in one of three ways: money out of an account, another credit card,
or an agreement with the bank to split it into parts. Release 1.2.1 had the first only. A
transfer from one card to another was written as a payment, and it made the invoice of the
card it left smaller, which is the opposite of what happens: the second card is charged.

A record has one `invoice_month`. A transfer out of a card touches two invoices, the one it
pays at the other end and one of the card it leaves, where it is a purchase.

## Decision

1. A column, `transactions.origin_invoice_month`, migration 0019: the invoice of the card a
   transfer leaves. Empty on everything else and on every row written before 2.0.0.
2. One rule for which invoice a record touches, `touchesOn` in `packages/core`, with its twin
   in the sums of `packages/storage` and a conformance case that holds the two to the same
   answer:
   1. on the card, a purchase or a refund charges the invoice it names;
   2. a transfer out of the card is a purchase on the invoice of its origin, or on its one
      invoice when it names none;
   3. a transfer into the card pays the invoice it names: in money from an account of money,
      rolled when it comes from the card itself, by another card when that card named the
      invoice of its own side. One from another card that names nothing of its own side was
      written before 2.0.0 and pays with no invoice named.
   A transfer out of a card, and a payment, count from their day.
3. Two exceptions to registry 0010, and only these, written by one path in `transactions.ts`
   that the rest of the application cannot reach:
   1. a transfer from one card to another, in parts, only when an invoice is paid with another
      card (`invoices.payWithCard`). Each part pays the invoice and is a purchase on one invoice
      of the paying card, the first open on the day and each next one;
   2. a transfer from a card to itself, in parts, only when an invoice is split
      (`invoices.split`). Each part pays the invoice and is a purchase on one of the invoices
      after it, so the balance of the card does not move by it.
   The second is not in decision 2 of the request; it is how a split is written, and is listed
   for the owner to confirm.
4. What a bank charges beyond what was owed is a cost, a purchase on the card with the part it
   belongs to, in the category "Tarifas e juros". It is the only spending in an arrangement.
5. An invoice split and owing nothing more is "Parcelada" (`inParts`) and never late. One paid
   with another card is paid. Before the day of an agreement still to come it is still owed,
   and says what is waiting.
6. Every row of an arrangement shares a group, and changes only by undoing it
   (`invoices.undoPlan`), which removes all of it or none, and refuses once a row was checked
   against the bank or an invoice of the parts was paid.

## Consequences

1. Registry 0039 said an invoice is paid by a transfer out of an account of money. It is also
   paid by another card and by itself in parts.
2. A withdrawal on a credit card has no path in 2.0.0. The guide says so.
3. Every screen that reads an invoice reads its new state, and a row of an arrangement says why
   it cannot be changed.
4. A backup holds the column, and release 1.x refuses a backup of 2.0.0 already.
