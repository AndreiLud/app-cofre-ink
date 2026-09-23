# ADR 0014: Charts drawn by hand, and screens that survive a resize

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Phase 5 is the first one that draws pictures, and the first where the layout is under
real pressure: eight sections in the navigation, tables with six columns, forms taller
than a phone. Two decisions had to be made, and they turn out to be the same decision
twice: what to bring in, and what to make sure of.

## Decision

### The charts are drawn here, not by a charting library

The obvious move is a library. It was turned down for three reasons that all point the
same way.

A library brings its own visual language. This product is typographic, on paper, with
rules instead of cards, and a themed chart engine lands somewhere between the two
looks, which is worse than either.

A library is heavy. The interface is meant to be installed on a phone and opened
offline, and the charts on one screen are not worth a megabyte in every visit.

And every chart here ships with a table holding the same numbers anyway, because a
chart nobody can read with a screen reader is half a feature. Once the table exists,
the drawing carries the shape and nothing else, and a shape is a few dozen lines of
SVG.

So `packages/ui` holds four small pieces: a flow diagram, a heat map of a month, a
column chart of the months, and a list with a bar behind each line. They take data and
a function that formats money, so no locale and no wording lives in the design system.

The cost is that any chart nobody has written yet has to be written. That cost is real
and it is the reason to revisit this if the product ever needs something genuinely
complicated, such as a zoomable time series.

### The flow diagram gives small flows a floor

A category that took one per cent of the month would be a hairline, invisible and
unclickable. Each node gets a minimum height and the larger ones give up the difference
in proportion, which keeps the shape honest while every flow stays visible. Nodes too
small for a label go unlabelled, and the table under the drawing has every number.

### A picture scales because of its coordinates, not because of a listener

Every chart is an SVG with a `viewBox`. The browser scales it. Nothing measures the
window, nothing listens for a resize, and there is no layout that can be a frame behind
the truth. On a phone the flow diagram is replaced by the two lists it stands for,
because ribbons at three hundred pixels are decoration.

### Overflow is handled where it happens

A wide table used to make the whole page scroll sideways, which drags the header and
the navigation with it and reads as a broken screen. Tables now carry their own
horizontal scroll, dialogs cap their height and scroll inside, and the navigation is a
row of links where there is room and a menu where there is not.

### The rule is checked, not remembered

`e2e/sizes.spec.ts` opens every screen at three sizes and asserts the same blunt thing
each time: nothing is wider than the window. It also opens a form on a short window and
checks that the buttons at the bottom of it are reachable. This is the sort of thing
that decays the week after it is fixed, so it is a test rather than a habit.

## Consequences

The consolidated view arrives with the reports: a report with no space named adds up
every space the person can read. It is the only place where money from different spaces
is counted in the same number, which is right, because a person with a personal space
and a house still has one life.

The interface bundle is eight hundred kilobytes before compression, which is too much
and is entirely the SQLite build plus the application. Splitting it per route is phase
ten work, and the numbers are recorded here so the next person knows where it started.
