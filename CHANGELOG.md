# Changelog

Every release, what changed in it, and what to do about it if you are running this.

Versions follow semantic versioning. The first number changes when something that worked
breaks, the second when something is added, the third when something is corrected.

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
> to the folder's address and failed. Each place keeps its own fields now, and yours are
> where you left them.

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
NaN, and none of the three said anything when they could not read what was typed, so a
word became a limit of zero. Writing one back had the same spread: three places put a
comma in whatever language was speaking.

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
