# Changelog

Every release, what changed in it, and what to do about it if you are running this.

Versions follow semantic versioning. The first number changes when something that worked
breaks, the second when something is added, the third when something is corrected.

## 1.1.0

Released on 30 September 2026. A large release, and the first one that changes what a figure
means rather than only correcting one. It answers a question this application had never
really answered, which is what a credit card is: until now a purchase on a card took the
money out of the bank on the afternoon of the purchase, and the invoice was a filter over
records rather than a thing with a state. It also gives the overview four figures on one
line, turns a benefit card into the allowance it actually is, lets a whole instalment plan be
corrected at once, and puts the whole month into one file the browser writes.

Then, before the tag, the reading of 1.0.5 was turned on this release, four times over and
with instructions to refute rather than to agree: the money and the arithmetic, the
permissions and what a logger reads, the interface and both languages, and every sentence
this release had written about itself. It found forty six things and it was right about most
of them, including four figures the release had newly opened to somebody who may not see
them, two sums that added a foreign currency as though it were the local one, a card whose
headroom took its instalments off twice, and five sentences in the registries that described
code this release had not actually written. All of it is below.

> **If you are updating from 1.0.x, read this.**
>
> **Se você está atualizando da 1.0.x, leia isto.**
>
> Your file is carried across and nothing is deleted. Four things will read differently
> afterwards, and all four are the old readings being wrong rather than the new ones.
>
> 1. **What you have, and what you owe, are two figures now.** The overview used to take a
>    card invoice off the one number at the top, so the money in the bank looked smaller
>    than it was and a card with nothing on it looked like money. What you have is the
>    current accounts, the savings, the cash and the investments. The cards and the benefit
>    cards are on their own lines under it.
> 2. **A subscription charged to a credit card reaches its invoice.** Writing a series never
>    worked out which invoice it belonged to, so every record a series had written on a card
>    was on no invoice at all and the card showed less than it would charge. The upgrade
>    repairs those rows, so an invoice of yours may be larger than it was yesterday. That
>    number was always what the bank was going to ask for.
> 3. **The months ahead count the invoices, and the balance they start from is the one the
>    overview shows.** The projection counted only records still waiting to be confirmed,
>    which a card purchase never is, so nothing your cards were about to charge was in it.
>    It also treated paying an invoice as money that had not moved, so it opened over by
>    every invoice you had ever paid. Both are corrected, and the months ahead will usually
>    read lower than they did.
> 4. **A benefit card needs its monthly allowance written down.** VR, VA, VT, culture and
>    mobility are an amount that lands on a day each month and is spent down, and nothing is
>    written when it lands, so what is left has to be worked out from the allowance. Until
>    you fill it in, the card says so instead of guessing. What you typed as the opening
>    balance of that card keeps counting: it is what was on the card the day you wrote it
>    down, and it is the starting point of the sum.
>
> Nothing is asked of you and nothing is converted. Open Painel and Faturas once, and fill
> in the monthly allowance of any benefit card under Contas.

### Added

**The invoice is a thing with a state, and it can be paid.** An invoice of a card has a
month, a day it closes, a day it falls due, what it charged, what has been paid against it
and what is left, and it is open, partly paid, paid or in credit. Paying it is a transfer
into the card marked with the invoice it pays, with the amount you type rather than the
amount it says, because paying part of one is a thing people do and the card does not refuse
it. What is left stays on that invoice with no interest added: this application does not
model revolving credit and says so on the screen rather than inventing a number. A payment
that names no invoice, which is what a transfer made by hand or brought in from a statement
is, pays down the oldest invoice still owing, which is what a bank does with it.

**A purchase on the wrong invoice can be moved**, one invoice earlier or later, and every
part of an instalment plan moves with it. Banks close a day either side of what any
application expects, and a purchase on the closing day is the one that lands in the wrong
month. Moved by hand, it stays where it was put: working the invoice out again from the
closing day would send it straight back.

**The overview answers the four questions it promises**, in four figures on one line: what
you have, what is left to spend this month, what falls due in the next days and whether what
you planned is being put aside. Under them, one line per card and one per benefit card,
what is late, what falls due with a card invoice as one bill, the month so far, the saving
and the goals, and where the money is with every account linking to its own records.

**A benefit card is an allowance with a day on it.** An amount, the day of the month it
lands, and whether what is left carries into the next period or is taken back. VR and VA are
one pot and carry by default; VT is topped back up and does not. A benefit card only spends:
it refuses money coming in and refuses a transfer out, because that is what the plastic in
somebody's pocket does.

**One field for what a record was paid with.** Card and account were two fields asking one
question, and answering the first without the second wrote a purchase onto no card. It opens
on the last way you paid, on this device and in this space.

**A whole instalment plan can be corrected from one part onwards.** This part, or this part
and the ones after it, and never the ones behind: what already happened happened under the
name and at the price it happened at. A name written over a plan keeps each part's number.
The day is not one of the things it changes, because each part falls on its own.

**The whole month in one file.** A page of its own at `/relatorio`, which the browser saves
as a PDF: the month in three numbers, the cards, the categories, the priorities, the last
twelve months, the limits, the saving and the goals, the check up, the months ahead and the
investments. Every figure has a table it can be read from, so the file works with a screen
reader. A month that has gone is read as it stood on its last day. Nothing leaves the device
to make it.

**An account can be corrected**: its name, where it is, its opening balance, and the
allowance of a benefit card. Deleting one says how many records are charged to it first.
What is already on a card invoice can be written down when the card is, as one record dated
today, because the cycle of a card you already own started before you got here.

**How much you can still spend this month**, which is what you can spend now, plus what is
still coming in, less what falls due and what you still mean to put aside.

### Changed

**The day says whether a record happened.** There was a tickbox asking whether it had
happened yet, beside a field that had already been given the day, which is two answers to
one question. A day that has not come has not happened, so the day decides and the form says
what the day you chose means.

**A record counts on the day it happens.** A purchase in six parts is six records written as
facts, five of them dated in months to come, and all six used to leave the balance on the
afternoon of the purchase while the same five were also counted as still to come next door.

**One definition of what counts as money**, in `packages/core`, which three screens used to
each have their own version of. What somebody has, what they can spend this afternoon, what
they owe on the cards and what is left on the benefit cards are four named questions now,
and every screen asks one of them by name instead of writing a filter of its own.

**The currency of a space is not a setting to be changed.** It is settled by the first
record, which the model has always held; the picker is switched off once the space counts in
one, and it says why instead of refusing after you press save.

**Accounts is a section of its own** in the navigation, with the wallet mark, and Settings
opens on Categories.

**The first part of a month ahead is called what it is:** already certain, which is the bills
written down for that month and the card invoices falling due in it.

### Fixed

**A record in another currency is added up in the currency of the space.** The total under
the list of records, three sums on the calendar and the division of a bill between people all
read the amount as written and labelled the answer with the space currency, so a dinner of
forty dollars in a household counting in reais went in as forty. Every one of them reads the
figure that was worked out at the rate of the day, which was already stored beside it. A
holding is stored in the currency of the space rather than in reais whatever the space says.

**A logger reads what they wrote wherever a figure is made of records.** 1.0.5 said this was
true of every screen; a series and a holding were outside it, and both are now written down
in registry 0041 as things that stay outside on purpose. The reports and the budget say whose
figures they are, which only the overview and the projection did, and the consolidated
overview says it about the spaces being added rather than about the one that happens to be
open.

**A refusal is drawn where the person is looking.** Handing a space over was offered where it
could not be done, the automatic backup said nothing about an address it could not use, a
series drew its refusal twice, and the file picker drew a refused file somewhere else on the
screen. Erasing a space with the backup on and the address half typed asked nothing at all
and left the backup running; it says what will happen to the copy now.

**One set of sentences for a refused invitation.** The invitation screen had a second set for
the same refusals, so a used link said one thing there and another thing everywhere else. It
reads the one translator now, like every other failure. A callout for a failure that screen
cannot be showing is gone, and so is a sentence nobody reads.

**A sentence that says whose job something is waits for the member list.** Until it arrives
every answer is no, so an owner was told for a moment that making an account, a rule or a
card belongs to whoever runs the space.

**A refusal names the button that is on the screen.** Leaving a space pointed at a button
called something else; it quotes the button's own words now, so the two cannot drift.

**A failure nobody can explain to a person leaves a trace.** A server that crashed reached
the screen as "I could not finish that" and wrote nothing anywhere. A statement a cloud
database refuses is a failure with the name of the place on it, like every other destination,
instead of a plain error carrying the raw text of somebody else's server.

**The share weights are sent only to the division that reads them.** Dividing evenly or by
income shipped a full map of weights nobody had seen.

**A list is cut at the end that was asked for.** A caller that wanted what falls due next
took the newest twenty and then sorted them the other way round, which showed the twenty
furthest away and dropped the bills due tomorrow. On a server the route then dropped the
order and the offset on the floor, so browser mode was right and server mode was not.

### Fixed by the sweep before the tag

**The overview counted the wrong bill, twice, and in the wrong currency.** Four faults in one
band of figures. Only the invoice still taking purchases was counted, so from the closing day
to the end of the month the bill the household actually owed was in no figure on the screen,
and what was left to spend read high by the whole of it. A planned purchase on a card was
counted as itself and again inside its invoice. In the every space view the money came from
every space and the bills from whichever one was open, under a heading that says it is about
all of them. And what is still coming in and still going out added the amounts as they were
typed, which is the very thing this release took out of every other total.

**An invoice, an allowance, a count of records and a month closed to somebody who only sees
their own records.** Four figures this release added, each made of every record on an account
whoever wrote it, each asking for a permission every role holds. The invoice screen closes
and says why, the benefit line is not drawn, the count counts what the asker can see, and the
allowance of a benefit card counts as nothing in a month made of one person's records rather
than being folded into it whole. Registry 0041 now holds all of them.

**A benefit card no longer pays an allowance in months it did not exist in.** The allowance
was multiplied by the landings of whatever range was asked for, so a card written down in
September credited a household eight hundred a month back to the beginning of its records,
and went on crediting one that had been archived. It counts from the period the card was
written down in, which is the period the first lunches on it belong to as well.

**A month ahead counts every record the opening balance has not.** Cutting the opening at
today was right and left a hole beside it: a record dated in a month ahead and written as a
fact is not planned, so the later parts of a purchase in six, and a month filled in from the
month screen before it arrived, appeared in no figure anywhere. The projection also opens
with the prices somebody typed for what is invested, which is what the overview shows, rather
than with what was paid into the broker.

**A card's headroom takes the instalments still to come off once.** They were subtracted as
what is owed and again as what is charged later, so a limit of five thousand with nine hundred
in three parts reported three thousand five hundred left instead of four thousand one hundred.

**Moving purchases between invoices is all of them or none.** Both doors moved the rows one
at a time, so a plan with one part ticked off against the bank, or a card with one in the
window, moved what came before it and then refused, leaving a purchase split between two
invoices with nothing saying how far it got.

**An instalment plan is corrected in the space it is in.** The mark of a plan is not renamed
when a backup is restored into a second space, so two spaces can hold two plans under one
mark, and asking the permission once on the first part found was asking about one space and
writing both.

**The closing day, the due day and the limit of a card can be corrected.** Registry 0045 said
they could and the model took four fields. The closing day is the one on that form most likely
to have been a guess, every invoice of the card is worked out from it, and banks move it.

**A callout with no words in it.** Two new screens titled their refusals with a key that
exists in neither language, so a failure came back headed `rules.somethingWentWrong`. One
sentence started with a day that was never passed to it. An empty account was described in
Portuguese as holding one record. Four sentences wrote the product name out instead of asking
for it. The printed file gave the day it was made and the months of its tables in the shape
the database keeps them in rather than the shape somebody reads. The
benefit line was always in reais. Three figures shared three columns at any width. Nine
sentences nobody reads are gone.

**The registries say what the code does.** Five sentences this release wrote about itself
were ahead of it: the first of the three parts of a month ahead, the list of what a logger
reads whole, a permission a logger does not have, where the projection starts from, and the
three fields of a card. Each one is either corrected or is now true because the code caught
up. The ten routes this release added are in both guides, and so are the four columns and the
three migrations.

**No card is no card, in a browser and on a server alike.** Found by the browser tests and
not by the reading, which is the right way round for this one: the one field that asks what a
record was paid with carries the card and the account together, and for an account with no
card at all it was handing back a card named by the empty half. The repository has always read
an empty identifier as no card and the route refused it as one too short, so the same record
was written in a browser and refused on a server. Both halves are corrected, and the two modes
now answer the same thing whatever reaches them.

**The file is called what it says it is called.** The month on paper names the document, which
is the only say a page has over the name a browser suggests when somebody chooses Save as PDF,
and the shell was writing its own name over it the moment the space arrived. So the file came
out called "Pessoal | Cofre Ink". It only did that in a build: React in development runs an
effect, undoes it and runs it again, which happened to leave the page holding the name, and
the browser test ran against the dev server and passed. Found by opening the built
application and looking at the tab. The test for it runs against the build now.

**A caption said `{{month}}` out loud.** One table on the printed file asked for a sentence
without the month that sentence is written around. Both languages held the same sentence with
the same name in it, so nothing in the build could see it. The check over the two languages
now refuses a sentence a screen asks for without the names it needs, which is the fifth thing
it refuses and the only one that catches a sentence that is right in the file and wrong on the
screen.

**The file for paper prints no keys and no nameless rows.** Money nobody sorted had an empty
first cell against two thirds of a month, and spending with no priority on it was a row headed
with the name of a translation key. The screen next door has had a sentence for each of them
all along. Looking at the pictures of the release is what found these, which is what the
pictures are for.

**The answer fits its column on a telephone.** The band is two figures across at that width
and an amount does not wrap, so the headline ran into the one beside it.

**The migrations are checked against a database that has money in it.** Comparing an empty
database with the described schema says nothing about the one thing a release can break for
somebody: their own file, written by the release before. The suite builds the database 1.0.5
left, fills it with the rows 1.0.5 wrote, upgrades it for real and reads the whole thing back
on every engine.

## 1.0.5

Released on 29 September 2026. The site session read the guide against the code at 1.0.4
and brought what the three origins of that release had not reached. Then, before the tag,
the same reading was turned on this release's own sentences, with instructions to refute
them, and it refuted six and found fault with fourteen more. What that found is in here
too, including a fix of 1.0.5 that had hidden the very thing it set out to show.

> **If you typed a quantity of an investment with three decimal places, check it.**
>
> A quantity went through the reader built for money, and money has a rule that three
> digits after a lone separator are a thousands mark, because nobody writes a third decimal
> place on an amount. A quantity is not money: an eighth of a unit, written 0.125 or 0,125,
> was stored as a hundred and twenty five units, and so was every quantity with exactly
> three digits after a single separator. The repository then multiplied that by the unit
> price, so one mistyped fraction moved the worth of the whole space. Open Investimentos
> and look at the quantities.

### Fixed

**A fraction of a unit is a fraction.** The reader takes the thousands rule as an option
now, money keeps it and a quantity does not, and both are tested at both scales, which
nothing was.

**The automatic run says when it cannot even build a place.** 1.0.4 taught the destinations
to refuse an address that is not one, and put that refusal in the constructor, which the run
called outside its try. So the whole run rejected with nobody holding it: no sentence, no
time recorded, nothing in the console, and a panel still saying Active. The deeper half is
that the question was asked too late, so a line of text that is not an address counted as a
complete place and armed the backup against it. The same rule the destinations use now
answers whether a place is ready, while the person is still looking at the field.

**The two addresses a service hands you are taken as they are**: `libsql://name.turso.io`,
which is what Turso shows, and the host on its own, which is what the hint asks for. Both
were refused with a sentence blaming the connection.

**The fields of a folder go back to the folder.** 1.0.4 split the places apart and read
what it found at face value, so a browser that had hit the 1.0.3 fault came up with the
folder's address and application password filed under the database, and the folder blank.

**Every refusal has a sentence.** Eighteen rules the model can refuse with had none in
either language, so an expired invitation, a personal space that takes no members and an
owner who has to hand the space over before leaving all arrived as "I could not finish
that". The check that keeps the two languages in step now walks the rules the model throws
and refuses a name with no sentence.

**A sentence is about the thing it is about.** A share of a division went through a reader
that turned a comma into nothing readable and answered with the sentence about an amount,
inside a dialog that holds no amounts; a percentage and a quantity borrowed the same one.
Three screens threw a plain error carrying an already translated sentence, which is the one
shape the translator cannot read, so it showed the generic one. And a coding defect that
threw a TypeError was reported as a connection that failed, on an application that in
browser mode has nothing to connect to.

**A failure is shown where the person is looking.** Archiving or deleting from a row wrote
into a callout only a dialog drew, and the three forms of the budget screen and the price
form drew theirs behind the open dialog. Both halves are corrected, and so is the fix
itself: the guard written for it read a name no screen declares, which resolved to the
browser's own `window.open` and was therefore never true, so the sentence was drawn nowhere
at all. There is a test now.

**The controls that stayed outside the one question.** The empty state of the records list,
deleting a card, three empty states with no account, a row of the danger zone, the calendar
writing the series forward, and the door that brings a file back, which writes whole spaces
and asked nothing.

**A logger sees what they wrote, wherever a figure is made of records.** The list, the
reports, the budget and the import held that rule; the balances, the projection, the
savings, the goals and the whole of the diagnosis did not. Where a figure belongs to the
space rather than to a person, an opening balance or what a recurring bill will owe, it
counts as nothing for them rather than being mixed in. The overview and the projection say
whose the figures are, and the diagnosis closes to them, because every threshold behind its
verdict was written for a household. What stays outside the rule is written down in registry
0041, and that list was two entries short when this release shipped, which 1.1.0 corrected.

**One currency in one panel.** The settled list was drawn in the currency each settlement
was written in while the balances above it used the current one, and the division added
amounts as written rather than in the base currency. A space keeps the currency its first
record was written in; correcting it while the space is empty still works.

**A space can be handed to somebody else.** The model has always been able to; no route and
no screen could reach it, while two texts promised it and an owner who tried to leave their
own space was told to hand it over first.

**Removing an instalment plan asks whose it is**, and whether it was ticked off against the
bank, which every other delete path asks. A holding of zero units at zero each is refused.
Writing an amount back into a field uses the minor units of its own currency.

### Changed

**The table of what each role may do is printed from the matrix**, in both guides and both
languages, and the build refuses one that no longer matches. Written by hand, it held eleven
of the thirty five permissions with nothing saying it was a summary.

**The English spelling of one word.** The project writes colour and recognise and never the
other forms, so it is British, and instalment was split down the middle.

## 1.0.4

Released on 28 September 2026. The site session read the guide against the code again, at
1.0.3, and this time it did not bring a list of cases: it brought three families, and asked
for the origin of each rather than the examples. Which role may do what, what a failure
says, and how an amount is read. Every case it found was real.

> **If you typed a limit, a savings rule, a goal or an investment price using a period for
> the cents, check it.**
>
> The reader on those screens deleted every period before looking, so 1000.50 was saved as
> a hundred thousand and 1,000.00 as one real, while the hint under the field said a comma
> or a period would do. The same reader decided the quantities on the investments screen,
> so ten and a half units of a fund were stored as a hundred and five. Nothing was
> corrected for you, because guessing which of those was meant would be worse. Open
> Orçamento and Investimentos and look at the numbers.
>
> **If you had a WebDAV folder set up and then pressed Continuar under "Um banco na
> nuvem", or changed the place in the list, look at the backup panel.** The fields of the
> folder were carried over into the database, so every run sent your application password
> to the folder's address and failed. Each place keeps its own fields now.
>
> Not yours, though: 1.0.4 split the places apart and read what it found at face value, so
> if you had hit that, the folder's address and password ended up filed under the database
> and the folder came up blank. 1.0.5 puts them back where they belong, on the way in.

### Fixed

**What a role may do is asked in one place.** Three screens read the member list and wrote
their own lists of roles; every other screen that writes offered everything to everybody
and let the model refuse it afterwards, in a sentence written for whoever wrote the code.
The lists had already drifted from the matrix nobody was reading. Every control on every
screen that writes now names the permission the repository behind it asks for, so a button
and the refusal behind it cannot disagree. Accounts, categories, budgets, goals, the
savings rule, rules, recurrences, investments, scenarios, spaces, the danger zone, the
import, the records and the one button on the overview.

An unknown role counts as no. Two screens read it as yes, on the strength of a comment
that was not true: creating a space writes a member row for whoever made it, including the
personal one, so a missing role means the list has not arrived or this person is not here.

Importing is nothing but writing records, so a role that writes none of them is told so
instead of being walked through a file, mapping the columns and marking the repeats, and
refused at the end.

**A failure says what happened.** Twenty one places turned an error into words and they
disagreed: nine printed the model's own English, one answered "your role does not allow
that" to everything including a dropped connection, one said the amount could not be read
whatever had gone wrong. Fourteen writes had no handler at all and thirteen of those failed
in silence, among them the quick entry and its undo, archiving and deleting an account,
deleting a whole instalment plan, and marking something as paid on the overview. On a
server it was worse than a bad guess: a rule of the model arrives there in a different
shape, so every check for one was dead code and a genuine rule read as a refusal.

**An amount is read one way.** There were four readers. Two deleted every period before
looking, one read a period and nothing else and turned the Brazilian thousands form into
NaN, and none of the three said anything when they could not read what was typed. On the
investments screen that meant a word, or an amount with its currency symbol still on it,
became zero, and a holding sat there worth nothing with nobody told. The budget refused a
limit of nothing all along, so it never stored one. Writing an amount back had the same
spread: three places put a comma in whatever language was speaking.

**A logger reads their own rows on the import screen too.** The query that marks what looks
familiar in a file filtered on the space alone, so it read back up to five thousand records
of the whole space, with their descriptions and their amounts, for the one role that is
meant to see only what it wrote.

**A destination has to be somewhere else.** A blank address, or a path with no host on it,
is resolved against the address this application is served from, and every one of those
calls carries a credential. Erasing a space with the address blanked out sent a DELETE
there with the application password in the header, and the 404 counted as the copy having
been erased while it sat untouched in the folder. Restoring had the same hole.

**A place that no longer exists is cleared when the application opens**, which is what the
1.0.3 notes promised. It happened on a read of the settings, and the only screen that read
them was the data screen.

### Changed

**The backup panel says what is happening and what was asked for**, which are two facts
that can disagree, and says so plainly when they do. Switching it off no longer needs a
complete place, so a missing field cannot leave a backup on with the only way out greyed
out. The panel reads the settings again whenever they change, wherever they change.

**When the copy has already gone and the erasure then fails**, the dialog says that, and
says the next run writes the copy again.

**Who owes whom reads as a sentence.** "You owes" and "You is owed" were what an English
reader saw on their own row, which is the row they were certain to read. So was "João pays
You", a capitalised pronoun in the middle of a sentence, in both languages.

## 1.0.3

Released on 28 September 2026. The session that keeps the cofre.ink site read the guide
against the code again, at 1.0.2, and found twenty four things. Several of them were
leftovers of the 1.0.2 fixes themselves, including the worst one, which is mine.

> **If you had picked "a server of yours" as the place for the automatic backup, read
> this.**
>
> 1.0.2 said you would find the backup off. Only the name of the place was dropped, so
> the panel said Active beside None configured, offered to schedule it, and hid the one
> button that could have switched it off. Your server address, your email and the
> password you typed into that panel were still in this browser too. All of it goes now,
> the first time you open the application. Your data was never touched.

### Fixed

**A backup with nowhere to write said it was on.** The place and the switch were two
things that could disagree, and they did. The switch is derived from the place now, a
place that no longer exists takes everything of itself away, and picking a name from the
list no longer arms the run: it waits until there is an address and a secret to use,
instead of failing on every pass until they are typed in.

**Erasing a space reached the destination only after the space was already gone here.** A
place that could not be reached at that moment left the space erased on this device, the
backup still on, and the place still holding the whole of it, so the next run brought the
emptied space back. That is the exact thing the question in that dialog was added to
prevent. The copy goes first now, and a place that refuses stops everything with nothing
lost.

**The browser backup leaked into server mode.** Three readers of its settings did not look
at the mode, so the erase dialog offered to delete a file named after a space of the
server, and the panel at the top could say the backup was active in a place nothing was
writing to. The database of the browser was also never put down when the mode changed, so
the thing that backs up on every change kept running the local file against the
identifiers of the server's spaces until the page was reloaded.

**The door that leads to a database erased a WebDAV that was already set up**, address,
user and application password, and left the backup on against nothing.

**A file that is not even JSON showed the complaint of the parser**, in English, on a
Portuguese screen. So did a backup with the right marker and no list of spaces.

**A role was offered things it would be refused.** Inviting, marking a payment, undoing
one, editing, deleting, dividing, sorting everything like this one and ticking off against
the bank were all drawn for everybody and turned down by the model afterwards, in a
sentence written for whoever wrote the code. Undoing a payment failed in complete silence.
The section that says who owes whom stays for everybody, because reading it is not
settling it: what goes for a Viewer and a Logger are the two buttons inside it.

**The month screen counted a household month twice.** A Logger only ever sees the records
they wrote, so that screen looked empty to them even when somebody else had already
written the month, and saving wrote a second set carrying the same three marks, which
nothing refuses. The space then counted the month twice everywhere. That screen is about
the month of the whole household, so it closes to a Logger, who writes through the list as
before.

**The monthly income** was drawn in Brazilian formatting in the English interface, filled
the field with a comma for the cents in both languages, complained about an unreadable
number on the section behind the open dialog, and was hidden from whoever may not set it
under a sentence saying it had never been given, about people who had given it.

### Changed

**Fifteen sentences that were not quite true**, including "You pays João", three hints and
an error message telling an English reader to write the cents after a comma, and two lists
of what the import reads that left out JSON.

**What brings a copy back, said honestly.** Nothing in the interface reads a copy out of a
destination this browser does not already hold. The front door and the troubleshooting
both said a new device brings that copy back, and it does not. They now say what does: a
file you downloaded, and for a WebDAV folder, the file you can fetch from your own cloud
by hand. From an online database there is no path through the interface today.

## 1.0.2

Released on 28 September 2026. The session that keeps the cofre.ink site read every
sentence of the guide against the code while updating it for 1.0.0 and 1.0.1, and wrote
down what did not match. Thirty five things. Every one of them was real, five of them not
quite as described, and this is all of them.

> **If you had picked "a server of yours" as the place for the automatic backup, read
> this.**
>
> It is not one of the places any more, and it never worked: it was skipped by the thing
> that runs on every change, so the panel said it was on and nothing ever left the
> browser. You will find the backup off and no place chosen, with your data untouched.
> Pick a WebDAV folder or an online database, or use your server the way a server is
> used, by running in server mode. Registry 0040 says why.

### Fixed

**Erasing a space undid itself.** With the automatic backup on, an erasure left no
deletion marks, so the copy in the folder was ahead and the next run brought the whole
space back, called it a success and said nothing. The confirmation now asks: the copy goes
with the space, or it stays and the backup is switched off, because a place still holding
the space puts it back within seconds.

**A month of ordinary use made the backup ask a question with no answer.** The change log
folds itself after thirty days and the place keeps every entry it was ever sent, so this
device ends up holding fewer than the place does. The comparison counted every one of
those as something missing, so the first record typed after the first fold reported that
both sides had moved. Keeping both did not help: what it was missing was what it had
decided to stop keeping.

**Changing where the data lives lost the person.** Going back to the first question and
choosing this browser again made a new person every time, and the spaces of the one before
stayed in the file with no screen that reached them. It comes back to the same person,
which is what opening the application normally always did.

**A restore of several spaces could be refused half way through.** Each space is its own
transaction and the permission was asked for inside the loop, so a file of five whose
fourth was refused left three of them written and showed only the refusal. Every refusal
happens before the first write now.

**Replacing the copy after a restore used the wrong identifiers**, the ones in the file
rather than the ones the restore wrote, and threw a raw English sentence after the restore
had already happened.

**A file that is not a backup said nothing.** It opened the confirmation with no space in
it and a button that could not be pressed. The three refusals have words now, in both
languages, and they are said when the file is read.

**A Viewer was offered buttons that refuse.** The save button on the month screen, and the
menu that changes a role or removes somebody, which also failed in silence because the
only place a problem was drawn was inside a dialog that was closed.

**The spreadsheet handed a Logger every record of the space.** The list of records has
always narrowed to the rows a Logger wrote; this is the same space through another door
and now narrows the same way.

**The monthly income read 4500.00 as four hundred and fifty thousand** in the English
interface, because it stripped every dot by hand instead of handing it to the reader every
other amount on screen goes through, which decides the decimal mark from the last
separator in what was typed.

**The count after erasing a space** counted the change log and the invitations, so
somebody who had written a hundred records was told four hundred had gone.

**The automatic backup set itself off.** Backing up by hand, testing the connection,
writing the spreadsheet and handing over a CSV all started a second run four seconds
later, against a place with nothing new to hear.

**The name of a destination was glued to a preposition**, so Portuguese read "Falha ao
conectar ao Uma pasta WebDAV" and English "Could not connect to A WebDAV folder".

### Changed

**A server of yours is not a place the automatic backup writes.** See the warning above.

**Fourteen sentences that named something that is gone.** Three sent somebody to Members,
which became a section of Spaces. Two talked about turning syncing on. One promised that
what is written comes with you when the mode changes. One offered the statement importer a
backup it cannot read. One told an English reader that cards are added in "Nova conta".
The screen that writes a month said all of it lands on the last day of the month, which
was never true of the card one. And the four guides still sent somebody to Data, Backups
and copies, Save a copy.

**The sentences under Viewer and Logger** say what those roles actually do: a Viewer does
change one thing, their own monthly income, and a Logger writes any kind of record and not
only spending.

**Whoever is holding the screen is called "you"** on the division and the settling up too,
in the language the screen is speaking.

## 1.0.1

Released on 28 September 2026. What an audit of 1.0.0 found the morning after it went
out. One of the five is money on a screen and the rest are a screen that could write a
record twice, a sentence in the wrong language, and a pile of figures in the documents
that had stopped being true.

> **If you used the month screen on 1.0.0, read this.**
>
> It charged the card invoice and never paid it. Your total was right the whole time and
> your two accounts were not: the account your wages arrive in kept the invoice it really
> handed over, and the card kept a debt nobody settled. Nothing is repaired on its own.
> Open each month you wrote on that screen and press save again, and the payment is
> written where it belongs.

### Fixed

**The card the month screen charges is now also paid.** An invoice is charged to the card
and then paid from the account, and only the first half was written. So every month the
current account climbed by the whole invoice and the card sank by the same amount. The
two errors are equal and opposite, which is why the total always looked right and why
nothing caught it.

A fourth record is written from the same number, and nothing new is asked: a transfer out
of the chosen account on the day that invoice falls due, which for a card that closes late
in the month is the month after. An invoice that has not fallen due yet is written as
planned rather than settled, so it counts in what is coming rather than in what is there.
Registry 0039 has the reasoning, including why paying the card is not a fourth field.

**A save that failed half way through wrote a second copy when it was tried again.** The
screen only went back to look at what it had written when the save worked, so after a
failure it still believed it had written nothing, and pressing the button again wrote
another copy of whatever had already landed. It reads them again either way now.

**The month screen looked for its own records in a page of days.** It asked for a range
wide enough to hold all of them and read what came back, which in a busy space is a page
that the records can fall off the end of. A record it could not see would have been
written a second time. It asks for them by the mark they carry instead, which is an exact
question, and the filter for that is in the repository, the route and the client alike.

**The English amount example was written in Brazilian.** The one message that appears
after somebody has already mistyped an amount told them to write it like 2.500,00, which
in English reads as two and a half.

### Changed

**The figures and the lists in the documents.** The README counted thirty three decision
records and there are thirty nine, and it repeated the test counts of 0.1.1 unchanged. It
also still offered a file as a place a copy can live, which is the thing 1.0.0 took away.
The only install command in this file pinned 0.1.1, and now reads `latest`. And the
picture the README opens with was taken before the rename, so it showed a wordmark reading
Cofre.

### What is worth knowing before you rely on it

Unchanged from 1.0.0, and worth repeating here rather than leaving in a section three
releases down:

1. **The statement readers have never seen a real bank statement.** They are built from
   the formats and tested against files written for the tests. Expect to correct a column
   mapping the first time, and expect the correction to be remembered.
2. **A copy in a WebDAV folder has only been tested against a stand in**, never against a
   real Nextcloud.
3. **Turnstile has never been tested against the real Cloudflare service**, only against a
   double. The proof of work in front of the sign in has, and it is the one that is on by
   default.
4. **In browser mode there is no password.** The address can be public without exposing
   anything of yours, and whoever opens your browser sees your data. Both are true at the
   same time and the front door says so.

## 1.0.0

Released on 27 September 2026. The first version this project calls finished: everything
it promises works, and two screens that were in the way are gone.

There is a shorter way in. The front door asks the one question that cannot be changed
afterwards, where the data lives, and then shows the application with money in it. And
there is a copy that keeps itself, which is the thing a personal finance application is
asked for most and is the last thing this one was missing.

> **If you are updating from 0.1.1, read this.**
>
> Three things that worked are gone, and one of them may be in use.
>
> **A file the person carries is no longer a sync destination.** Two browsers with no
> server between them used to agree by carrying a packed `cofre_sync_*.json.gz` back and
> forth, merging record by record. That is gone. They exchange a backup instead, which
> moves a money life across and adds what is missing, but does not merge two people
> editing the same record at once. Whoever needs that runs a server, which is what a
> server is for. Any `.json.gz` you already have is still read by Restore from a file.
>
> **A browser holds one person.** The profiles of a device, switching between them and
> renaming yourself are gone. If you made a second profile on a machine, that person and
> their spaces are still in the database and nothing was deleted, but the application
> will not offer to become them again: open their backup, or use a second browser
> profile from now on.
>
> **The form behind the door is gone.** Nothing is asked. What it used to ask is made
> with a default and corrected in one screen.

### Removed

**The form at the door, and the profiles of a device.** A name, an email, a currency and
a space name asked before anybody had seen anything, plus a menu that offered to rename
you, to become somebody else on this machine, or to make room for them. The door asks
one question now. A second person on the same machine uses a second browser profile,
which separates more than this ever did. Registry 0037 has the reasoning.

**The members screen.** Not the members: the screen. Who is in a space, with which role
and what they said they earn, the invitation and the settling up are a section of the
spaces screen now, under the list, for whichever space is open. Nothing was dropped in
the move.

### Fixed

**A backup that could not be brought back.** Two files leave this application and both
hold a whole space: the backup, which is the rows, and the file kept for syncing, which
is the change log two devices exchange. Only the first one could be restored, the second
one was offered a few lines below it under words that sounded the same, and somebody
whose device was gone was told to go back to it and export a backup there.

Bringing a file back now reads both. A log folds into the rows it describes, so the sync
file comes home through the same door, with every rule of a restore unchanged. The
refusal that remains, a personal space of another device meeting the personal space that
is here, is said with the file in hand instead of after the whole log has been written,
and it names the door that does work.

**A whole space could be poured into one that somebody else runs.** Restoring into a
space that already exists asked for no permission at all, so a member who could only
read a shared space could put a file into it. It now asks for the role that exporting a
space asks for, which is the same decision in the other direction.

**Dividing by shares could hand each share to the wrong person.** The shares travelled
as a list in the order the screen reads people, which is by name, and were applied in
the order the space holds them, which is by when they arrived. The two agree only by
luck. A share now travels with the identifier of the person it was typed for.

**Somebody in two shared spaces could not divide anything.** The dialog offered
everybody from every space the person is in, and the model refused a division with
somebody who is not in the space the expense is in, which is right. The dialog now
offers the people of the space that is open, on the division, on who paid, and on the
settle up.

**The days an invoice said it covered, for two closing days.** Under the invoice total
there is a line reading "Compras de X a Y". A card that closes on the first was told its
September invoice ran to the last day of September, when every one of those days is on
the invoice after: that invoice is the whole of August. A card that closes on the thirty
first was told its March invoice began on the twenty eighth of February, a day that is on
the February one, because February has no thirty first for anything to close on. Both
ends are now the days that really land on the invoice they name. Only the sentence was
wrong, and no purchase was ever put on the wrong invoice.

### Added

**A month in three numbers, for whoever will not keep a ledger.** A screen beside the
list, in the records section. It asks for a month and three amounts: what came in, what
went out apart from the card, and what the card invoice came to. That is all the bank and
the card tell somebody without being asked, and it is enough for the balance, the trend,
the check up and the projection to work.

What it writes are three ordinary records, so nothing else in the application had to
change: they are in the list, they count everywhere, the card one is on the invoice of
that month, and any of the three can be opened and corrected like any other record.
Typing the same month again corrects those three instead of writing three more, and
clearing a field takes its record away. Before the fields, the screen says how many
records the month already holds and what they add up to, because somebody who writes a
few by hand and then types the whole month has counted those few twice. Registry 0038 has
the reasoning.

What it does not give is anything that needs a category or a day.

**A backup that keeps itself up to date.** Pick one place, an online database or a WebDAV
folder, test the connection, and turn it on. It covers every space at once, and after that
it runs on every change once the typing stops, plus whichever of two you asked for: when
the application opens, and every so often. A server of yours was offered here too in
1.0.0 and 1.0.1, and 1.0.2 took it out: see that section.

It reads the place before it writes to it, and compares by which entries each side holds
rather than by a date, because two devices that each wrote one record are both newer than
the other. When both sides wrote since they last agreed it stops and asks rather than
choosing, because choosing there means throwing somebody's records away. Keeping both
loses nothing and is offered first. The two answers that do lose something hand you a
file of the side that is going before it goes, so restoring it is the way to undo.

Bringing a file back while it is on asks whether the file should become the copy as well.

### Changed

**A copy is made by a person or by a machine, and the screen has one panel for each.**
The file somebody carries stopped being a destination: a destination is somewhere this
application can reach by itself, and a folder in a downloads directory is somewhere a
person goes. What that costs is that two browsers with no server between them used to
agree by carrying a packed log back and forth, and now they exchange a backup instead,
which moves a money life across but does not merge two people editing at once.

**Backup and copies are one section of the data screen.** Saving a copy took the space
that happened to be open, and the file with every space was hidden under a line about
taking the data to another program. There is one button now. It writes one file, named
`cofre_backup_YYYYMMDD.json`, with whichever spaces were ticked, all of them ticked to
start with, and a space somebody may not copy is shown unticked with the reason. Files
written by earlier versions are still read.

Bringing a file back lists the spaces inside it, all ticked, and brings back the ticked
ones. Reading a statement in is a panel of its own, because it is not a backup. The last
copy saved now reads the oldest among the spaces, because the question behind that line
is whether the data is safe.

## 0.1.1

Released on 26 September 2026. Four things that were wrong on the path the guide
describes, and the interface now opens in the language of wherever it is.

### Fixed

**The example environment kept the data inside the container.** Following the guide
exactly (`cp .env.example .env`, fill `COFRE_SECRET`, `docker compose up -d`) wrote the
database to `./data/cofre.db` instead of to the named volume, because Compose reads
`.env` and the value in it won over the one in `compose.yaml`. The database was inside
the container, so **recreating the container deleted it**, which is what an update does.
The same mechanism sent every invitation link to port 5174, which nothing answers.

Both lines are commented out now, so the container's own defaults apply: `/data/cofre.db`
inside the volume, and `http://localhost:4321`.

> **If you already run a server, read this before you update.**
>
> Look at the boot log:
>
> ```bash
> docker compose logs | grep "storing data"
> ```
>
> If it says `/data/cofre.db`, nothing is wrong and nothing is needed.
>
> **If it says `./data/cofre.db`, your data is inside the container and the copy in the
> volume does not have it.** Before touching anything, open the interface, go to Data and
> export every space. Then correct the `.env`, comparing it against the new
> `.env.example`, bring the container up again and restore what you exported. Do not run
> `docker compose down` or pull a new image first: recreating the container is what
> removes the file.

**The PostgreSQL path could not be followed as written.** Four places said to uncomment
the database service. The service mounts a volume declared in a separate comment at the
bottom of the file, and Compose refuses a whole project where a service mounts a volume
nothing declares, so the documented steps brought nothing up. It is four things now,
said as four: the service, the wait described below, the volume, and
`POSTGRES_PASSWORD`, which the example never mentioned either. The guides also say that
the host is the name of the service and not `localhost`, and that the backup recipe
copies a volume that holds nothing on this path.

**On that same path the first boot could die with `connect ECONNREFUSED`.** PostgreSQL
starts, writes its own files, restarts itself once and only then opens the socket, so a
server that connected the moment the container appeared was refused. The restart policy
brought it back seconds later, which is why it looked like it worked, but a fresh
install failed the first time and said something frightening while doing it. The
database now carries a healthcheck that asks the database itself rather than watching a
port, and the server waits for it.

**A server that would not start pointed at a file nothing reads.** The error said to copy
`.env.example` to `.env` and fill it in. Only Compose reads that file. Started any other
way, the person did exactly what they were told and got the same error. It now says both
cases and which is which.

**The guides promised the API was running after `pnpm dev`.** It is not: the API stops on
its own configuration, because the secret has no default and nothing outside Docker reads
a file to find one. The interface, which is the whole product, comes up and needs
nothing. That is what they say now, with the one line that brings the other half up.

### Changed

**The interface opens in the language of wherever the device is.** It opened in
Portuguese for everybody. Now the first of four answers wins: the `lang` parameter of the
address, the choice this browser holds, the zone of the device (Brazil in Portuguese,
anywhere else in English), and Portuguese when the device will not say. Nothing is asked
of any service, so it behaves the same offline, in a container and on any host. The
button in the header still has the last word, and a language guessed from the clock is
never written down as a choice. The reasoning is in
[decision record 0034](docs/adr/0034_which_language_opens.md).

**The donate link goes to the page in the language being read.**

### Added

Where to donate, in the README and behind the Sponsor button on the repository, which
offers GitHub Sponsors and PayPal.

## 0.1.0

Written on 23 September 2026 and never released: it was never tagged, so there is no
release and no image carrying that number, and 0.1.1 above is the first one there is.
The section is kept because it says what the product is rather than what changed in it,
which is worth reading once and is not worth writing twice.

### What it does

**Records.** Accounts, cards with a real invoice cycle, instalments, transfers, planned
and settled. A whole record written on one line: `market 42.90 yesterday nubank 3x`.

**Sorting.** Categories two levels deep, spending priority, and rules that sort by
themselves and learn from a correction.

**Repeating.** Series that write their own records, and a calendar of what falls due.

**Planning.** Limits per category or per priority, a save first rule, goals with a date,
and a projection of the next months built from what is already written, what repeats,
and what an ordinary month looks like.

**Sharing.** A space has members with roles. An expense splits evenly, by share or by
income, and a settle up says who owes whom, once.

**Reading a statement.** CSV, OFX, QIF, XLSX and JSON, plus a PDF reader written by hand
for card invoices and receipts. Nothing is written before you have seen it.

**Saying something back.** Findings over your own records, each one carrying the figures
it was made from. Nothing about what to buy or where to put money.

**Leaving.** Export as JSON or as a spreadsheet, restore anywhere, keep a copy in a file,
a WebDAV folder, an online database or a Google spreadsheet. Two devices agree by
exchanging a change log, over a server or through a file somebody carries.

**Offline.** The whole interface is kept by a service worker, so it opens on a train.

### The three ways to run it

1. In the browser alone, with the database inside that browser and nothing over the
   network.
2. With a server of your own, as one container carrying the API and the interface.
3. With a cloud you pay for, keeping a copy where you choose.

### What is worth knowing before you rely on it

1. **The statement readers have never seen a real bank statement.** They are built from
   the formats and tested against files written for the tests. Expect to correct a
   column mapping the first time, and expect the correction to be remembered.
2. **A copy in a WebDAV folder has only been tested against a stand in**, never against
   a real Nextcloud.
3. **Turnstile has never been tested against the real Cloudflare service**, only against
   a double. The proof of work in front of the sign in has, and it is the one that is on
   by default.
4. **In browser mode there is no password.** The address can be public without exposing
   anything of yours, and whoever opens your browser sees your data. Both of those are
   true at the same time and the front door says so.

### Installing

The interface is a folder of static files that any host will serve. The server is one
container:

```bash
docker run -d -p 4321:4321 -v cofre:/data -e COFRE_SECRET=... ghcr.io/andreilud/app-cofre-ink:latest
```

The full guide is in [docs/en/deploy.md](docs/en/deploy.md), and in
[Portuguese](docs/pt-BR/deploy.md).
