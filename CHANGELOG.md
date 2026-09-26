# Changelog

Every release, what changed in it, and what to do about it if you are running this.

Versions follow semantic versioning. While the first number is zero, the second one
changes when something breaks and the third when nothing does.

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
