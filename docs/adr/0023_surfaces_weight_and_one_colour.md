# ADR 0023: Surfaces, weight, and one colour

**Status:** Accepted. Supersedes registry 0006.
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

The owner said the interface was extremely confusing and asked for the visual identity
to be redone and the whole of the experience reworked.

Looking at the screens rather than at the code, the complaint is exact, and the cause is
not the style. Registry 0006 chose a typographic direction, dense, with no decorative
cards, and it was applied with one surface, one weight of line and one weight of text.
The result is a screen where a secondary button, a text field and a divider are all a
one pixel border in the same colour. Nothing announces itself as the thing to press,
sections are stretches of text rather than objects, and the eye has nowhere to land.

Two screens said it plainly. The budget screen had three filled black buttons competing
and more explanatory prose than content. The records screen spent a third of its height
on six filters before showing a single record.

## Decision

### Three surfaces, not one

A page is the canvas. Content sits on a panel that is **lighter** than the canvas.
Anything a person types into is **sunken** below the panel. That is the single change
that does the most: a section becomes an object that can be taken in or skipped over,
instead of a paragraph between two hairlines.

`Panel` carries its own title and its own action, which is what stops a screen from
growing four headings that all look like the title of the screen. `SectionTitle` is now
used once per screen, at the top, saying where you are.

### A border is not a border

The rule between two rows of a table and the edge of a text field were the same colour
and the same weight. They are now two tokens: `line` separates, `lineStrong` encloses. A
control has a strong edge and a sunken fill, so it looks like something goes in it.

### One colour means "you can act on this"

A deep ink blue, and neither of the two colours money already uses. Warm paper, a cool
blue for anything interactive, and green and red left alone to mean what they mean on a
statement. It marks the primary action, the section you are in, the focus ring and the
tint of a chart, and it appears nowhere else.

Making the accent a second green was considered and rejected: two greens that differ
slightly read as a mistake, and a button that looks like an income amount is a button
that teaches the wrong thing.

### Three weights of button, and one of the first kind per screen

Filled in the accent, raised off the panel with a strong edge, or a word you can press.
A screen is allowed one filled one. Before, every section offered a black button and
none of them was the answer to "what do I do here".

### What a screen shows before you ask

Six filters open at all times became two, the month and the search, with the rest behind
a button that says how many of them are narrowing the list and offers to clear them. The
same principle applies wherever a screen was explaining itself at length: the prose
belongs in the empty state, where somebody is actually asking what this is for.

### What was kept

The warm paper, the serif headline, the monospaced tabular figures and the charts drawn
by hand. That is the character of this product and none of it was the problem. Registry
0014 stands: charts are still coordinates in a viewBox, in two shapes.

## Consequences

1. Every colour name in the interface changed at once, which is a mechanical migration
   of forty four files and is why it was done in one pass rather than screen by screen.
2. The contrast was measured again on the new surfaces. Quiet text on a panel is 6.6 to
   1, the accent on a panel is 9.7 to 1, and the accent as a filled button carries its
   own light text at 6.1 to 1. All above the 4.5 the target asks for.
3. A filter that used to be on the screen is now behind a button, so a flow that used
   one had to say so. That is the test doing its job: the interaction changed, and the
   test that described the old one changed with it.
4. The dark theme is the same three surfaces inverted, and nothing in a screen knows
   which one is active.
