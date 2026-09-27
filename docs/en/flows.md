# Flows

What actually happens, in the paths that matter.

## Arriving for the first time

The front door asks one question: use this browser alone, or connect to a server.

**Browser alone.** A person is made on the spot with a default name, a personal space is
created, the starting set of categories is written, and the person is offered
demonstration data they can refuse. Nothing else is asked, ever: no email, no password,
no name. What the space is called and what it counts in are corrected in one screen, and
the name of the person is shown to nobody. The choice is remembered, so the door is not
shown again.

**A server.** The address is typed in. The interface asks that server whether it has
anybody on it yet. A server with nobody opens on creating the first account rather than
on a password box that cannot be filled. A server with people opens on signing in.

Either way, what happens after is the same product, because the screens do not know
which session they are holding.

## Writing a record

Three ways in, all landing in the same repository method.

1. **The form.** Every field, for the record that needs them.
2. **One line of text.** `mercado 42,90 ontem nubank 3x` becomes an expense of 42.90 in
   groceries, dated yesterday, on the Nubank card, in three instalments. The parser is
   in `packages/core`, is pure, and is the most heavily tested single thing in the
   repository. What it could not read is left blank rather than guessed.
3. **A file.** See the next section.

On the way in, the rules run. A rule matches text and sets a category, a priority or an
account. Rules are ordered and the first match wins. A correction teaches the rule that
was wrong.

An instalment purchase writes every instalment at once, sharing a group identifier, so
the whole set can be removed as one thing.

A record on a credit card is placed in the invoice it belongs to, which is decided by
the closing day of the account and not by the calendar month.

## Reading a statement

```
file -> reader -> records -> review -> written
```

1. **The reader** is chosen by what the file is: CSV, OFX, QIF, XLSX, JSON, or the PDF
   reader written by hand for card invoices and receipts.
2. **The account is guessed**, and the screen says why it guessed that: the name of the
   file, an institution in the text, a card number.
3. **Columns are remembered per file shape**, so the same bank is mapped once.
4. **Repeats are found** by comparing what is already in the space around the days the
   file covers.
5. **Nothing is written until somebody has seen it.** The review is a screen, not a
   confirmation dialog.

## Sharing an expense

A shared space has members. An expense can be split evenly, by share, or in proportion
to declared income. The split writes rows saying who owes what part of that one
expense.

It is between the members of the space the expense is in, and only them. Somebody who
is in two shared spaces with different people sees the people of the space they are
looking at, on the division and on the settle up alike. A share belongs to the person it
was typed for, by identifier and never by the place they hold in a list.

The settle up screen adds it all up and says who owes whom, once, in the fewest
payments. Recording a payment closes that part. Nothing is moved between accounts: the
product records what happened between people, it does not pretend to be a bank.

## Two devices agreeing

Sync is one round trip. A device sends the entries it wrote since the last time, and
asks for everything it has not seen.

```
device                                server
  |  changes it wrote, and a stamp      |
  | ----------------------------------> |
  |                                     |  applies what the caller may write
  |  everything since that stamp        |
  | <---------------------------------- |
```

The rules that make it safe:

1. **A device may only write in its own name**, or in the name of a local profile that
   belongs to no account. Anything claiming to be written by somebody who has an
   account here is refused. That is what stops a member of a shared space putting words
   in another member's mouth.
2. **Order comes from the logical clock**, not from either machine's wall clock.
3. **A space that the server has never seen can arrive with a push**, and is adopted by
   whoever pushed it, but only if it has nobody in it. A space that already has members
   belongs to them.

There is also a path with no server at all: a file carried from one device to the
other, carrying the same change log.

## Taking everything away

A copy is one of two things and never a third, and the data screen has one panel for
each. Either somebody makes it, which is a file they download and keep, or a machine
makes it, which is a place of theirs kept up to date without being asked. Two buttons
that both wrote a JSON file, in two different sections, with a third file that was not a
backup sitting between them, is how somebody ends up holding the wrong one.

**Backup.** One file, whichever spaces were ticked, named `cofre_backup_YYYYMMDD.json`.
All of them start ticked. A shared space where the person is neither Owner nor
Administrator is shown unticked and says why, because taking a copy of a whole space is
a decision of the people who run it. With one space there is nothing to choose and the
list is not shown.

**Bringing it back.** The same door takes a backup file and the file kept for syncing
alike: the second one is a change log, and folding it gives back the rows the first one
would have listed. A file holding several spaces is listed in the confirmation, all
ticked, and only the ticked ones are brought back. It adds what is missing and changes
nothing that is already there, whoever brings a space back that nobody here has becomes
its owner, and a personal space merges into the personal space there already is.

**Taking it to another program.** A spreadsheet or a CSV of the records, behind a line
of text, because it is a once a year thing and it is not a backup: it carries no
identifiers and nothing reads it back.

**The automatic backup.** One place, picked from three: a server of yours, an online
database, a WebDAV folder. It covers every space at once. It is reached from the browser
with credentials that stay in that browser, and the server never holds them and never
calls them.

Turning it on is the explicit action the fifth golden rule asks for, and after that it
runs on every change, once the typing stops, plus whichever of two it was told: when the
application opens, and every so often.

Before it writes anything it reads what is there and compares, by which entries each side
holds rather than by a date, because two devices that each wrote one record are both
newer than the other. Four of the five answers it can get are obvious and it acts on
them: nothing there, the same on both sides, one side ahead either way. The fifth, both
sides wrote since they last agreed, is the one where choosing would mean throwing
somebody's records away, so it stops and asks. Keeping both is the answer that loses
nothing and is offered first; the two that do lose something hand back a file of the side
that is going, first, so restoring it is the way to undo.

A server of yours is the exception to the comparison: there the two sides are the same
space rather than a copy of it, and they merge record by record the way two devices do.

Bringing a file back while this is on makes the two sides differ, so it asks whether the
file should become the copy as well.

**A spreadsheet as a mirror.** A Google spreadsheet of yours, rewritten every time, one
way only.

**Erasing.** Two separate doors, because they do different things. Erasing a space
empties it and removes it if it is shared. Erasing everything removes every space this
account owns and leaves the ones it merely belongs to. Both say exactly what they are
about to do, with counts, before they do it.

## What the figures say back

The check up reads the household's own records and reports what it found, heaviest
first. A verdict, four vital signs, a plan with a month on each step, the trend against
the months before, what the cards have already committed, what happens if the income
stops, which months of the year are dearer, and what idle money costs against
inflation.

Every finding carries the figures it was made from inside the sentence, so it can be
checked rather than believed.

It never says what to buy, where to put money, or which investment is better. That line
is deliberate and is in
[decision record 0029](../adr/0029_four_signs_and_a_verdict.md).
