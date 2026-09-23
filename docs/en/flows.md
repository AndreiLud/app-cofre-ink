# Flows

What actually happens, in the paths that matter.

## Arriving for the first time

The front door asks one question: use this browser alone, or connect to a server.

**Browser alone.** A profile is made on the spot with a default name, a personal space
is created, the starting set of categories is written, and the person is offered
demonstration data they can refuse. Nothing is asked. No email, no password, no name
until they want to change the one they were given. The choice is remembered, so the
door is not shown again.

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

**Export.** The whole thing as JSON, or as a spreadsheet, per space or all of it.

**Backup and restore.** The JSON restores anywhere, into a fresh installation or
alongside what is already there. Whoever restores becomes the owner of what they
restored and of nothing else.

**A copy that lives somewhere.** A file, a WebDAV folder, an online database, or a
Google spreadsheet as a mirror. All of them are reached from the browser, with
credentials that stay in that browser. The server never holds them and never calls
them.

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
