# 0071. An invoice is a bill on its due day

Date: 3 October 2026

## Status

Accepted. Amends registry 0029, whose third sign read what falls due against money with the
cards taken off, from records written as promises only; and registry 0042, which named the
money and the reserve without saying that the reserve is the money less what the cards owe,
which the code has done since `79353f7`. Corrects item 4 of the second list of registry 0041,
lines 86 to 88, about what a logger is told about money. Decision 14 of 2.0.0.

## Context

The owner saw a sentence saying that one bill of R$ 0,00 fell due in the next fifteen days, that
"Você tem" R$ 1.114,20 below nothing, and that R$ 1.114,20 was missing, with nothing falling due.

1. The rule of the finding never checked that anything fell due. With an empty window and the
   money negative, nothing was larger than the money and every bill of an empty list agreed
   with every condition. Nought took the singular form, so it said one bill.
2. The money was what the accounts held less what the cards owed, with the open invoice, the
   invoice written down with the card and the opening balance of an old card all in it. And an
   invoice was never among what fell due: the check up read records written as promises, which
   since 1.1.0 nobody writes, so a card invoice, the bill most households have, never was one.
3. The same question had four answers: the findings, the sign, the plan, which counted every
   promise ever written with no window, and the overview's own list and notices, in which a
   purchase on a card was a bill and money coming in "fell due".
4. A logger's balance is made of their own rows, so the reserve and the bills of a household
   were measured against fifty reais.

## Decision

**One function for what falls due** (`billsFallingDue`, in `packages/core/src/cards`), read by
the overview's list and notices, the findings, the sign, the plan and what is left to spend this
month. A record is a bill when it is money out still to come: a fact dated after today, or a
promise from before 1.1.0, which is late once its day has gone. Not a purchase already on the
invoice of a card with a cycle; not a lunch on a benefit card; never a move between accounts, so
never the payment of an invoice dated ahead, because until its day the bill is the invoice, which
says that a payment is waiting and how: money, another card, or a split. Every invoice that is
open or still owed is a bill on its due day for what is left on it; one past its day is late and
counted, however old; one with a purchase in another currency and no rate is set apart and said.
Fifteen days is `SOON_DAYS`, everywhere.

**What is short is what falls due less what can be spent today**, the accounts of current,
savings and cash, with nothing taken off for the cards: the invoice is already among the bills.

**The reserve is the money less what the cards owe**, in the finding, the sign, the trend, the
year without the largest income and the plan. Holdings that come out the same day are named after
the reserve's sentence, "Fora das contas, R$ 10.000,00 estão em aplicações de resgate no mesmo
dia", and never counted in it. A reserve of nothing or less is not a negative fraction of a
month: what the cards owe beyond the accounts is said instead (`cardsOverAccounts`). The plan starts the buffer
from the reserve, with what falls due covered and the bills of the window that are not invoices
gone, so an invoice is not counted once owed and again in the buffer.

**At most one finding about what falls due**, and only when something falls due and the money
does not reach it: about the invoice when it is the only bill, with the days to its due day
("vence hoje", "amanhã", "em 13 dias", or that it is late); about all of them otherwise, naming
the oldest late one or the largest. The money is "Nas contas há", never "Você tem", which on the
overview counts what is invested; the accounts below nothing are "As contas estão negativas em".
A finding about an invoice carries its card and month, and the check up opens that invoice; the
one about all of them opens the overview's list, by its anchor.

**Nothing about money to a logger**, and nothing when the accounts are in more than one currency,
which add up to no amount: the reading carries no money and no cards, the reserve and the bills
are unknown, and the findings about bills, the reserve, money standing still and the saving rate
are left out. The helper that says which currencies a set of accounts counts in is the one
"Todos" uses for its spaces.

**Accounts says the two figures** the sentences are made of: what the accounts hold, and what the
cards owe.

## Consequences

1. The figures travel by `/api/spaces/:id/advice` and `/reading` in a new shape, so the server and
   the interface go up together, which the notes of the release say.
2. A card invoice falling due next week is on the overview's list, in the sign and in the plan,
   the same bill on each.
3. A household that keeps money in a caixinha reads a thinner reserve than before, with the
   caixinha named beside it, because it is the money in the accounts that pays a bill on Friday.
