# 0068. What repeats has a screen, a chain and one writer

Date: 3 October 2026

## Status

Accepted. Amends registry 0012, which made a recurrence one rule written once, and registry
0021, which made housekeeping something that writes no rows. Corrects item 3 of the list in
registry 0041 about what a logger sees. Three choices were made here and wait for the owner's
confirmation: how a change continues a series (items 4 of part 2, G), what an import does with
a line a series already wrote (item 5.6), and the days already gone of a new series (item 6).

## Context

Release 1.2.1 left the things that happen again where nobody looks for them and wrong in ways
nobody could see.

1. They lived at the bottom of the calendar. The finding that says how much the repeating
   charges come to sent people to the list of records, where a series is not a line.
2. Only the calendar wrote what a series owed, sixty two days ahead, and only when it was
   opened. A rent set up there and never looked at again was missing from the overview's list
   of what falls due two months later, and from "Todos" for every space nobody opened.
3. Editing a series rewrote the rule in place. The records it had written ahead kept the old
   amount, and deleting them so they would be written again did nothing: a deleted day counts
   as written, which is what stops a day somebody said did not happen from coming back.
4. Each device named the record of a day at random. Two requests to a server at once wrote the
   day twice, and the copy of a day from another device brought back the one deleted here. A
   deleted row is not in a backup, so a restore brought back every "Não aconteceu".
5. The first day a series could write was worked out from the moment its row was created, and
   a restore writes that moment again.
6. A record could not be said to repeat where it was written, a series charged no card, had
   no end, and a series on an account that was deleted went on writing on it.
7. Deleting a series asked nothing and took every record still to come, touched or not.

## Decision

**A screen of its own**, `/recorrentes`, after the list in Lançamentos, in the palette, behind
the finding about repeating charges and linked from the calendar. It opens with one sentence:
"Todo mês o que se repete tira R$ X e põe R$ Y", where a week is fifty two twelfths of a month
and a year a twelfth (`seriesInAMonth` in `packages/core`), and a move between accounts is in
neither. Each control is drawn by the call it makes: Editar and Pausar by
`recurrences.update`, Apagar by `recurrences.remove`. A viewer sees the series with no menu; a
logger sees them with no sentence, no button and no menu.

**A change applies from the next occurrence on, as a chain.** The series ends today and a new
one follows it (`follows_id`), starting on its first day in a period the old one left empty, so
the rent of October paid on the fifth and moved on the twenty eighth to the tenth starts on the
tenth of November and not on the tenth of October as well. What the old one wrote after its end
goes, unless somebody touched it: a record changed by hand stays, and the new series writes
nothing in its period. Whether a record was touched is asked of the record, in
`isUntouchedOccurrence`, never of its timestamps, which a restore writes equal. Pausing takes
back the untouched days ahead; coming back ends the paused series the day before and starts its
continuation on the day of the return, so the months of the pause are not written. Deleting
takes the whole chain and only the untouched days ahead, and asks first, naming them
(`removalPreview`). The chain is one line on the screen, a change asked of an older link goes
to the one running, and "Ver lançamentos" lists what the whole chain wrote. This amends 0012:
a recurrence is a chain of rules, each one over its own stretch of days.

**One writer, the application when it opens.** A hook in the shell, beside the copy that keeps
itself, writes what the series owe in every space where the person may write a series: when the
application opens, when another space is chosen and when the day turns while it is open. The
calendar writes nothing of its own any more and the server writes nothing by itself. This amends
0021: writing records when the application opens is the one exception to housekeeping that
writes no rows, because a record a series owes is not housekeeping, it is what the person set up.

**The record of a day is named by the series and the day** (`occurrenceId`, a UUID of version
8), inserted only when absent. Two writers at once leave one record; an identifier known here,
deleted or not, counts as written; and the copy of a day from another device does not bring
back one deleted here, because folding the log keeps a deletion against a later insert. A day
somebody deleted is also kept in `recurrence_skips`, which a backup and the change log carry.

**The first day is kept on the series** (`writes_from`). A new series writes from its own first
day, or from today when the person ticks "Deixar de fora", and before it is saved the form says
how many days already gone it writes and what they come to. A series from before 2.0.0 gets the
first day of the month it was written down in, the first time it writes, through the change
log.

**A series has a card, an end, and a kind it was born with.** A series of money out uses "Pago
com" and every occurrence carries the card; "Até" ends it. A new series is money out or money
in; a series of moves is born only from "Repete todo mês" on Mover entre contas, and shows its
two accounts. A series on an account or card deleted or put away stops and says why, and
deleting an account ends its series.

**"Repete" on the form of a record** writes the series, the record of the day typed and the
days ahead in one transaction (`recurrences.startWith`), which asks for the right to write a
series and to write a record. A record a series wrote says "repete" on the list and on the
overview, its menu leads to the series, and correcting it asks "Só este" or "Este e os
próximos".

**Inside a transaction every read goes through the transaction.** A browser runs every query in
one queue, so a read through the driver a repository was built with, made while its own
transaction is open, waits for itself and the application stops with nothing on screen. The
conformance suite now runs the engine of the browser through the same queue.

## Choices to confirm

1. A change continues the series from its first day in a period the old one left empty, and a
   series that has not started yet is continued too, from its own first day.
2. An import treats a line as already here when a series wrote the same amount on the same
   account within three days, unticked, in a statement as well (written with the import, part 2,
   E.15).
3. A new series writes the days already gone from its start unless "Deixar de fora" is ticked,
   and the box starts unticked. This reverses, for new series, the rule that a series never
   writes before the month it was written down in; the form now says how many days and how much
   before anything is written.

## Consequences

A series is a line on a screen that says what it costs a month, and changing it never rewrites
what happened.

What a series owes is written whatever screen is open, in every space, and a day is written once
however many devices and requests write it.

The consolidated view's list of what falls due reads every space (part 2, J.8.3, done here
because it is where a series of a space nobody opened shows).
