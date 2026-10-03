# 0041. One question asked in one place, and a check that keeps it so

Date: 29 September 2026

## Status

Accepted. Describes the three origins built in 1.0.4 and what 1.0.5 learned about keeping
them. Amends registry 0005, which set out the roles and the permission matrix. The list of
what a logger reads narrowed and what they read whole was corrected in 1.1.0, because it
said "every screen" and two screens were outside it.

## Context

Four releases in a row corrected cases of the same three kinds, and each release left
other cases of those kinds behind.

A role was offered a control it would be refused, and the refusal came back in the
sentence the model writes for whoever wrote the code. That was corrected on one screen in
1.0.2, on three more in 1.0.3, and on every screen that writes in 1.0.4. In 1.0.5 it was
still true of the empty state of the records list, of deleting a card, of three empty
states with no account, of a row of the danger zone and of the calendar writing the series
forward.

A failure turned into words, differently in each of twenty one places. That was corrected
screen by screen until 1.0.4 put it in one function. In 1.0.5 three screens were still
throwing a plain error carrying a translated sentence, which is the one shape that
function cannot read, and eighteen rules the model can refuse with had no sentence in
either language, so each of them reached a person as "I could not finish that".

An amount was read four different ways. 1.0.4 put that in one place too. In 1.0.5 the
quantity of a fund went through the money reader and its rule that three digits after a
lone separator is a thousands group, so an eighth of a unit was stored as a hundred and
twenty five.

The pattern is not that the fixes were wrong. It is that a fix which is a place, and not a
rule something checks, gets left behind by the next thing that is written.

## Decision

Three origins, each in one place:

1. What a role may do is `roleCan` in `packages/storage/src/actor.ts`, beside the matrix,
   asked through `useWhatIMayDo` in the interface. Every control names the permission the
   repository behind it asks for. An unknown role counts as no.
2. What a failure says is `sayWhy` in `apps/web/src/lib/sayWhy.ts`. It reads both shapes
   the same failure arrives in, because on a server the classes are flattened into one.
   Nothing the model or the browser wrote reaches a screen.
3. How an amount is read is `apps/web/src/lib/amounts.ts` over `parseScaled` in the core.
   Money keeps the thousands rule; a quantity, which takes eight decimal places, does not.

And, because a place is not a rule, three things the build now refuses:

1. A rule the model can throw with no sentence in both languages.
2. A role table in the guides that no longer matches the matrix. It is printed from the
   matrix by `scripts/roleTable.mjs` and compared by `scripts/checkTranslations.mjs`.
3. A permission a repository method names that is not in the matrix, which the conformance
   suite has always refused, and which is what made the matrix worth reading from.

## Consequences

The checks are cheap and they are the point. Eighteen missing sentences and a table missing
twenty four of thirty five rows were both invisible to a reader and obvious to a script,
and both had survived several passes of somebody reading the code against the documents.

A logger reads what they wrote wherever a figure is made of records, which took nine
queries in five repositories. Where a figure belongs to the space rather than to a person,
an opening balance or what a recurring bill will owe, it counts as nothing for them rather
than being mixed with their own rows, because a household opening balance plus one person's
records is neither number.

Four things stay outside that rule, and 1.0.5 wrote two of them down and left the other
two to be found by somebody reading the screens afterwards. All four are written down here:

1. Who owes whom, because a logger is part of that count.
2. The log of what happened in the space, which they do not read.
3. A series, which is a rule of the household and not a record. They see the series of the
   space on their own screen, with no sentence about what they add up to, no button and no
   menu: they read the list and they do not write it, `recurrence.write` belongs to the owner,
   the administrator and the editor. The days a series writes are records, written by whoever
   opened the application, so the calendar and the overview's list of what falls due, which are
   made of records, show them only their own. This item said the rent and the salary were on
   the calendar for everybody who can see it, which stopped being true when the days became
   records; corrected with registry 0068.
4. A holding, which is money the household owns rather than money that moved. There is
   nothing in it to attribute to a person. The one figure on that screen that was made of
   records, how long this money would last without an income, closed to them in 1.1.0,
   because the income it divides by is the household's and not theirs.

Four more figures made of records arrived with 1.1.0, and the sweep before the tag found
every one of them open. Three close, because a figure of this shape cannot be narrowed
without becoming a number that is neither the household's nor theirs, and one narrows:

1. A card invoice is the whole of what the card will charge, whoever made the purchases,
   so the invoice screen closes to them and says why. The card standing on the overview
   refused from the start and the two other doors into the same sums did not.
2. What is left on a benefit card is made of every lunch on it. It answers nothing for
   them, and the overview draws no line for a card it cannot read.
3. The allowance of a benefit card, which the month of a space counts as money that came
   in. It counts as nothing for them, like every other figure that belongs to the space.
4. How many records are charged to an account, which counts what the asker can see. Only
   whoever runs a space can delete an account, so no screen showed them the number, and
   the contract and the route answered it to anybody signed in.

The pattern in all four is the one the whole registry is about: a permission every role
holds, asked on a reading that is about the household. `transaction.read` and
`account.read` are the two to be careful with, because they are the two that say yes to
everybody.

The currency of a space is settled by its first record. Changing it converted nothing, on
purpose, which is right for a record and wrong for every total, so the correction is
allowed while a space is empty and refused afterwards. That closes a class of wrong numbers
rather than relabelling them.

A control no longer names a permission. It names the call it makes, and the permission is
read from one table, `packages/storage/src/methodPermissions.ts`.

This registry used to end by admitting that nothing checked whether a control named the
permission its repository actually asserts. The browser tests walk a Viewer and a Logger
across the screens, which catches a control that is offered and would be refused, and
nothing caught a control that asked for the wrong permission and happened to agree today.
One did: the button on the overview that says a promise did not happen deletes the record
and was drawn behind the update permission. It agreed with the refusal behind it by
accident, because the two permissions hold the same four roles, and it would have begun
lying the day they parted, in a release about something else.

The table is not a second opinion about the matrix either. Every entry in it has a
permission probe in the conformance suite, and two assertions tie the two together: every
probe agrees with the table, and every row of the table has a probe. So a permission moved
in the matrix reaches every button with nothing copied by hand, and a row nobody proved
cannot be added.

What the probes prove, exactly, because the strength of this depends on it: for each call,
that it refuses exactly the roles its permission refuses, on all three engines, over the
four roles that are not the owner. The owner is not walked, so a row whose permission the
owner does not hold is proved one role short. There is one such permission, `space.leave`,
which belongs to everybody except the owner, and the call behind it is `members.leave`.

(Corrected in 2.0.0: until then this paragraph said more than was true. A logger was probed on
a record somebody else wrote, so the answer was "there is no such thing" before the permission
was ever read, the probes accepted that as a refusal, and a wrong refusal of a logger's own
record could not have shown. And eight calls the screens make were in no row at all: settling,
changing and removing several records, changing a plan onwards, removing a plan, marking the
earlier invoices as paid, moving a purchase to another invoice and saying which day an invoice
closed. Since 2.0.0 the logger is probed on a record and a plan of its own, every refusal has to
be a refusal of permission, the eight have rows and probes, and a test reads the screens and
fails on a call about a record or an invoice that has no row.)

What stays a judgement nobody checks is where `seesOwnRowsOnly` is applied. The predicate
itself gained unit tests in the same release, in `packages/storage/src/actor.test.ts`, over
every role and over an actor. It is not a permission and is in no matrix, deliberately,
because it is a narrowing rather than a refusal, so which screen closes to that role is
still decided by hand, and the browser tests walking a Viewer and a Logger are the only
thing covering those decisions.
