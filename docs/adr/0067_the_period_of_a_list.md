# 0067. The period of a list, and a filter that follows the calendar

Date: 3 October 2026

## Status

Accepted. Amends registry 0047, which put the filters of the list in its address, in three
places: the period is the one filter that adds an entry to the history, a period can be a year,
and a saved filter keeps the month it is and the year it is as words rather than as dates. The
months ahead in a closed group (item F.3.2 of the request for 2.0.0) and the way a saved filter
keeps its period (item F.6) were decided here and wait for the owner's confirmation.

## Context

Registry 0047 left three things open, and 2.0.0 found two more.

1. Only the list and the invoices read their month from the address. The month, the reports,
   the calendar and the paper report each held it in a state of their own, or read
   `window.location` once, so a link could not say September and the back button left the
   screen instead of going back a month.
2. Every write of the list replaced the entry it was in, the period included, so the back
   button never reopened the month before.
3. The list showed one month or every month, the second as one column four years long when a
   purchase was in forty eight parts: the link of each account on the overview opens every
   month, so the first thing it showed was 2030.
4. The repository gave two hundred records, the footer added up those two hundred, and nothing
   said there were more. Records written in one instant, which is what an import does, came in
   an order the database chose, so a second page could repeat some and skip others.
5. A saved filter kept the month it was saved in. "Lazer", saved on the twenty eighth of
   October, opened October on the fifth of November, and the mark that says which filter is on
   screen said none was.

## Decision

**Every screen that picks a month keeps it in its address,** under `mes`, and the list also takes
`ano` for a whole year and `mes=tudo` for every month; with both, the month wins. Anything
else is dropped, as 0047 decided. The year is a number in the address because the router reads
`ano=2026` as one, and writes a string of digits between quotes, which nobody types.

**The period is written when the person stops changing it,** three hundred milliseconds after
the last change, as an entry of its own in the history. Walking eleven months with the keyboard
is one entry and not eleven, and the back button reopens the period before. Every other filter
still replaces the entry it is in, as 0047 decided, so the back button does not walk through a
search one letter at a time. What was typed on the month screen is cleared whenever the month
changes, the back button included, because a figure typed for October is not November's.

**A year and every month are grouped by month,** newest first. Each group opens with the name of
the month, which leads to that month with the rest of the question kept, and what the group adds
up to. The screen opens with one sentence, as registry 0044 asks of every screen but the
overview: "Em 2026, o que está na lista soma R$ X de entradas e R$ Y de saídas."

**In the year it is, and in every month, the months after this one are a closed group at the
top,** "Ainda vão acontecer", with how many records and what they add up to. It is read from the
database only when it is opened. In any other year nothing is ahead of this month, or all of it
is, and the group would be the whole list or nothing.

**What the list adds up to comes from the database,** over every record the filter reaches and
never over the rows on screen: `transactions.summarize`, with the same conditions as the list,
in one function the two share, so a filter added to one cannot be forgotten by the other. It
counts records ahead and never a benefit, which is worked out and not written. A move between
accounts and the payment of an invoice are neither money in nor money out, unless the list is
narrowed to an account: then what leaves it is out and what reaches it is in. The footer says
"Somando o que está na lista", never "Entrou" and "Saiu", which are the money that came and went
and are answered elsewhere.

**The list says how many of its records are on screen,** "Mostrando 200 de 250", and "Mostrar
mais" brings the next two hundred. The order ends with the identifier, so a page never repeats
or skips a record.

**A saved filter keeps no month for the month it is, `thisYear` for the year it is, `""` for
every month,** and any other month or year as it is written. A row from before 2.0.0 has a month
in it and keeps opening that month; saving it again is what moves it, and the changelog says so.
The mark of the active filter compares the row with what the same function writes for the list
on screen, so the two cannot disagree.

## Consequences

A link can say September on every screen that has a month, and the back button walks months.

The list of a year is a list a person can read: what is ahead is out of the way and counted, and
what each month adds up to is beside its name.

A total on the list is the total of the list. A busy year is no longer two hundred records and a
sum of two hundred records presented as the whole.

The control that chooses the period on the list is, for now, the month field with two buttons
beside it, "O ano todo" and "Todos os meses". The picker of item F.1 replaces it on every screen
once the owner chooses one of the two drawn for it.
