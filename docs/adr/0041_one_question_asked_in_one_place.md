# 0041. One question asked in one place, and a check that keeps it so

Date: 29 September 2026

## Status

Accepted. Describes the three origins built in 1.0.4 and what 1.0.5 learned about keeping
them. Amends registry 0005, which set out the roles and the permission matrix.

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

A logger reads what they wrote on every screen, which took nine queries in five
repositories. Where a figure belongs to the space rather than to a person, an opening
balance or what a recurring bill will owe, it counts as nothing for them rather than being
mixed with their own rows, because a household opening balance plus one person's records is
neither number. Two things stay outside that rule and are written down as such: they read
who owes whom, because they are part of that count, and they do not read the log of what
happened in the space.

The currency of a space is settled by its first record. Changing it converted nothing, on
purpose, which is right for a record and wrong for every total, so the correction is
allowed while a space is empty and refused afterwards. That closes a class of wrong numbers
rather than relabelling them.

What is still not checked by anything: that a control on a screen names the permission its
repository actually asserts. The browser tests walk a Viewer and a Logger across the
screens, which catches a control that is offered and would be refused, and nothing catches
a control that asks for the wrong permission and happens to agree today.
