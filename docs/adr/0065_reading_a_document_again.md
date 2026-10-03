# 0065. Reading a document again: its kind, its convention, and its own total

Date: 3 October 2026

## Status

Accepted. Amends registry 0016, reading a card invoice out of a PDF. Part 2, section E of the
request for 2.0.0, items 1 to 9, 19 and 20. Lines 83 to 87 of registry 0016, which said the
owner had statements to try and that hints per institution were the next block, no longer apply:
real documents come through the folder `samples/` and are compared with a description of each.

## Context

The recogniser was written against invented layouts and decided the sign of a line the same way
on every document. On an invoice that writes purchases as positive numbers, a refund and a
payment written negative became purchases. It read amounts with an expression of its own that
lost the minus at the end and took the C of the next word for a credit; it took the first full
date for the year of every line; it read "fatura" anywhere as the mark of an invoice; and it was
forbidden to look at where anything stood, so a credit on a statement with a column for each
direction and no balance came out as money leaving.

## Decision

1. An amount is read once, in `readAmount`, which says the value and how its sign was written: a
   minus against the number or the symbol, a minus with a space after it, which is read and shown
   to be checked, a plus, parentheses, a minus at the end, or a letter alone at the end. A typeset
   minus or a dash counts only against the number.
2. The sign depends on the kind of document. On a statement a negative number is money leaving,
   and only there the running balance decides. An invoice has a convention, charges positive or
   charges negative: decided by its own total when it adds up, else by the way most lines are
   written, else positive. Only a minus, parentheses or a minus at the end turn a line round.
   Words are a list for each kind, matched as whole words, and decide only a line without a sign.
3. Every line has a nature apart from its sign, read in the importers for every format: a
   purchase, a fee, a refund, a part of a plan, the payment of the invoice, or, on a statement, the
   payment of a card.
4. The day of a line is the leftmost one in its first two pieces, never the one after "parc". A
   day printed without a year is placed by the core: inside the period, or on or before the due
   date, and for a part of a plan near its purchase.
5. The kind comes from the first lines that are not entries, by words only one kind says. The bank
   is the first named as a whole word. The person can say what the document is.
6. The summary of an invoice is furniture by whole words at the start of a line; under a heading
   of what later invoices charge nothing is an entry; an invoice takes the amount in reais.
7. Every card a document heads its lines with is read by its last four digits, and every line
   carries the card it is under.
8. A document checks itself: an invoice by what it charges, purchases and fees less refunds and
   without payments, against its total; a statement from the balance it opens with to the one it
   closes with. When it adds up it decides, and a line with no sign is as sure as a sign; when
   only one line turned round makes it add up, that line was wrong; when it does not add up, the
   screen says by how much and those lines are checked.
9. Position is evidence, measured against the heading of the page and never against the edge of
   the paper: under a heading of debits and credits, an amount under only one of them goes that
   way. The first layer keeps where each piece of a line starts and ends; the end is worked out
   from the letters, so the comparison leaves room. Registry 0016 said nothing is inferred from
   position because the next bank puts a column elsewhere; a heading moves with its column.

## Consequences

1. A document that adds up is read with no line marked, and one that does not says so before
   anything is written.
2. The tests are still invented layouts. `samples.test.ts` reads whatever real documents are in
   `samples/`, each with a JSON of what it holds, and skips saying so when there are none. What
   only real documents decide is listed in that folder's README: a plus on an invoice, two
   columns on one line, and the words each bank uses.
