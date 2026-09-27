# Changelog

Every release, what changed in it, and what to do about it if you are running this.

Versions follow semantic versioning. The first number changes when something that worked
breaks, the second when something is added, the third when something is corrected.

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

### Added

**A backup that keeps itself up to date.** Pick one place, a server of yours, an online
database or a WebDAV folder, test the connection, and turn it on. It covers every space
at once, and after that it runs on every change once the typing stops, plus whichever of
two you asked for: when the application opens, and every so often.

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
docker run -d -p 4321:4321 -v cofre:/data -e COFRE_SECRET=... ghcr.io/andreilud/app-cofre-ink:0.1.1
```

The full guide is in [docs/en/deploy.md](docs/en/deploy.md), and in
[Portuguese](docs/pt-BR/deploy.md).
