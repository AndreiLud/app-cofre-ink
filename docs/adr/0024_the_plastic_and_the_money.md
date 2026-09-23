# ADR 0024: The plastic and the money

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Until now an account was the only thing a record could be charged to, and one of the six
kinds of account was called "credit card". That reading held for exactly one case, the
credit card, and broke for every other piece of plastic a Brazilian carries.

The owner asked for cards: credit, debit, multiple, VR and VA, VT and the rest.

The trouble is that four of those five are not accounts at all.

1. A debit card is not a pot of money. It is a way of reaching the current account, and
   creating an account for it would double the balance of that account on every screen.
2. A cartao multiplo is one piece of plastic that reaches two different places: a credit
   line when it is used as credit, a balance when it is used as debit. The choice is made
   at the till, purchase by purchase.
3. VR, VA and VT are three different pots. A shop that takes the meal voucher may refuse
   the food one, and neither buys a bus ticket. They are money, so they are accounts, but
   they are not one kind of account.
4. Caju, Flash and Swile hand out one card that reaches several of those pots at once.

So the model has to hold two things that were previously one: where money sits, and what
reaches it.

## Decision

### An account is money. A card is a way to reach it.

A new table, `cards`, in the space scope like everything else. A card carries a kind, a
name, the four digits printed on it, and up to two links:

1. `credit_account_id`, the invoice it charges.
2. `debit_account_id`, the balance it spends.

Which of the two are filled is what the kind means, and `packages/storage` refuses every
other combination:

| kind | charges an invoice | spends a balance |
| --- | --- | --- |
| credit | required | refused |
| debit | refused | required |
| multiple | required | required |
| benefit | refused | required |
| prepaid | refused | required |

On top of the shape, two checks about what the accounts actually are: an invoice only
lives on a credit account, and a balance never does. Both mistakes are silent everywhere
else. The purchase lands somewhere, the invoice is wrong, and nobody finds out until the
bill arrives, so they are refused at the only door there is.

### A record names a card, and the account is still the truth

`transactions` gains `card_id`, nullable. It decides nothing: what a record is charged to
is the account, and the card only says how it got there. A record may only name a card
that reaches its account, which is the check that stops a purchase claiming to be on the
meal voucher while landing on the credit card invoice.

Moving a record to another account drops the card, unless the card reaches the new
account too, which is exactly the cartao multiplo moving between its own two sides.

Removing a card leaves the records alone. The account is still there, the card is read
through a join that skips a removed row, and the record simply stops saying which plastic
was used. Rewriting a few hundred rows would be a write nobody asked for, and one that
would have to travel to every other device to mean anything.

### VR, VA and VT are one column, not six account kinds

`accounts` gains `benefit`, nullable: meal, food, transport, culture or mobility. It is
filled only on a voucher account, and the repository refuses it anywhere else.

**Amended on 22 September 2026.** VA and VR became one pot, called VA/VR on screen and
`meal` in the database, because the card usually carries both and two options nobody
could tell apart is worse than one. Migration 0012 turned every row that said `food`
into `meal`. The value stays in the list the database checks, for the reason the rest of
this section gives: narrowing that list is the same table rebuild as widening it, and a
row arriving from a device that has not migrated has to be accepted rather than refused.
`toAccount` folds it into `meal` on the way in, so nothing above the storage layer has
ever heard of it.

The reason it is a column instead of six more values of `kind` is a migration one, and
worth writing down. The kind of an account carries a CHECK constraint listing the six
values it was created with. Widening that list means rebuilding the table in SQLite,
which cannot be done inside a transaction with foreign keys on, which is how the
migration runner works. A new column with a CHECK of its own costs one ALTER in both
dialects. The rule for the next person: a list a database already checks is closed, so a
new distinction goes in a new column.

### The choice somebody actually makes

On the record form the picker offers one entry per way to pay rather than one per card. A
cartao multiplo appears twice, as credit and as debit, because that is the choice made at
the till, and picking one of the two decides whether the purchase lands on the invoice or
leaves the balance today. Picking the plastic picks the account, which is the whole point
of having it.

### Permission borrows the words of the accounts

A card holds no money and shows nothing a person could not already see, so `cards` uses
`account.read`, `account.create` and the rest. A second set of five roles would be five
more things to keep in step, with nothing to show for it.

## Consequences

1. `packages/db` gains one table and two columns, and migration `0011_cards_and_benefits`
   adds them to a database that already exists. The backup, the restore and the
   replication engine need no change at all: they walk the schema, and the schema is where
   the card now is. That is the return on describing it once.
2. The import reads the four digits. A statement that says "final 4417" now names the
   card, and through it the account, which is the strongest evidence there is and the only
   one that also answers which card a purchase was made with. A cartao multiplo resolves
   to the credit side for an invoice and the debit side for a statement.
3. The invoice screen says which pieces of plastic charge it, which is the answer to the
   question a family has when two people carry a card on one invoice.
4. `InvoicePage` used to call a credit account a card. It does not any more, because two
   words meaning the same thing was fine until one of them started meaning something else.
5. What is not modelled: a benefit card reaching several pots at once. One card per pot
   works, says something true, and costs a join table less. It can be revisited when
   somebody with a Caju card says it is not enough.
