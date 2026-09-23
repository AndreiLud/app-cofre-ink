# Authentication

## Browser mode has none, on purpose

There is no account, no password and nothing over the network. The database is a file
in that browser, reachable by whoever is holding it. That is stated plainly on the
front door rather than hidden, because the honest version of this mode is: **whoever
opens your browser sees your data.**

A public address exposes nothing. Everybody who opens it gets an empty Cofre Ink inside
their own browser, and whoever published it can read none of it.

More than one person can use one browser. Profiles are separate, each with its own
spaces, and switching is a menu item. It is separation, not security: nothing stops a
person from switching to another profile.

## Server mode

Identity belongs to Better Auth. Cofre keeps its own `users` row in step with it,
because every space and every record points at that row.

**Email and a password**, at least ten characters. No email is sent by this project,
which is why address verification is off: asking somebody to confirm an address nobody
can deliver to would lock them out of their own data.

**No OAuth, and no third party identity provider.** There is nothing to configure, and
nobody outside the server learns who signed in.

### What guards the door

Three things, in this order.

1. **A limit per address.** Five sign in attempts a minute, five new accounts an hour,
   sixty of anything else. Written out in `apps/server/src/auth.ts` where it can be
   read and changed, rather than left to a default that depends on whether the library
   believes it is in production.
2. **A proof of work, in front of the two routes worth attacking.** Before the server
   reads a password it asks the caller to find a hash with a number of leading zero
   bits. Eighteen bits is about a second in a browser and about a second on every single
   attempt for anything trying passwords in bulk. The limit above counts per address,
   and an attacker can find more addresses. This one cannot be walked past that way.
   The challenge is signed by the server and carries its own expiry, so the server
   keeps no state for it, and a salt that has been spent cannot be spent twice.
3. **Optionally, a Cloudflare Turnstile widget**, off unless both keys are filled in.
   It is off by default because it is a third party being told the address of everybody
   who opens the sign in page of a private server. That is a choice, not an
   inheritance.

Behind a reverse proxy, name the header it sets in `COFRE_CLIENT_IP_HEADER`. Without
it, everybody behind that proxy counts as one caller and the limit protects nobody. It
is never assumed, because a header anyone can set is a header anyone can lie about.

### The session cookie

Signed with `COFRE_SECRET`, http only, and the server sets the rest of it from where
the interface lives.

**When the interface and the server are the same site**, the cookie is Lax, which is
what makes a session immune to being ridden from somebody else's page.

**When they are genuinely different sites**, which is what happens if you use the
interface published at app.cofre.ink with a server of your own, the cookie is written
to travel. A browser will not keep such a cookie without a certificate, so the server
has to answer over https. Over plain http nothing is changed, because a cookie marked
secure on an http server is dropped on arrival, which is a worse failure than the one
it would be fixing.

The same host and a subdomain of it count as the same site. See `cookiePolicy` in
`apps/server/src/auth.ts`.

### Invitations

An invitation is a token, a role and an optional address it was meant for. Anybody
holding the link may read what it offers before having an account, which is what lets
somebody see what they are being invited to before signing up. Accepting requires being
signed in.

## Moving between modes

Browser mode and server mode both hold real data, and a person can move from one to the
other. The path is an export and a restore, or a sync: whoever is signed in becomes the
owner of what arrives, and of nothing else.
