# 0058. Several cards, in the order they are dealt with

Date: 3 October 2026

## Status

Accepted. Decision 4 of 2.0.0, for part 2, section B. Revises registry 0044, which drew a line
per card under the four figures and a block per card further down; registry 0038, which gave
the month screen one card; and registry 0024, which made the plastic a thing of its own.

## Context

Everything about cards was built for one card and grew a list where a second one appeared.
Every screen opened on the first card the database sorted by name, without a collation, so
SQLite and PostgreSQL with a language collation put "Carteira" and "Cartão de crédito" the
other way round and the two modes opened different cards, and none of them opened on the
card that was late. With two cards, every button that paid an invoice on the overview opened
the first card; the invoice screen read the card from the address once, so a second link did
not move it and going back did not go back. Four cards put four lines under the four figures,
which pushed the answer to what can be spent off a telephone screen. The month screen had one
invoice field for one card. And the form that writes a card down gives the plastic the name of
its account, so the current account "Nubank" and the card "Nubank" were two lines that read the
same on every list.

## Decision

In the numbers, a card is the credit account, one invoice. Whoever bought with it is the plastic,
registry 0024, and several plastics can charge one invoice.

**One name for each way to pay.** Every list of cards and accounts puts cards under "Cartões"
and accounts under "Contas", as an option group, says credit or debit only on a card that does
both, and adds the last four digits only where two lines would read the same
(`apps/web/src/lib/wayLabel.ts`). A credit account no plastic reaches is a way to pay by its own
name, written with no plastic. A payment says the month and the card it paid.

**One order.** `cardsByUrgency` in the core puts first a card with an invoice late and owed, the
oldest first; then one with an invoice closed and owed and not due yet; then one with something
on the open invoice, the nearest due day first in those two; then one with nothing; and the name,
compared in the language of the screen, only breaks a tie. Every screen that lists cards uses it.
`cardsTogether` adds them up: how many, what the open invoices hold, what the closed ones not due
hold and what the late ones hold, and no sum at all when the cards are in more than one currency.

**The invoice screen** opens on the first card of that order, on its open invoice, and reads the
card and the month from the address every time, writing them there when somebody chooses. The
title starts with the card, "Nubank: a fatura de outubro fecha em 5 dias", which reads right
whatever the card is called; "do {{card}}" is wrong for a name like "Caixa". Up to four cards are
side by side on a wide screen, the late one marked, and a list on a telephone or with more. A
link to a card of another space, which "Todos" on the overview makes, says whose card it is and
offers to open it in that space, and does not change the space by itself. An invoice charged by
more than one plastic has a column saying which made each purchase.

**The overview.** With one or two cards, a line per card under the four figures, as before, in
the order. With three or more, one line: how many cards, what the open invoices hold, what has
closed and when it falls due, in the ordinary tone, and what is late, in the colour of a problem,
and a way to the list. Three benefit cards or more are one line too. The panel further down is a
list with a line per card, ruled and with no boxes: what the open invoice holds, the day it closes
and the day it falls due, what has closed and is still owed, the limit that is left and the way to
it; from two cards, a total of what is open and what is owed, and never of the limits. Where the
money is, three cards or more are one line with what they owe together, opened into a line each.
Every way to an invoice names the card and the month, and offers to pay only to somebody who may
pay in the space of that card. The notice of an invoice about to close is shown for every card.

**An archived card that still owes** stays on the overview, in the months ahead, in the check up
and in the invoices until it is paid, and archiving one asks first. **A credit card needs its two
days**: a new one without them is refused, and so is an edit that clears one; one written before
2.0.0 without them is shown with what to fill in.

**The month screen** has an invoice field for each card, and each card's invoice and payment carry
a mark with the card in it.

## Consequences

The overview of a household with four cards fits a telephone again, and the card that needs
somebody is at the top of every list.

The choices taken without the owner for this section are in the report of 2.0.0: the invoice
screen opens on the most urgent card, three benefit cards fold into one line, and three cards or
more fold where the money is.
