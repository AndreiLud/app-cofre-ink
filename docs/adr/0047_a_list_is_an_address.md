# 0047. A list is an address

Date: 2 October 2026

## Status

Accepted. Extends registry 0028, which decided what the front door of an address anybody can
open has to do, to the one screen inside the application where an address was doing no work.

## Context

The records screen holds seven filters: the month, a word to search for, the kind, whether it
happened or is still promised, the account, the card and the category. All seven lived in one
piece of component state. Nothing read or wrote the address, and the route declared no search
parameters at all, so a hand typed address was ignored too.

What that costs is small every time and constant. A filtered list cannot be bookmarked, cannot
be sent to the other person in a shared space, does not survive a reload and does not survive
the back button. Somebody who narrows a list, opens a record, and comes back has to narrow it
again. And it was not only a missing convenience: the overview had a link per account pointing
at that screen, carrying the account in the address, and the screen read nothing, so a link
that promised to open the records of one account opened the unfiltered list of this month.
Nothing failed, so nothing said so.

Two screens already did this properly. The invoices screen takes the card and the month from
the address, which is what makes the buttons on the overview able to name a card. The month on
paper reads its month from the address directly.

Saved filters are a second answer to a neighbouring question, and they already existed: a
named row in the space's database, per person, for the question somebody asks every week on
whichever device they are holding.

## Decision

**The address is the only source of truth for what a list shows.** The filters are not held in
state as well. Narrowing the list is a change of address, and the screen renders what the
address says. Holding both and keeping them in step is exactly how a click, a reload, a link
and the back button come to disagree, and there is no version of that bookkeeping that is
shorter than not doing it.

Every write replaces rather than pushes, so the back button leaves the screen instead of
walking back through one entry per keystroke in the search field.

**A saved filter is a starting point, applied by navigating.** It is not a second source of
truth. Pressing one writes the address, because a saved filter that only set state would leave
the address pointing at the previous list, and a reload would silently undo it. The stored
shape is untouched: rows already in people's databases hold the keys they always held, and an
old row missing one still falls back the way it did. Two encodings, one shape they both land
on, and the free consequence is that a link which happens to match a saved filter lights that
filter up as active, because the comparison is against that one shape.

**The names in the address are Portuguese**, like every other address in this application:
`mes`, `busca`, `tipo`, `situacao`, `conta`, `cartao`, `categoria`. They live in one module,
`apps/web/src/lib/recordFilters.ts`, with the two readings and the one writing, so a name
cannot be spelled one way by a link and another way by the screen. That module is what caught
the dead link from the overview: the moment the route said what it accepts, the type checker
refused the link that was carrying the wrong name.

**Nothing is refused.** An address is typed by people and pasted by them. A word that is not
one of the ones this screen knows is dropped and the screen opens on its default, which is a
more useful answer than a blank page with an error on it. An identifier is checked for shape
only and not for existence, because the screen already falls back when an identifier names no
row it loaded, which is what the invoices screen has always done.

**What is left out of the address**, and why, because the temptation is to put everything in
it. Which filters are visible is a view state and is derived from how many are set, so a link
that carries a kind opens with the control that set it in view. The selection of rows is left
out on purpose: a link that arrives with rows already ticked for a bulk delete is a hazard and
not a feature. Dialogs and transient messages are not a question about the data.

**An empty month means every month, and the address says so with a word.** It cannot say it by
leaving the name out, because leaving it out is how the address says "this month", which is the
default the screen opens on. So the two are told apart by `tudo`, and what was never sorted
into a category is `sem`.

## Consequences

The records screen is reachable with a question already asked, which is what the overview's
links per account have been promising since they were written.

Every link into that screen now has to use the names in the module. There is one today, from
the overview, and it carries `tudo` as the month as well, because the question it answers is
what has ever been charged to this account and not what was charged to it this month.

The same treatment is now obviously missing on the reports screen, the budget screen and the
calendar. They are not changed here. Doing all four at once would be one commit nobody can
review, and the reports screen already reads its month from the address by another route,
which is its own small inconsistency to resolve later.

A list of records is now a thing somebody can paste into a message to the other person in the
space. Nothing in the address is private beyond what that person can already see: the
identifiers are rows of a space they are a member of, and the permission layer answers for
what they may read, exactly as it does when they open the screen themselves.
