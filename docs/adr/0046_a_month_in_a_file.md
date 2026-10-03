# 0046. A month in a file, written by the browser

Date: 29 September 2026

## Status

Accepted. Amends registry 0015, whose section "A report on paper is the same report"
decided there would be no PDF writer in this project, and corrects two statements in it.

## Context

The owner asked for the whole month as a PDF, and said plainly which way they preferred:
a button that downloads the file, with a library loaded only when it is pressed. They
also said to bring the options back if the cost was high on size, on the accessibility of
the PDF or on the fidelity of the charts.

It was high on all three, and the figures are worth writing down.

**Size.** The first load of this application is 272 KB compressed. jsPDF with the SVG
bridge, or `pdf-lib` with a font, is 110 to 130 KB compressed on top of that, which is a
forty to fifty per cent increase in what a device fetches.

**Accessibility.** Neither library emits a tag tree. The PDF a browser writes from a page
does have one, derived from the page itself. The target, convention 7 of
[the contributing guide](../en/contributing.md#conventions), is WCAG 2.2 AA, so the library
route produces a worse file than the one already available for nothing.

**The charts.** They are SVG drawn by hand, coloured through custom properties, so
serialising one yields class names and no colour: any library path has to walk the tree
with `getComputedStyle` and inline every fill, stroke and font before the drawing means
anything outside the document. One of them is not SVG at all.

Two things registry 0015 said are not true and are corrected here. There **is** a PDF
writer in the repository, `packages/importers/src/pdf/buildPdf.ts`, and it is a fixture
for the reader tests: it writes no cross reference table and cannot write Portuguese, so
it is not a writer for people and never was. And the print stylesheet it describes is two
blocks in two packages that disagree, which is its own correction.

## Decision

A screen of its own at `/relatorio`, holding the whole month in the order the owner
listed, with a button that opens the browser's print dialogue and a line saying to choose
"Save as PDF" rather than a printer.

A screen rather than a print stylesheet over the reports screen, because what goes in the
file is more than that screen shows and in another order: the summary, the cards, the
categories, the priorities, the twelve months, the budget, the saving, the check up, the
months ahead and the investments.

Every figure has a table it can be read from. No number on the page exists only inside a
drawing, which is convention 6 applied to a page whose whole purpose is to be read
somewhere else.

A month already over is read as it stood on its last day, so the check up and the months
ahead in the file are about that month rather than about today.

The document title is set to `cofre_relatorio_2026-09`, which is the only say a page has
over the name a browser suggests. This is the one screen that names itself, so the shell,
which names every other tab after the screen and the space and the product, leaves this one
alone. It did not at first, and the reason is worth keeping: React in development mode runs
an effect, undoes it and runs it again, so the page set the name, put it back and set it
again, and ended up holding it. In a build the effect runs once and whatever runs after it
wins, and the shell runs after it whenever the space arrives. So the file came out named
after the tab for everybody who had actually installed this, and the browser test passed,
because it ran against the dev server and because a title assertion succeeds the first time
it matches. The test for it lives with the other tests about the build.

What a person sees on a screen is what goes in their file: somebody who reads only what
they wrote gets a file of that, with no check up in it and a line saying whose the figures
are, for the same reason that screen closes to them.

## Consequences

Nothing is added to the bundle and nothing leaves the device, which is golden rule 5 with
no new surface to defend.

The file is produced through a dialogue rather than by a download, which is the one thing
the owner asked for and did not get. The name can be suggested and not imposed.

There are now two things that print: the reports screen, which prints what is on it, and
this page, which is the month. That is one more than before, and both are the same DOM the
browser was already rendering, so neither is a second rendering of the report to keep in
step. A library would have been exactly that.
