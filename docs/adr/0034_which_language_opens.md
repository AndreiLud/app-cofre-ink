# ADR 0034: Which language opens, and who is allowed to say

**Status:** Accepted
**Date:** 25 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

The interface has been in two languages since the first phase, and until now it opened
in Portuguese for everybody. [ADR 0007](0007_language_and_writing_rule.md) settled which
artifact is written in which language and left the interface at "Portuguese by default,
English through i18n". That default made sense while the only person opening it was the
owner.

Two things changed it.

The product is now published at an address anybody can open, and the site in front of it
is written in both languages. Somebody reading the English site and pressing the button
that opens the application was landing in Portuguese, which reads as the application
being a different product from the page they just left.

And the application is meant to be cloned and run by strangers, in a browser, in a
container at home and from a folder of somebody else's domain. Whatever decides the
language has to work in all of those, including with no connection at all.

The obvious way to know where somebody is would be to ask a service what their address
resolves to. That is off the table: this project does not send anything anywhere without
the owner pressing something, and a lookup on the first paint would break the browser
mode, the offline mode and the promise at the same time.

## Decision

### Four answers, and the first one that speaks wins

1. **The `lang` parameter of the address**, when it is `pt` or `en`. This is the site
   saying which language the person chose over there. Any other value is ignored rather
   than guessed at.
2. **The choice this browser already holds**, which is what the button writes.
3. **The zone of the device**, read from `Intl.DateTimeFormat().resolvedOptions()`.
   A zone of Brazil opens in Portuguese and every other zone opens in English.
4. **Portuguese**, when the device will not say.

The order is a pure function in `packages/core`, so it is written in one place, reads
top to bottom, and is tested without a browser. What is left in the application is the
part that cannot be pure: reading the address, reading the clock, and writing a choice
down.

### The clock decides the first screen and nothing else

A language that came from the zone is never written down. If it were, somebody who
travels would come back to an interface that had translated itself while they were away,
and a person who deliberately reads English in São Paulo would have to press the button
again after every trip.

A language that came from the address **is** written down, exactly as a press of the
button would be, because it is a choice, made one page earlier.

### The zones are written out, not matched by a prefix

Sixteen current zones and five names the database kept after renaming them. `America/`
is two continents and matching it would hand Portuguese to every device between Alaska
and Patagonia. The list is a set in the core package with a test that walks it.

### The parameter is taken back out of the address bar

With `history.replaceState`, keeping the path, the rest of the query and the fragment,
and replacing the entry rather than adding one. A parameter left in the bar rides along
in every link somebody copies out of the application, handing a language to whoever they
send it to.

### Nothing is asked of anybody

No address lookup, no geolocation, no third party. The zone is a string the device
already holds and it never leaves the device. This is what lets the same build behave
the same way at an address of its own, inside a container, in a folder of a domain and
on a machine with no connection.

## Options considered

### The language the browser asks for, `navigator.languages`

The obvious candidate, and the one most sites use. Rejected as the first signal because
it answers a different question. It says which language somebody reads, which on a
Brazilian phone is almost always Portuguese, including for a Brazilian living abroad who
came to the application from the English site. The zone answers where the device is,
which is the question the owner asked, and the address answers what the person actually
chose, which beats both.

It remains the obvious thing to add later if the zone turns out to be a poor proxy, as
one more step in a list that already has four.

### Asking on the first screen

A third door on a front door that was deliberately cut down to two, for a choice that
one button in the header already changes and that the site can make on the person's
behalf. Rejected: a question nobody needs to answer is worse than an answer that is
usually right and always correctable.

### An address lookup

Accurate, and against the whole product. Rejected on the first sentence.

## Consequences

1. **This amends decision 2 of `CLAUDE.md`.** The interface is no longer "Portuguese,
   with English available". It opens in the language of wherever the device is, unless
   somebody has said otherwise, and Portuguese is what it falls back to.
2. **The flows in a browser had to be pinned to a zone.** They are written in Portuguese
   and the runners sit in UTC, which is not Brazil, so `playwright.config.ts` now sets
   `timezoneId`. Without it the suite passes on a machine in Brazil and fails everywhere
   else, which is the worst kind of test.
3. **Somebody in Brazil who wants English still pays one repaint**, because Portuguese
   is the bundle and English is fetched. That was already true for anybody who chose
   English and is the price of not shipping both.
4. **The zone is a proxy and will be wrong sometimes.** A Brazilian abroad with their
   laptop on local time opens in English. The button is one press and the choice sticks,
   which is the whole reason the clock is never allowed to write one.
