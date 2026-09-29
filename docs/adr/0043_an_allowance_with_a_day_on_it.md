# 0043. An allowance with a day on it

Date: 29 September 2026

## Status

Accepted. Amends registry 0024, which made a card a thing of its own and gave a voucher
account the kind of benefit it holds.

## Context

A voucher was an account like any other. Registry 0024 gave it a kind, so the app knew a
meal card from a transport card, and left it holding a balance made of records the way a
current account does.

That is not what a benefit card is. Nobody transfers money into it. An amount lands on a
day each month, put there by an employer, and the household spends it down on lunch or on
fares. For the person keeping the books there is no record to write when it arrives,
because nothing of theirs moved, so the only way to make the balance right was to write
down money arriving that never arrived. Most people do not, so the card sat in the list
showing whatever was typed the day it was added, going down for ever.

The card that is actually in the pocket differs on one thing: a meal card keeps what was
not eaten, and a transport card is usually topped back up to the same amount and the rest
is gone. Both exist.

## Decision

A benefit account carries what lands, the day it lands, and whether the leftover carries.
What is on the card is worked out from those three and the spending, in
`packages/core/src/accounts/benefit.ts`, and never read off a balance.

The opening balance goes on meaning what it always meant: what was on the card the day
somebody wrote it down. Every landing after that day adds the allowance. The landing of
the period the card was written down in does not, because whatever it put there is already
inside the number that was typed. That is the whole of the arithmetic, and it is why the
day the account was created is one of the inputs.

A card that does not carry forgets everything before the last landing, and its opening
balance survives only while the card is still in the period it was written down in.

Whether the leftover carries is a column and not an assumption, with a default per kind:
a meal, culture or mobility card carries, a transport card does not.

A voucher with no allowance on it answers nothing rather than guessing. Every voucher
written before this release is one, and the screen asks for the allowance rather than the
model inventing one.

## Consequences

A benefit card leaves every total of money: the headline, the money the check up measures
a reserve against, the opening of the projection, the income the savings rule reads. What
was spent on it is still spending, in the categories, in the limits and in the reports,
which is where a household actually sees it.

Because the spending stays and the credit was never a record, a month would close worse by
exactly what was eaten. So the allowance becomes an income line of its own, named for what
it is and calculated rather than written, kept apart from the salary. Nobody puts a meal
card aside, so the savings rule does not read it.

Three columns on the accounts table, which the server needs too: a household running a
server of their own updates both halves, because a server that does not know a column
ignores what arrives in it.

What this does not do: it does not read the balance a bank or a benefit provider would
show. Nothing leaves the device, so what is on the card is what this arithmetic says it
is, and a top up by Pix is written as a transfer like any other.
