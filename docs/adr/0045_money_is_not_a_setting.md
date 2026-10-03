# 0045. Money is not a setting

Date: 29 September 2026

## Status

Accepted. Amends registry 0022, which grouped the screens into five sections.

## Context

Registry 0022 grouped the screens by the question somebody came to answer: the overview,
records, planning, reports and settings. Accounts went into settings, and it was the
screen that section opened on. Cards went nowhere at all: they were a read only panel at
the foot of the accounts screen, reachable by scrolling past a table.

That is wrong about what an account is. An account is where the money sits and a card is
how it is reached, and somebody looking for either of them is not looking for a setting.
They are looking for their money. Putting them behind the same heading as the categories
and the backup taught that a bank account is a preference.

It also made three of this release's changes awkward to find. Correcting an account, the
allowance on a benefit card and the closing day of a credit card are all things somebody
does while thinking about money, and all of them were two levels inside settings.

The third of those three only became true late: the model took a name, a place, an opening
balance and an allowance, and not the closing day, the due day or the limit, so this
sentence described a screen that did not exist yet. The sweep before the tag found the
sentence rather than the gap, which is the right way round: the closing day is the field on
that form most likely to have been a guess, the invoice a new purchase lands on is worked out
from it, and a bank moves it. It can be corrected now.

(Corrected in 2.0.0: this said every invoice of the card is worked out from the closing day.
Only the invoice of a purchase written from then on is. A purchase carries the invoice it was
stamped with when it was written, so correcting the closing day leaves every purchase already
written where it is, and an invoice chosen by hand, the one a payment names or a purchase moved
to, does not read the closing day at all. "Esta fatura fechou em", on the invoice screen, is
what moves the purchases of the days between.)

## Decision

Six sections, not five. Accounts is one of its own, with the wallet mark, and it holds
the accounts and the cards. Settings keeps the categories and the data screen, and opens
on the categories.

The rule behind the grouping does not change, and this is the rule applied rather than
bent: a section is a question somebody arrives with. "Where is my money and how do I
reach it" is one of those questions. "How is this application set up" is another, and it
is a much smaller one than it looked when it had an account inside it.

## Consequences

The bottom bar on a telephone carries six marks rather than five. It is a row of icons
over words and it holds six at the narrowest width the product supports, which was
measured rather than assumed.

Every route is unchanged, so every link, every address somebody saved and every test that
walks to a screen by name still works. What moved is which heading a screen sits under.

Accounts has no second level any more, because it is one screen, and the cards panel
lives on it. That is one fewer row of links on the way to the most used screen in the
section.

The command palette already reached every screen by name and is unaffected, which is what
made this a rearrangement rather than a migration.
