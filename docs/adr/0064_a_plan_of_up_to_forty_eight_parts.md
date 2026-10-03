# 0064. A plan of up to forty eight parts, refused rather than cut

Date: 3 October 2026

## Status

Accepted. Corrects registry 0010, the shape of a transaction, on what a plan adds up to.
Part 2, section D of the request for 2.0.0. Decision 7 below, how a plan is divided between
people, is a choice made without the owner and waits for confirmation, as do the shapes in
decisions 5 and 6.

## Context

Release 1.2.1 had four ceilings for one thing: the form offered 24 parts, the one line reader
read up to 99, and the core and the server took 420. A line asking for 49 parts read as 49
and was written; a plan of R$ 0,40 in 48 wrote a part of zero, and the write failed inside
the transaction with a sentence about an amount that had to be positive. "tv 48x de 99,90"
split R$ 99,90 into 48, and "freela +6120 3x" wrote three incomes.

## Decision

1. One ceiling, `MAX_INSTALLMENTS = 48` in `packages/core/src/cards/installments.ts`, imported
   by every place that asks, and passed to the sentences as `{{max}}`.
2. Refused, never cut. `installmentRefusal` in the core answers nothing or a code:
   `tooManyInstallments`, `onlyExpensesGoInInstallments`, `benefitIsNotInInstallments`,
   `transfersAreNotSplit`, `partBelowOneCent`, and `firstInstallmentOutsidePlan` for a first
   part beyond the plan. The repository turns the code into a `RuleError` before the write
   begins, on every path that creates a plan: the form, the import, the one line reader and
   the arrangements of registry 0063. The server checks only that the count is a whole number
   from one, so a refusal comes back as 409 with its code and its sentence, not as a 400 the
   screen cannot name. The one line reader says the same two problems before anything is
   written and turns the button off; it never reads 49 as 48.
3. Total or each part. The form asks whether the amount typed is the whole or each part, and
   opens on the whole. The line reads an amount right after the parts, with or without "de"
   or "of", as each part ("48x de 99,90", "48 x 99,90"), and an amount before them as the whole
   ("tv 2400 48x"). Either way the plan is written from the whole, so the interface of the
   repository does not change. Both say what each part comes to before anything is written,
   the equal ones together: "16 de R$ 20,84 e 32 de R$ 20,83".
4. The anchor. A plan begun before the person started using Cofre is written from the part
   after the ones already paid: `firstInstallment` (one by default), with `happenedOn` the day
   of that part and `invoiceMonth`, when given, the invoice of that part. The planner adds one
   month and one invoice per part after it, and never asks `invoiceMonthOf` about a day that
   was moved, because 31 January plus a month is 28 February, a different invoice on a card
   that closes on the 31st.
5. Old plans. Nothing refuses a plan when it is read, edited, restored or synchronised: a
   plan of 60 or 420 parts written before 2.0.0 keeps working, and its tenth part can be
   changed with the ones after it.
6. A plan in another currency is converted once, as a whole, and divided in the currency of
   the space with the parts as weights, so it adds up: US$ 1.000,00 in 48 at 5,4321 is
   R$ 5.432,10 and not R$ 5.432,00. The check up reads every part ahead however far, twelve
   months one by one and the rest by year, and the months ahead say what the parts still
   charge after the last month they show.
7. Dividing a part of a plan between people divides the whole plan, each part by what it is
   worth, and taking the division back takes it back from every part. The balance between
   people counts a division from the day of its record, the way the record itself counts, so
   a fridge in 48 shared by two has the other person owing R$ 25,00 on the day it was bought
   and R$ 50,00 a month later, not R$ 1.200,00 on the first day.

## Correction to registry 0010

Registry 0010 says the parts of a plan "add up to the purchase to the cent". A plan written
from part N+1 adds up to what is left of the purchase: its rows carry the cents they would
have had in the whole division, and the parts already paid are not written. The whole is
still what the description says, "Fogao 11/48" being the eleventh of forty eight.

## Consequences

1. The drop from 99 and from 420 to 48 is in the changelog: a line or a request that asked
   for more is refused with a sentence, and what was written before stays as it was.
2. Changing "this and the next" sends only what changed. An amount sent is the amount of each
   part, and the field says so: "Valor de cada parcela".
3. A division made before 2.0.0 on one part of a plan stays on that part; dividing it again
   divides the plan.
4. The balance between people counted a division whatever its day. A division of a record
   dated ahead now waits for its day, which is the rule of registry 0050 applied to people.
