# 0056. The benefit is income wherever income is read

Date: 3 October 2026

## Status

Accepted. Decision 5 of 2.0.0, for part 1, items B.6 and C.1 to C.4. Completes registry 0043,
which said the allowance of a benefit card is what came in and left most of the screens that
read what came in without it.

## Context

Lunch bought on a meal card is spending like any other, so every screen that adds up a month
counts it. The allowance that paid for it was counted on the overview and nowhere else: the
comparison of the month screen, the twelve months of the reports, the flow of the reports,
the month on paper and the check up all read what came in without it, against spending with
the lunches in. With a salary of 5,000, 4,500 spent at the bank and 900 of lunches on the
card, the check up said every month that the household spent 400 more than it earned, and
the flow drew the 900 as money taken out of the reserves.

The same figure for the same month was two figures, which registry 0044 forbids.

## Decision

The allowance that landed on a benefit card is income on every screen that reads income:
the overview, the comparison of the month screen, the twelve months and the flow of the
reports, the month on paper and the check up. One reading works out the landings of a range
of days, `benefitLandingsIn` in `packages/storage`, from the card's history of allowances and
the day counting starts on it, never past today and never after the card was archived. Every
screen reads it, so a month has one benefit wherever it is shown.

It is narrowed the same way everywhere: somebody who only sees their own records gets none of
the household's allowance, because the allowance belongs to the space and the rest of their
reading is made of their own rows.

The reports keep the benefit as a figure of its own beside the income, so a screen can say how
much of what came in was benefit, and every screen that shows what came in shows the two
together. The flow of the reports draws it as a source named after it.

The check up adds it to the income of each month it reads, but only in a month somebody kept
records in, and in the month in hand. A month of nothing but the allowance would be a month
with no spending in the medians the findings are made of.

What a benefit card has spent, and what is due on one, are not money leaving the bank: the
projection and the list of what falls due leave them out, by one predicate built from the
kinds the core calls benefit.

## Consequences

A household with a meal card reads the same month on every screen, and a month of lunches
paid by the card closes even, as it did.

The question of what happens if the biggest income stops still reads the sources written as
income, and the allowance is not one of them, because it usually stops with the job that
pays the salary.
