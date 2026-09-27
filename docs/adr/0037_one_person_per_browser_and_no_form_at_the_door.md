# 0037. One person per browser, and no form at the door

Date: 27 September 2026

## Status

Accepted. Replaces the profile part of registry 0028, which gave a browser more than one
person, and moves what registry 0005 built a screen for.

## Context

Three things had grown around the idea that a browser holds people.

A form stood behind the front door asking for a name, an email, a currency and what the
personal space is called. Registry 0028 had already decided that a form between a
stranger and the thing they came to look at is a form most of them close, and it removed
it from one of the two doors. The other door still had it.

A menu carried "change my name", "be this other person" and "make room for somebody else
on this machine". That was phase 14, and the case it was built for is real: one machine
at home, two people. What it actually shipped was weaker than the thing every operating
system already gives away, a second browser profile, and it was separation rather than
security, which the documents had to say out loud.

And who is in a space was a screen of its own, reached from a menu, which put "who is in
this space" somewhere other than the screen about spaces.

## Decision

### The door asks one question and nothing else

Where the data lives is the only answer that cannot be changed afterwards, so it is the
only one asked. Everything the form used to want is made with a default and corrected
from inside: what the space is called and what currency it counts in are one screen, and
the name of the person is shown to nobody in a browser that holds one person.

The form is gone. So is the path that showed it: a browser that kept the database and
lost the profile makes another one with the same defaults instead of stopping to ask.

### A browser holds one person

No profile list, no switching, no renaming. A second person on the same machine opens a
second browser profile, which separates more than this application ever did and costs
them nothing to learn.

What this gives up is small and is written here so nobody has to guess later: somebody
who had made a second profile on this device still has that person and their spaces in
the database, and the application will not offer to become them again. Nothing is
deleted. Restoring a backup of those spaces is the way back to them.

The people table stays exactly as it was, because a shared space still carries the names
of the people in it and every record still points at one.

### Who is in a space lives with the spaces

The members screen is a section of the spaces screen now, under the list, for whichever
space is open: who is in it, with which role and what they said they earn, the invitation
that only a server can offer, and the settling up. Nothing was dropped in the move.

Sharing itself is untouched. A shared space still has members with roles, an expense
still divides, and the settle up still says who pays whom.

## Consequences

The first screen of the product is one question with two answers, and the second screen
is the application with money in it. That is the shortest honest path from a stranger to
a working Cofre, and it is the one a 1.0.0 should be measured against.

The interface lost nineteen strings and two screens, which is nineteen strings and two
screens fewer to keep in two languages.

A person who wants their name on their own records cannot set it. That is deliberate: in
a browser that holds one person, nobody is ever shown it. In server mode the name comes
from the account, where it belongs, and there it is still theirs to change.
