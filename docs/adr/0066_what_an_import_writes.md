# 0066. What an import writes

Date: 3 October 2026

## Status

Accepted. Part 2, section E of the request for 2.0.0, items 7 and 10 to 18. Items 11, 12, 15 and
18 follow suggestions of the owner, which this record lists for confirmation.

## Context

An import wrote every line by its sign, on the invoice of its own day, with one card for the whole
file. A payment printed on an invoice became income on the card, a refund became income beside
the purchase it undid, a part of a plan became a loose record, the lines of a split invoice
counted the split twice, and what was already here needed the same day and the same first
sixteen letters to be found.

## Decision

1. An invoice goes on a card. The import offers cards only, by their credit side, and waits for
   the person when the file does not say which: the digits of a card come before what was
   remembered, which is kept by bank, kind and digits. Every line is written on the invoice the
   file is, "Fatura de", chosen by hand, with the plastic of the heading it is under. A purchase,
   a fee and a part are money out, whatever sign the bank printed. A card with no closing day asks
   which invoice; a card put away that still owes takes its invoice.
2. The payment on an invoice is the invoice before it paid: the transfer from a current account,
   a savings account or cash, starting on the one that paid the card last time, marked by hand,
   named the way the invoices name a payment. It starts unticked when that invoice already has a
   payment. On a statement, the payment of a card is the same transfer, on the invoice whose due
   date is nearest its day, the card found by its digits, its name or bank, or as the only one.
3. A refund pairs with its purchase: same account, same amount, the purchase on the same day or
   before, the same name without the refund words and the acquirer prefixes. On the same invoice
   both are left out. A purchase already written is taken out by the refund in the same write,
   and the refund is not written. A refund with no pair, or of part, is money back on the card.
4. A part printed on an invoice starts a plan from that part to the last, by the anchor of
   registry 0064, unless it is already written: the same part of a plan of the same account with
   as many parts, of the same amount to the cent, on this invoice, or a plan typed from its
   middle. On another invoice it is offered to be moved with the parts after it. Only the amount
   answering is "looks the same", unticked. A loose "2/10" is offered and not taken.
5. The lines a bank prints for a split invoice or a payment with another card are already here
   when they are what a part pays, what it costs, or both, or together what the parts cost.
   Otherwise they start out, pointing to the invoices screen, because as money out they would
   count twice.
6. What is already here: the same entry by the bank's identifier; already here, unticked, when a
   move touching the account goes the same way with its amount within three days, ten for the
   payment of an invoice, or a series wrote that occurrence within three days; otherwise the same
   amount within three days looks the same, unticked on an invoice and ticked on a statement.
7. The record a card was written down with for an invoice the file details is offered to be
   taken out in the same write; a month inside the debt the card was written down with is said.
8. An import is taken back in one write, all of it or none, refused once part of it was changed;
   what it took out does not come back, and the question before it says so.
9. Somebody who sees only their own records reads in statements and not invoices, and does not
   pay a card from one. The import, what is already here and the undo are in the table of what
   each call asks, proved by the probes; a server keeps every field and answers 400 to a month
   that is not one.

## Consequences

1. An invoice read in leaves the card's invoice saying what the bank says it charged, and the
   months saying what was spent.
2. Reading the same file twice writes nothing twice.
3. Choices to confirm: the payment starts on the account that last paid the card and waits with
   none; a refund takes back a purchase already written, ticked; the lines only looking the same
   start unticked on an invoice; the undo keeps out what the import took out.
