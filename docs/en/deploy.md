# Deploy

Pick the mode and read that section. You do not need the rest.

| I want | go to |
| --- | --- |
| to use it in my browser, with no server at all | [The browser mode](#the_browser_mode) |
| to leave a public address for other people to use | [The browser mode](#the_browser_mode) |
| to use it on a phone | [The browser mode](#the_browser_mode) |
| a server of my own, with accounts and shared spaces | [A server of your own](#a_server_of_your_own) |

Cofre Ink is an address you open in a browser and nothing else. On a phone the browser
offers to keep it on the home screen, and from then on it opens by its icon, with no
connection, with the same data. There is no application to install from any store.

## What has to be installed

1. **Node 22 or newer.** On Node 22 the server runs with `--experimental-sqlite`, which
   the scripts already pass. Node 24 needs nothing.
2. **pnpm 12 or newer.** `corepack enable` is enough, since the exact version is named
   in `packageManager`.
3. **Git**, to clone.

```bash
pnpm install
pnpm dev        # the interface at 5174, and the API beside it
```

The interface is the whole product and needs nothing else. The API refuses to start
without `COFRE_SECRET`, and nothing reads `.env` outside Docker, so export it in the
shell first if you want server mode locally. Browser mode never asks for it.

<a id="the_browser_mode"></a>

## The browser mode

The database is a SQLite file inside the person's own browser, in the storage of that
site. No server, no account, nothing over the network. It is also how a demonstration
is published: static files, and any host will do, including the free ones.

### There is no password here, and why

Two consequences, and both matter.

**The good one: the address can be public without exposing anything of yours.**
Everybody who opens it gets an empty Cofre Ink inside their own browser. There is no
shared database for anybody to get into, because there is no database on the server at
all. What is published is static files, the same ones for everybody.

**The price: whoever opens your browser sees your data**, because there is no password
to ask for. What protects it is what already protects the machine: the password on the
computer, the browser profile, the lock on the phone.

A password here would be a padlock on a glass door. The database file is in the storage
of the site, and anybody holding the device with the console open reads it anyway.
Protecting it properly would mean encrypting the file with a key derived from a
passphrase, and Cofre Ink does not do that yet. Until it does, this guide would rather
say the truth than sell a lock that does not lock.

If you want a real password, that is [a server of your own](#a_server_of_your_own).

### Building it

```bash
pnpm build
```

The result is in `apps/web/dist`. That is all of it: copy that folder wherever you
want.

The application answers at several addresses (`/lancamentos`, `/importar`, and so on)
and a file host knows none of them. The build writes a `404.html` that is the page
itself, so a host that finds nothing sends the application and the router reads the
address. Most hosts work with no configuration at all.

### Netlify, Vercel and the like

Build command `pnpm build`, published folder `apps/web/dist`. The `_headers` is already
in there and needs no configuration.

Netlify and Cloudflare Pages read a `_redirects` file, which says the same thing as the
`404.html` above but with a status of 200 instead of 404. The build does not write one,
because Cloudflare Workers parses that file and refuses the only rule it would contain.
If you publish to one of those two and want the 200, add a file called `_redirects` to
the published folder with this line in it:

```
/*    /index.html   200
```

### Cloudflare Workers

Workers deploys with a configuration file rather than with two fields in a dashboard,
and `wrangler.jsonc` at the root of this repository is it. There is no Worker code in
it: this is a folder of files, so Cloudflare serves the files and answers anything that
is not one with the page itself.

The build is named in that file too, so `wrangler deploy` builds before it uploads and
the dashboard needs no build command of its own. A clone of this repository deploys the
same way, which is the point of keeping it here.

One thing is not in this repository and cannot be: **the `name` has to be the name of
the Worker** the repository is connected to. With a different name, a deploy quietly
creates a second Worker and the address carries on pointing at the first one.

### GitHub Pages

Pages serves a project from inside a folder
(`https://user.github.io/app-cofre-ink/`), so the build has to know:

```bash
pnpm --filter @cofre/web exec vite build --base=/app-cofre-ink/
node scripts/buildServiceWorker.mjs
node scripts/copyFallback.mjs
```

Publish `apps/web/dist`. With a domain of your own pointed at Pages, the folder
disappears from the address and the plain `pnpm build` is right again.

There is a workflow for this in `.github/workflows/demo.yml`, which runs only when
somebody presses the button in the Actions tab.

### The header the page cannot send itself

The page carries its own security rules inside it, and they work on any host. Only one
of them does not work from inside the page, and it is the one that stops Cofre Ink
being opened inside a frame on somebody else's site, which is how a person is fooled
into pressing the wrong button.

So the build carries a `_headers` file, which Cloudflare and Netlify read and apply:

```
/*
  X-Frame-Options: DENY
```

The Cofre Ink server sends the header by itself. A host that reads neither that file
nor the server, such as Nginx or Caddy, is configured by hand, as below.

### Nginx

```nginx
server {
    root /var/www/cofre;
    index index.html;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # The files with a code in the name never change.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Caddy

```caddyfile
cofre.yourdomain.com {
    root * /var/www/cofre
    try_files {path} /index.html
    file_server
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
    }
}
```

### A folder on your own machine

To see the build locally, without publishing anything:

```bash
pnpm --filter @cofre/web exec vite preview --port 5174
```

<a id="a_server_of_your_own"></a>

## A server of your own

Accounts, invitations and shared spaces for real. A machine of yours, a Raspberry Pi, a
cheap virtual machine, whatever you have.

### Without cloning anything

Every release publishes an image, built for Intel and for ARM, so a Raspberry Pi runs
the same one:

```bash
docker run -d --name cofre -p 4321:4321 -v cofre:/data \
  -e COFRE_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))") \
  -e COFRE_PUBLIC_URL=https://your.address \
  -e COFRE_WEB_ORIGIN=https://your.address \
  ghcr.io/andreilud/app-cofre-ink:latest
```

Pin the version rather than following `latest` if you want to decide when to update.
[The changelog](../../CHANGELOG.md) says what changed in each one.

### From the source

```bash
cp .env.example .env
```

Fill `COFRE_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

That is the only line that has to be filled. Everything else in the file is commented,
and a commented line falls through to the default the container already carries.

**The moment the server is reachable as anything other than `localhost`, set both
addresses to the real one.** They are commented out in the example for exactly that
reason: whatever is in `.env` wins over `compose.yaml`, so a value left in by accident
is a value that overrides the container.

```
COFRE_WEB_ORIGIN=https://cofre.yourhouse.com
COFRE_PUBLIC_URL=https://cofre.yourhouse.com
```

`COFRE_WEB_ORIGIN` is where the interface is served from, and the API refuses a request
from anywhere that is not it or this server's own address. `COFRE_PUBLIC_URL` is where
this server answers, seen from outside.
The container serves its own interface, so on a single machine they are the same
address. Left at the default they are both `http://localhost:4321`, which is right
while you are trying it on the machine it runs on and wrong the moment anybody else
has to reach it: every invitation link is built from the first one.

```bash
docker compose up -d
```

The interface and the API come up together, on port 4321 by default. The data lives in
a volume called `cofreData`, which survives an update of the image, and the container
writes it to `/data/cofre.db`. The boot log says which file it opened, and it is worth
reading once: a path that does not start with `/data` is a database inside the
container, which an update deletes.

### PostgreSQL instead of SQLite

Three things to uncomment, and leaving one out stops the whole file rather than half of
it: Compose refuses a project where a service mounts a volume nothing declares.

1. The `database` service in `compose.yaml`.
2. The `cofrePostgres` volume, at the bottom of the same file. This is the one that is
   easy to miss, because it sits apart from the service that uses it.
3. `POSTGRES_PASSWORD` in `.env`, which is the password the database is created with.

Then point the server at it, in the same `.env`:

```
POSTGRES_PASSWORD=something long
COFRE_DATABASE=postgres://cofre:${POSTGRES_PASSWORD}@database:5432/cofre
```

Compose expands that, so the password is written once and the two cannot drift apart.

The host is `database`, the name of the service, because that is what the address
resolves to from inside the network Compose makes. It is not `localhost`, which in there
is the container asking itself.

Note that the backup recipe below copies the `cofreData` volume, which on this path
holds nothing. A PostgreSQL database is backed up with `pg_dump`, or from the interface
under Data, which works the same whichever database is underneath.

### What the first visit looks like

The address serves the interface, and the interface does not know yet that it is
talking to your server, so it opens on the question it asks everybody:
**How do you want to use Cofre Ink?**

Choose **Sync between my devices**, then **See both ways**, then **A server of mine**.
It asks for the **Address of the server**, which is the address you just typed, and
**Connect** points this browser at it. The choice is kept, so the question is asked
once.

### The password for the first sign in

There is no default password and no password written anywhere. Once this browser is
pointed at your server, the server has nobody on it, the screen says so and opens on
creating access: you choose the email and the password there, at that moment. It is
stored hashed in the database on your server and nothing else knows it.

`COFRE_SECRET` is not your password. It signs the session cookies, and changing it only
signs out whoever is signed in.

Whoever opens the address after that sees the sign in screen. **Signing up stays open**,
which means anybody who reaches the address can create an account. A new account is born
empty and sees nothing of yours, but if your address is public and you want only invited
people in, put Cofre Ink behind an authentication on the proxy or on a private network.

### Behind a proxy

Fill `COFRE_CLIENT_IP_HEADER` with the header your proxy sets, usually
`x-forwarded-for`. Without it the limit on sign in attempts counts the whole world as
one person.

### Using the published interface with your server

If you use the interface at app.cofre.ink instead of the one your container serves, two
things have to be true or nobody stays signed in:

1. `COFRE_WEB_ORIGIN` is that address.
2. Your server answers over **https**, with a real certificate.

They are two different sites as a browser counts them, and a session cookie only
travels between different sites when it is marked for it, which a browser only keeps
over https. Serving the interface from the container avoids all of this.

### Backing up

The database file is inside the volume. With the container stopped:

```bash
docker compose stop
docker run --rm -v cofre_cofreData:/data -v ${PWD}:/out alpine tar czf /out/cofre.tar.gz /data
docker compose start
```

You can also export everything from the interface itself, under Data, which writes a
file any Cofre Ink installation can read back.

## Where the data is

| mode | where |
| --- | --- |
| browser | the storage of the site, in that browser profile |
| kept on the home screen | the same storage, of the same browser |
| a server of your own | the SQLite file or the PostgreSQL you pointed at |

In the first two, clearing the site data deletes the database. Export a backup before
touching that, under Data, Export everything.

Cofre Ink needs no maintenance. The history it uses to sync is folded by itself, at most
once a day, and no record of yours changes: only the intermediate version of rows older
than thirty days goes, which nothing in the product reads. On a server it happens every
hour, in a browser shortly after the first screen appears.

## A public demonstration

The browser build already is one: it is static, it talks to no server, and the first
visit offers to fill it with example data, which arrives marked as such. Publish
`apps/web/dist` anywhere from the first section.

One thing worth remembering before sharing the address: every visitor creates their own
database in their own browser. Nobody sees anybody else's data and nobody can delete
anybody else's. There is nothing to moderate.
