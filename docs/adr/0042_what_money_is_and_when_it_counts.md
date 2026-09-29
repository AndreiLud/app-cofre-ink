# 0042. What money is, and the day it counts on

Date: 29 September 2026

## Status

Accepted. Amends registry 0010, which set out the shape of a transaction, and registry
0004, which set out money and time.

## Context

Two questions had been answered by whoever needed the answer, wherever they needed it.

**Which accounts are the money somebody has.** Three screens asked and got three answers.
The overview counted every kind, so a card invoice was netted off the headline and a meal
voucher was counted as spendable cash. The check up counted everything except investments,
with a comment explaining why an investment is not a reserve. The projection counted
everything except credit, and converted currencies while the other two added them as
written. No two of the three agreed, and the product brief promises a person sees, in
seconds, how much they have.

**When a record counts.** A record counted in the balance when its status said settled, and
the day it was dated on was not asked. A purchase in six parts is written as six rows,
all of them facts, five of them dated in months to come, and all six left the balance on
the afternoon of the purchase. The same five were counted again as money still to come by
the reading of instalments ahead, whose own comment had the rule right all along: a part
dated in February is money that will leave in February however it is marked today.

The interface had the same split. The form asked whether a record had happened yet, with a
tickbox, next to the field that had already been given the day. Two answers to one
question, and the tickbox won.

## Decision

**One module names the questions.** `packages/core/src/accounts/whatCounts.ts` holds the
policy and every reader names the question it is asking. There is more than one honest
question, and that is the point: what somebody has is not what they can spend this
afternoon, and neither is what they owe.

1. What somebody has: current, savings, cash and investment.
2. What can be spent now: current, savings and cash. Every question of the form "is there
   enough" reads this one, because answering it with a holding in a fund is how a reserve
   looks healthy right up to the week somebody needs it.
3. What is owed: the cards, as a positive number, because a debt is not a small balance.
4. What is left on the benefit cards, which is never part of the money.

**A record counts once it is a fact and its day has arrived.** Both halves, in the one
query that makes a balance. The day is passed in rather than read from a clock, the way
the budget, the goals and the check up already take it, because a repository that reads
the wall clock is a repository whose tests pass until midnight in some timezone.

**The day decides in the interface too.** The tickbox is gone. A day that has not arrived
has not happened, which is what the one line reader has done since it was written. Saying
a record happened writes when: a day still to come comes back to today, because otherwise
the sentence changes nothing anybody can see, and a day already past is left alone,
because a bill that fell due on the twenty fifth and is confirmed on the twenty ninth
happened on the twenty fifth as far as anybody knows.

## Consequences

The number of a household that buys in instalments falls on this update, and the release
notes say so in the first line. It is the same money, counted in the month it leaves
rather than in the month the shop was visited. Nothing is rewritten to make it happen:
the rows were always dated correctly and the reading was wrong.

The check up stops counting a meal voucher as part of the money a reserve is measured
against. A voucher buys lunch and will not cover the rent, so a reserve measured with it
in is a reserve that looks healthy in exactly the month it is needed.

Balances are read on a day, which means the overview asks for each space on its own day
rather than on the day of the space that happens to be open. Two spaces can sit in two
timezones and neither decides for the other.

What this does not do: `projected` still counts every planned record with no horizon, so
the line under the headline and the list under it answer different questions. The overview
is being redrawn and that line becomes a number with an end of the month on it.
