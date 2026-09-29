# 0044. Four figures on one line

Date: 29 September 2026

## Status

Accepted. Amends registry 0023, which set out the three surfaces, the two line weights
and the one colour, and names the one place this screen goes past it.

## Context

The product brief promises that somebody opens Cofre and sees, in seconds, four things:
how much they have, how much is left to spend this month, what falls due in the next days
and whether they are putting aside what they planned.

The overview answered two of them. It opened with one number, which was every account
added together, so a card invoice was netted off it and a meal voucher was counted as
cash. Under it sat a second number with no horizon on it at all, counting every planned
record however far away, beside a list of the next fifteen days, so the number and the
list under it were answering different questions. How much was left to spend was on no
screen. Whether the saving rule was being kept was three panels down.

Three layouts were drawn with the real components and the real numbers, and the owner was
shown all three at two widths in both themes before anything was built.

## Decision

The overview opens with the four figures on one line: what you have, what is still there
to spend this month, what falls due before the month ends, and what is still to be put
aside. The first is one size larger than the other three. On a telephone they are two by
two; on a wide screen they are four across, separated by a rule.

Under them, on lines of their own, what is owed on each card and what is left on each
benefit card, because neither of those is money somebody has and both were inside the old
headline.

**This is the one place in the product that comes near a panel of indicators**, and
registry 0023 spent a release removing those. It is allowed here, and only here, because
what 0023 objected to is not present: there is no box, no bar, no second colour and no
second type family. It is four labelled numbers in the faces everything else uses, with a
hairline between them. What 0023 objected to was one flat surface where the eye had
nowhere to land, and four landing places is the opposite of that complaint.

The rule it sets, so this does not spread: a band like this is allowed on a screen whose
whole purpose is to answer several questions at once, which is the overview and nothing
else. Any other screen has one question and opens with one sentence.

Every number on the screen comes from the model. The overview adds nothing up that
another screen also adds up, because that is exactly how the overview, the check up and
the projection came to give three different answers to the same question.

## Consequences

Two of the four figures did not exist and are new pure functions in the core, with tests:
what is still there to spend, and what counts as money at all.

The list of what falls due is cut at the near end now. It was fetched newest first and
sorted oldest first afterwards, so a household with more than twenty planned records in
the next fifteen days was shown the twenty furthest away and the bills due tomorrow were
dropped. The same truncated list fed the notices, so those went missing under the same
condition.

A card invoice appears there as one bill on the day it falls due, rather than as one line
per purchase on the day of each purchase, which is what a card actually does.

What was promised for a day already gone appears at the top, as something to answer, with
a button for each answer. It used to disappear: the list looked forward from today, so a
bill nobody had confirmed simply left the screen while going on being counted.

Each account opens the records charged to it, which is the question somebody has the
moment a number surprises them.

Two of the three layouts were not chosen and are not kept. The screen that drew them, and
the spec that photographed it, went with the decision.
