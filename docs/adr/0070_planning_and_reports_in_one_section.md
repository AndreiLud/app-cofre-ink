# 0070. Planning and Reports in one section

Date: 3 October 2026

## Status

Accepted. Amends registry 0022, whose five entries become Painel, Lançamentos, Planejamento,
Contas and Ajustes; registry 0045, whose six sections are five again; and registry 0046, which
said two things print, when three do.

## Context

Registry 0045 took Accounts out of the settings and made it a section, which was right, and left
six sections where 0022 had five. On a telephone the bar along the bottom holds the sections side
by side, and six of them at 360 pixels cut two of the names: "Lançamen..." and "Planejame...".
The comments in the shell and in the browser tests still said five.

Reports was a section with no second level, beside a Planning section of four screens. Reading
the months that have gone and deciding the months ahead are the same question asked about two
ends of the calendar, and somebody who came to see whether the budget held looks at both.

Three screens on no line of the navigation, importing, the month on paper and the spaces, said
the overview was the page in front of somebody, because the section of a screen was looked for
only among the lines.

## Decision

**Five sections.** Planejamento ("Planning") opens on Reports and holds, in this order, Reports,
Budget, Check up, Projection and Investments, under one mark. No address changes and none
redirects: `/relatorios`, `/orcamento`, `/diagnostico`, `/projecao` and `/investimentos` open
what they always opened, which registry 0045 already relied on.

**A section names the screens off its lines that are still in it.** Each section carries a list
of extra paths that mark it as the one somebody is in: the month on paper in Planning, importing
and the spaces in Ajustes, which is where the data screen and the menu of the space send
somebody. One property for the three, and not a table beside the sections.

**The bar measures itself.** At 360 by 720 no name in the bar is wider than its box, which the
browser tests read from `scrollWidth` and `clientWidth`. With five sections "Planejamento" fits
whole, so the bar writes the same word as everywhere else and the shorter "Planos" was not
needed.

**The tab names the check up and the series**, which had no name of their own in it.

**Printing stays where it was.** The Reports screen keeps its print button and its link to the
month on paper, a link drawn as a button. Three things print: the Reports screen and the
Projection, each what is on them, and the month on paper, which is the file.

## Consequences

1. A telephone shows every section by its whole name.
2. Getting to Reports is a tap on Planning, which opens on it; the other four are one tap more
   on the line under it.
3. Every saved address and every link works as before.
