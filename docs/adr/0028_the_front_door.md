# ADR 0028: The front door of an address anybody can open

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

The interface is about to be published on a static host, so the person in front of it is
no longer somebody who cloned the repository. It is anybody who followed a link.

What that person met was the onboarding form: a name, an email, a currency, the name of
a space and a checkbox, before anything of the product had been seen. The screen that
asks the one question that matters, where the data lives, existed and was already first,
but only for a browser that had never answered it. The owner, whose browser had answered
months ago, never saw it and reported it as missing.

The owner also asked for a way to sync "with an account, in the cloud". There is no
cloud here and there will not be one: nobody is going to run a server holding other
people's money records, which would make him the controller of that data, with the cost,
the backups and the duties that come with it. What exists is a server the person runs,
or a database in an account of theirs.

## Decision

### Two doors, and only one of them asks anything

The first screen offers to keep everything in this browser, or to sync between devices.
The second one opens onto the two ways of syncing that exist: a server of theirs, brought
up with Docker, which is also what shared spaces need, and a database of theirs in the
cloud, which needs no server at all and is set up on the data screen.

Neither of them puts a row anywhere that belongs to this project, and the screen says so
in those words.

### The local door asks nothing

Choosing to keep it here writes a profile with a default name, a personal space called
Pessoal in the language of the screen, the starting categories, and goes straight to the
overview. One checkbox on the way offers example data, unticked.

A form standing between a stranger and the thing they came to look at is a form most of
them close. Every answer it would have collected can be corrected from inside, and this
decision is what put those two corrections there: the name of the profile, which browser
mode could never change, and the name, colour and currency of a space, which nothing in
the interface could change at all. A default that cannot be corrected is a life sentence,
so both were built before the form was taken off the path.

The form itself stays. It is what somebody making room for a second person on the same
device sees, and what a browser that kept the mode and lost the profile lands on.

### The answer is remembered, and can be given again

The choice lives in this browser, as it did. What is new is a way back to the question
from the data screen, next to the panel that already says where the data is, along with
the sentence that matters when somebody switches: what is in this browser stays in this
browser and does not travel on its own. The button that turns syncing on is next to it,
because that is the thing they should press first.

### Moving from here to a server loses nothing

It already did not. The history is an append only log with a logical clock, and the
server destination pushes it and pulls back what it does not have. What was missing was
a name on it: it was three levels down a screen nobody opened, called "keep a copy
somewhere else".

## Consequences

1. The published address works for a stranger in one click, with no account anywhere.
2. Nobody signs up for anything that belongs to this project, because there is nothing to
   sign up to. The only sign in screen in the product belongs to a server the person runs.
3. A profile carries a name nobody chose until they change it. `renameProfile` is browser
   only on purpose: on a server the authentication layer owns the name and writes it over
   on every sign in.
4. The end to end suite no longer starts at the front door. It plants the answer and
   walks the form, because those flows need a person and a space with names. The front
   door has a file of its own.
