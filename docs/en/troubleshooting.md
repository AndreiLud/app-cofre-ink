# Troubleshooting

The failures that actually happen, and what each one means.

## The server will not start

### `the configuration is not complete`

It says which setting and why. The most common is `COFRE_SECRET` missing or shorter
than 32 characters. This is deliberate: a missing secret stops the process rather than
surfacing as a strange error three requests later.

### `COFRE_TURNSTILE_SECRET is set without COFRE_TURNSTILE_SITE_KEY`

Or the other way round. Both or neither. With only the secret every sign in would be
refused for a captcha nobody was shown, and with only the site key people would solve a
puzzle nothing checks. Fill both, or empty both.

### `Cannot find package '@cofre/...'`

A container built from an incomplete image. The runtime stage copies the `package.json`
and the `src` of every package the server imports, and Node reads the TypeScript
directly, so a missing one is not a build that fails but a container that starts and
dies. Rebuild with `docker compose build --no-cache`.

### SQLite is an experimental feature

A warning, not an error, on Node 22. The scripts already pass the flag. Node 24 says
nothing.

## Nobody stays signed in

**The single most likely cause: the interface and the server are on different sites.**

If the interface is at one address and your server at another, and the two are not the
same domain, the session cookie only travels when it is written for it, and a browser
only keeps such a cookie over https. Check all three:

1. `COFRE_WEB_ORIGIN` is the address the interface is really served from.
2. `COFRE_PUBLIC_URL` starts with `https://`.
3. The certificate is real, not self signed.

The symptom is exact: signing in succeeds, and the very next call comes back `401`. If
you are serving the interface from the same container, this is not your problem.

Second possibility: `COFRE_SECRET` changed. That signs everybody out, by design.

## Sign in is refused

### `{"error": "proofRequired"}`

The gate in front of the password was not answered. The interface does this by itself,
so seeing it means either a caller that is not the interface, or a challenge that
expired while the form sat open. Reloading the page fixes the second.

### `{"error": "captchaRequired"}`

Turnstile is on and Cloudflare did not accept the answer. Check that the secret belongs
to the same site key, and that the server can reach Cloudflare.

### Too many attempts

Five sign in attempts a minute and five new accounts an hour, per address. **Behind a
proxy with no `COFRE_CLIENT_IP_HEADER`, everybody counts as one caller**, so one
person's mistakes lock out everybody. Fill it with the header your proxy sets.

## The browser mode

### The screen says the database is busy

The backend that persists in a browser takes the file exclusively, so a second tab
cannot open it. Close the other tab. Saying this is much better than opening an empty
database, which would look exactly like losing everything.

### It says the data is not being kept

The browser has not granted persistent storage, which means it may clear the database
under pressure. Keeping the page on the home screen usually earns the grant. Export a
backup either way.

### Everything is gone after clearing browsing data

In browser mode the database is the storage of the site. Clearing site data deletes it,
and there is no copy anywhere, because nothing was ever sent anywhere. That is the
trade this mode makes. Export from Data, Export everything, before touching that.

### An address inside the application answers 404

A static host that does not know the routes. The build carries both fixes,
`404.html` and `_redirects`. If yours reads neither, point every address that is not a
file at `index.html`. There is an example for Nginx and for Caddy in
[Deploy](deploy.md).

### An old version keeps appearing

The service worker serves what it kept. Every build has a new cache name and the old
one is deleted when the new worker takes over, so this resolves itself on the second
load. To force it: open the page, clear site data, load again. Note that in browser mode
this also deletes the database, so export first.

## Importing a statement

### The reader found no records

The file is a shape the reader does not know, or a PDF made of images rather than of
text. The PDF reader reads text and does not recognise pictures of it.

### Every amount has the wrong sign

The reader keeps the sign the statement uses, on purpose, because turning it around
before the person has looked at it is how a credit becomes a debit. The review screen is
where that is corrected, and the correction is remembered for that file shape.

### The same records came in twice

The review screen compares what the space already has around the days the file covers
and marks the repeats. If they were written anyway, select them in the list and remove
the selection in one action.

## Sync

### `{"error": "profileBelongsToAnAccount"}`

A device tried to write records in the name of somebody who has an account on that
server. That is refused by design: it is the rule that stops a member of a shared space
putting words in another member's mouth. Sign in as that person on that device instead.

### Entries were refused without an error

The answer to a sync carries `refused`, a count of entries that were not written
because the caller could not speak for their author. That is the same rule, counted
rather than thrown.

### A space arrived but nothing is in it

A space is adopted on arrival only when it has nobody in it. A space that already has
members belongs to them, and a push into it requires being one of them.

## Development

### `pnpm check` fails on the writing rule

A hyphen, an en dash or an em dash in text written for people. Use a comma, a colon, a
period, parentheses, or rewrite. Inside a code span or a link destination it is
allowed. The message names the file and the column.

### `pnpm check` fails on translations

A key exists in one language and not the other, or the product name was written out
instead of being left to `{{app}}`. Both languages have to hold the same keys.

### Biome complains about a function called `useSomething`

Biome treats any name starting with `use` as a React hook and applies the rules of
hooks to it. Rename it.

### A test passes locally and fails in CI

CI runs on Node 22 and on Node 24. The usual cause is something that behaves
differently in the SQLite that ships with each.
