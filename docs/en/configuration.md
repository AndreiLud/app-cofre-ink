# Configuration

Only the server reads any of this. The browser mode reads nothing from an environment:
everything it needs is chosen on screen and kept in that browser.

Copy `.env.example`, which is commented line by line, to `.env`. It is read once at
boot and checked before anything starts, so a setting that is missing or contradictory
stops the process instead of surfacing as a strange error three requests later.

## Every setting

### `COFRE_SECRET`

**Required. At least 32 characters.** Signs the session cookies. Without it nobody
stays signed in, and with a weak one anybody can forge a session.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Changing it signs everybody out. Never commit it.

### `COFRE_DATABASE`

Where the data lives. Defaults to `./data/cofre.db`.

| value | what happens |
| --- | --- |
| a path ending in `.db` | SQLite, one file. Right for a home server |
| `postgres://user:password@host:5432/name` | PostgreSQL, with row level security on top |

The boot log says which database is in use, with the password taken out of the address
before it is printed.

### `COFRE_PORT`

Where the API listens. Defaults to 4321.

### `COFRE_WEB_ORIGIN`

Where the interface is served from. The API accepts cross origin requests from here and
from `COFRE_PUBLIC_URL`, and builds invitation links with it.

**This one decides how the session cookie is written.** If it is a different site from
`COFRE_PUBLIC_URL`, the cookie is written to travel between them, and the server has to
answer over https for a browser to keep it. See
[Authentication](authentication.md).

### `COFRE_PUBLIC_URL`

The address this server answers on, as seen from outside. Behind a proxy this is the
public address, not the port inside the container.

### `COFRE_STATIC_DIR`

Where the built interface sits, when the same process serves it. The container sets it
to `/app/apps/server/public`. Leave it empty while developing, when Vite serves the
interface.

With it set, every address that is not a file falls back to the page, because the
routes live in the browser. Every address starting with `/api` does not.

### `COFRE_CLIENT_IP_HEADER`

The name of the header a reverse proxy sets with the address of the real caller, for
example `x-forwarded-for`.

**Leave it empty when nothing sits in front.** A header anyone can set is a header
anyone can lie about, and believing it with no proxy in front lets a caller change
their apparent address on every attempt. With a proxy and without this, everybody
behind it counts as one caller and the limit protects nobody.

### `COFRE_PROOF_BITS`

How much work a caller does before this server reads a password, in leading zero bits.
Defaults to 18, which is about a second in a browser. Twenty is four times the cost,
sixteen a quarter. Zero turns it off, which is for somebody who has their own gate in
front. The maximum is 26.

### `COFRE_TURNSTILE_SITE_KEY` and `COFRE_TURNSTILE_SECRET`

A Cloudflare Turnstile widget on top of that work. Off unless both are filled in.

**Both or neither, and the server refuses to start with one of the two.** With only the
secret, every sign in is refused for a captcha nobody was shown. With only the site key,
people solve a puzzle that nothing checks.

The site key is public by definition: it is what the widget is drawn with. The secret
never leaves the server.

### `NODE_ENV`

`production` on a server. In `test` the rate limit is off and the proof of work drops
to eight bits, so a suite does not spend minutes proving arithmetic that has a test of
its own.

## What the container passes through

`compose.yaml` passes every optional setting whether it was filled in or not, so what
arrives for one nobody set is an empty string. An empty value is read as a setting
nobody set, everywhere, so a blank line in `.env` behaves like an absent one.

## Limits that are not settings

Written in code on purpose, where they can be read next to what they protect.

| limit | where | value |
| --- | --- | --- |
| request body | `apps/server/src/app.ts` | 25MB |
| records in one import | the same | 3000 |
| entries in one sync push | the same | 2000 |
| records in one bulk edit | the same | 500 |
| sign in attempts | `apps/server/src/auth.ts` | 5 a minute |
| new accounts | the same | 5 an hour |
| anything else | the same | 60 a minute |
