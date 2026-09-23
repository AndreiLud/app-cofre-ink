# ADR 0033: The name, the drop, and the one place the name lives

**Status:** Accepted
**Date:** 23 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

The owner renamed the product to Cofre Ink and asked for a look that goes with the
second word.

The look was mostly already there. [ADR 0006](0006_visual_direction.md) chose paper and
ink as the direction on the first day and [ADR 0023](0023_surfaces_weight_and_one_colour.md)
tightened it into warm paper, one cool ink blue and two weights of line. The palette did
not need repainting to earn the name: it needed the name to catch up with it.

What did not fit was the mark. It was the door of a safe, which is what the first word
means and says nothing about the second.

Two smaller things turned up on the way. The name was written out inside eighteen
sentences in each language, so a rename meant thirty six edits and two languages that
could drift apart. And one sentence still offered a desktop application, which was
dropped from the project in phase 9.

## Decision

### The name lives in one place, and the copy asks for it

Every sentence that names the product says `{{app}}`, and i18next fills it in from
`APP_NAME` through `defaultVariables`, so no screen passes it and no call site changed.
The next rename is one line.

### What is renamed and what is not

Renamed: the interface, the tab title, the manifest, the icon, the log line the server
prints, and the documents written for a person.

Not renamed: the package scope `@cofre/*`, the environment variables `COFRE_*`, the
default database file and the repository. Those are names for whoever reads the source,
the churn would touch every file in the workspace, and nobody outside the project ever
sees one.

### The mark is a drop of ink in the door of a safe

The two halves of the name in one shape. The dial and its handle came out: three small
shapes inside a frame is one too many at sixteen pixels, and the drop is the half of the
name that was missing.

It is still drawn rather than stored, so the change is a change to arithmetic and the
repository carries no binary nobody can read a diff of.

### The second word is set in italic

A serif italic is the closest a screen gets to something written by hand rather than
printed, which is the argument for the name. The first word stays upright so the pair
reads at the size a header gives it. The component splits on the last space, so a name
of one word renders as one word and nothing has to be told when that changes.

### The rule under the header is laid, not ruled

It carries its weight across the middle and lifts at both ends, which is what a pen does
and what a border cannot. Same one pixel of height, so nothing below it moves.

## Consequences

1. Two defects went with it. A sentence offering a desktop application that does not
   exist now points at the file destination, which does. And the Portuguese hint for
   that destination named three brands the English one did not, which is the only place
   in 1098 pairs where the two languages said different things.
2. The mechanical check the project already runs proves the two languages hold the same
   keys. It does not prove they hold the same meaning, and a second pass over variables,
   plural forms and untranslated duplicates found nothing, which is worth knowing but is
   not the same as reading them.
3. Anything built before this keeps the old icon in its cache until the service worker
   takes over, which it does on the next load.
