# 0069. A holding is a product, and the indices estimate it

Date: 3 October 2026

## Status

Accepted. Amends registry 0019 in the part headed "Prices are typed by hand, indices come from
the Banco Central" and in its consequences 1 and 3: some values are now estimated from the
Banco Central, and `index_days` is a second table with no `space_id`. Decision 7 of the project
file says the same in its new words. Six choices were made here and wait for the owner's
confirmation; they are listed at the end.

## Context

Release 1.2.1 knew seven kinds of holding and asked every one of them for a quantity, a price
today and a cost.

1. The kinds were written four times, in the table, the model, the server and the screen, and
   none of them in `packages/core`. A caixinha was "Renda fixa" with a quantity of one and a
   price of ten thousand, and it never grew: nobody types the value of a caixinha every day.
2. An investment account was worth its holdings when it had any and its balance when it had
   none, so money moved into one without becoming a holding left "Você tem" and arrived
   nowhere, and a broker opened with its balance counted the gain twice.
3. Money went into a holding with no record of where it came from. The current account kept
   the thousand reais that were now in the caixinha, or the person wrote a spend and the month
   looked a thousand reais worse.
4. The comparison with the CDI grew what was invested from twenty four months ago, whatever
   the day of the purchase, and drew a straight line for the holdings.
5. The overview and Accounts read the holdings under one key and Investments under another,
   so a price typed on one screen left the other two on the old value.

## Decision

**A catalog of products in `packages/core`** (`invest/products.ts`). Each product says which of
the seven kinds the table keeps it under, which group the form shows it in, how its value is
known (from an index, from a price times a quantity, or typed as it is), the fields the form
asks for and the ones it refuses to save without, how finely it is counted (whole units, two
places or eight) and how its income is taxed. The seven kinds stay in `packages/db`, because
widening the check of a column in SQLite rebuilds the table, and a test says every product
falls into one. A holding from before 2.0.0 has no product and reads as the generic one of its
kind, valued as it always was, by the price typed, and listed with the fixed income when that
is what it was.

**What it was opened with, and what moved after.** `quantity` and `cost` are the opening, which
only Editar changes. Everything after is a row of `holding_moves`, replicated, with the day,
the kind (in, out, income), the amount, the units when there are units, and the record that
moved the money from or to an account, written in the same transaction. That record is changed
and deleted only on Investments: the list, the edit, the edit in bulk, "mover para conta" and
the rules refuse it with a sentence that sends the person there, and deleting a movement or a
holding says first how much goes back to each account. Two devices that put money in on the
same day add up, because neither rewrites the holding.

**Estimated by the Banco Central.** A caixinha, and a CDB, an LCI or an LCA tied to the CDI,
grow by the daily CDI (series 12) times their rate; the fixed rate ones by one plus the rate a
year to the power of a two hundred and fifty second for every day the CDI series published; the
Tesouro Selic by the daily Selic (series 11) from its last price; the poupança by the rate of
each month (series 195) on its anniversary. The working days are the days a series published.
The estimate starts again from the newest value typed, stops at maturity, never passes the last
day held, and says the day it reached: always on Investments and on paper, and on the overview
and Accounts as "calculado até" when that day is more than three days behind. The day of a
deposit earns its rate, the factor is not rounded and the value becomes cents once, at the end.
A value typed from the statement always wins, and a value typed with no day of the index after
it is the value typed and not an estimate. Everything else is typed: shares, funds, crypto, a
pension, the two other Tesouros, and a CDB, an LCI or an LCA tied to the IPCA.

**The daily indices are a second table with no `space_id`.** `index_days` is global like
`index_rates`, is not replicated and is not in a backup. The button always asks for the same six
series, monthly 4391, 4390 and 433 and daily 12, 11 and 195, whatever somebody holds, because
asking for the poupança only when somebody has one would say so to the Banco Central. A daily
series is asked for with both dates, in windows of at most ten years, one request at a time, from
January ten years back the first time and only the new days after that. Two members of a space
may see different estimates until each of them fetches.

**Gross, and net if taken out today.** Every value is gross, as the statement shows it. A
caixinha, a CDB and the Tesouro also show what is left if all of it were taken out today: the
income tax by the days each deposit stayed, taking out the oldest first, and the IOF in the
first thirty days, with the income tax on the income the IOF leaves. An LCI, an LCA and the
poupança say they are exempt, and the rest say nothing. Without the days of the deposits, as for
every holding from before 2.0.0, there is no net, and the row says why. The two tables are in
`packages/core`, each with the day it applies from.

**What an investment account is worth** is the sum of its holdings when it has any and its
balance when it has none, through `worthByAccount` in `packages/core`, which the overview,
Accounts, the projection, the month on paper and the goals read. Nothing goes into an investment
account or out of one except through a holding: Mover entre contas, the record form, the quick
entry, the month in three numbers, the series and the import offer none. Money left at the broker
is the product "Saldo na conta", which earns nothing and receives what a sale or an income leaves
there. The first holding written in an account that has a balance asks what that balance is,
with "Guardar como Saldo na conta" ticked. A new holding lives only in an investment account;
one from before 2.0.0 outside of one is flagged and offered "Mover para uma conta de
investimento".

**Where a holding counts.** In "Você tem", always. In what can be spent, never. In the reserve
and in the money standing still, not at all, which is section J's reading of what money is. In
the projection, nothing grows in the months ahead. On paper, the reading of a day is the list
of that day, through the valuation of `packages/core`. A goal in an investment account reads the
worth of the account, and a goal or the savings rule may point at one holding of it, when its
shortcuts open Guardar on that holding with the amount already in.

**The comparison is per holding.** Each holding against its own deposits growing at 100% of
the CDI from their own days, with the holdings whose days are not known listed apart rather
than guessed.

**One key** reads the holdings on every screen, and a change to a holding refreshes it with
every reading made from records.

**The form is two steps.** "O que é", in the groups of a statement (available any day, fixed
income, the exchange, and the four that are a group alone), then only the fields of that
product, with the institution as an investment account that can be opened from there. The names
of the products are in Portuguese in both languages, because that is what a Brazilian statement
calls them.

## Choices to confirm

1. "Imóvel" left the menu, because a home is not money (registry 0042); a holding written as
   one before 2.0.0 stays, as the generic product of its kind.
2. A CDB, an LCI or an LCA tied to the IPCA is typed from the statement, because the IPCA of a
   month is published after it.
3. Every value is gross, with the net if taken out today on the products the law taxes by days.
4. Nothing goes into or out of an investment account without a holding, and a new holding lives
   only in an investment account.
5. A goal or the savings rule may point at one holding, and then their shortcuts open Guardar.
6. The reserve sentence names the holdings available any day only as information (written with
   section J).

Taken along the way, and listed with the others for the owner:

1. Proventos is offered on shares, property funds, ETFs, BDRs, funds, the two Tesouros typed by
   price, and every holding from before 2.0.0.
2. What reaches the account when part of a holding is taken out starts as that share of what
   all of it would leave, for the person to correct to what the bank deposited.
3. The first price of a holding is dated the day it was bought, when that is known.
4. Money put in at the same moment a value was typed counts as after it.

## Consequences

1. A caixinha grows by itself once the indices are fetched, and the screen says up to which day.
2. Moving money into a holding never changes "Você tem", and the current account shows where
   the money went.
3. A second device fetches the daily indices again, which costs at most two requests a series.
4. A holding from before 2.0.0 keeps its value; giving it a product through Editar is what makes
   it grow.
