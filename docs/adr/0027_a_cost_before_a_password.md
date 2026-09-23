# ADR 0027: A cost before a password, and no captcha from anybody else

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

A Cofre server that somebody runs at home has a sign in form on a public address, and
public addresses are found by machines within hours of existing. What was in the way was
a rate limit from Better Auth: five sign in attempts a minute and five new accounts an
hour, counted per address.

That stops one machine. It does not stop a thousand addresses, which is what anybody
doing this at scale has.

The owner asked for a login page with a password and a reCAPTCHA, so that no bot can get
past it.

## Decision

### Work, not a widget

Before the server reads a password, it asks the caller to find a number whose hash of a
salt the server issued starts with eighteen zero bits. Finding it costs about a quarter
of a million hashes, which is a moment in a browser. Checking it costs the server one
hash.

That asymmetry is the whole of it. A person signing in pays a moment once. Anything
trying a thousand passwords pays that moment a thousand times, and no number of addresses
avoids it, because the cost is not counted per address: it is counted per attempt.

The challenge is single use and lives five minutes, so a solved one cannot pay for a
second attempt, and the list of open ones is pruned and capped so that asking for a
million of them costs the asker rather than the server.

### Why not reCAPTCHA

Golden rule five of this project says nothing leaves the device or the owner's server
without an explicit action by the owner. A reCAPTCHA on the sign in page of a private
server means every person who opens it announces themselves to Google, including the
owner, on a page that exists precisely because they wanted their money off somebody
else's computer. It exists to recognise a person between visits, which is the opposite of
what this project is for.

So it is not the default and it is not what was built. What was built is the thing that
answers the actual question, which was bots, without answering a question nobody asked,
which was who is visiting.

### Turnstile, for the owner who wants a widget anyway

Cloudflare Turnstile is supported, off unless `COFRE_TURNSTILE_SITE_KEY` and
`COFRE_TURNSTILE_SECRET` are both filled in. It is the same kind of trade made smaller:
still a third party, no cookies and no profile. It adds to the work rather than replacing
it, and a server that cannot reach Cloudflare refuses the sign in rather than waving it
through.

It has not been exercised against the live service, because that needs an account and a
key. The code path is small and the failure is closed, and this is written down rather
than left to be discovered.

### The gate sits in front of the handler, not behind it

Registered with `app.use` above the route that Better Auth handles. The first version
registered it after, where it never ran: the catch all answered first and the tests said
so, which is the only reason it was not shipped open.

### What this is not

It is not a person detector and does not pretend to be. It does not know whether there is
a human on the other side, and anybody who says a challenge does is selling something.
What it does is make volume expensive, which is the part that was missing.

## Consequences

1. `packages/core` gains SHA 256 written out by hand, because the one the platform gives
   is a promise per call and this wants a few hundred thousand in a row. It is checked
   against the published vectors, including the two lengths where a padding written from
   memory goes wrong.
2. Signing in takes about a second longer on a slow phone, and the screen says why in one
   line rather than looking like a slow server.
3. Tests carry an answer like a browser does. What is made cheap for them is the
   difficulty, eight bits instead of eighteen, and not the rule: a request with no answer
   at all is refused in a test exactly as in production.
4. `COFRE_PROOF_BITS` is in the configuration with the reasoning beside it. Zero turns it
   off, for somebody who already has a gate of their own in front.
5. The content security policy of the interface now names one address that is not the
   site itself, and only that one. It is loaded only when the widget is switched on.
