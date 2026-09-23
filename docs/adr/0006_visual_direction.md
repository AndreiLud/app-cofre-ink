# ADR 0006: Visual direction and design system

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Two directions were proposed in phase 0. The first, called Papel e tinta, takes a well
printed bank statement and the business pages of a newspaper as its reference:
typographic hierarchy, thin rules, numbers in strict columns, no decorative cards. The
second, called Sinal, used colour as navigation, with each space tinting the interface,
on a dark background.

The owner chose Papel e tinta.

## Decision

### Colour

Light theme, which is the reference. Ratios are contrast against the paper background,
computed with the WCAG formula.

| token | hex | ratio on paper | use |
| --- | --- | --- | --- |
| paper | `#F4EFE4` | base | background |
| ink | `#16150F` | 15.9 | primary text, numbers, rules at full strength |
| graphite | `#63605A` | 5.5 | secondary text, labels, axis |
| cedar | `#2E6B4F` | 5.5 | income, goal met, positive variation |
| seal | `#A8321E` | 5.8 | expense, overdue, destructive action |
| amber | `#C9922B` | 2.4 | fills and icons only, never text |
| amberText | `#8A6210` | 4.8 | the text and icon variant of amber |

Dark theme, provisional values, calibrated with the same measurement in phase 1:
background `#1A1815`, text `#E8E2D6` (ratio 13.7), and lightened accents `#6FBF95`,
`#E8775F` and `#E0A94A`.

Rules for colour:

1. Colour never carries meaning alone. Income and expense are distinguished by sign,
   position and label before they are distinguished by cedar and seal.
2. Amber never renders text at its base value. The text variant exists for that.
3. Every new token is added with its measured ratio, and the measurement runs in CI.

### Space identity

Direction Papel e tinta resolves the "which space am I in" problem without tinting the
whole interface:

1. A filled dot in the space colour sits immediately before the space name, and the
   space name is always present in the header.
2. A hairline in the space colour runs under the top bar.
3. The quick entry form and the command palette both repeat the space name, because
   those are the two places where a record can land in the wrong space.
4. The space colour appears nowhere else. It never enters a chart, so it can never be
   confused with income or expense.

### Typography

1. IBM Plex Serif for page titles and for the sentence that opens a chart.
2. IBM Plex Sans for the interface.
3. IBM Plex Mono for amounts, tables and anything meant to be compared vertically.
4. Numbers always use tabular figures, so digits line up across rows.
5. Scale, in rem: 0.75, 0.875, 1, 1.125, 1.375, 1.75, 2.25. Line height 1.2 for
   numbers and titles, 1.5 for prose.
6. Fonts are self hosted, subset to Latin, and the interface renders with a system
   fallback while they load.

### Layout

1. Rules and alignment instead of cards. A card appears only when a block is genuinely
   detachable, for example an alert that can be dismissed.
2. Amounts are right aligned, in a column, with the same number of decimals.
3. Every chart is introduced by a sentence that states the finding, and every chart
   offers the equivalent table behind a control in the same block.
4. Spacing scale based on four pixels. Content column caps around 1200 pixels.
5. The dense table is the default on desktop, and the same data becomes a stacked list
   on a phone with no loss of information.

### Motion

Movement only when it answers an action or shows what changed. Durations of 120 and
180 milliseconds, one easing curve, and everything disabled under reduced motion.

### Implementation

1. Tokens live in `packages/ui` as CSS custom properties and feed Tailwind through its
   theme layer. Those property names use the framework namespace syntax, which is the
   one place the writing rule yields to a tool requirement.
2. Radix UI primitives provide behaviour and accessibility. Every visual detail is ours.
3. Icons come from Lucide, at a single stroke weight.
4. ECharts receives a theme generated from the same tokens, so a chart cannot drift
   from the interface.
5. Focus is always visible: a two pixel ink ring with an offset, on every interactive
   element, including inside tables.
6. Touch targets are at least forty four pixels on a phone.

## Tradeoffs

Papel e tinta is harder to execute than a grid of cards. Without discipline it reads as
loose text on a beige page. The safeguards are the token set, the rule that numbers
live in columns, and an accessibility and density review at the end of every interface
block.

What was given up by not choosing Sinal: the immediate visual punch of a dark control
panel, and colour as the primary space signal. The dot, the name and the hairline cover
the functional need, and the screenshots will look less like every other finance app.

## Consequences

Easier:

1. Screens stay readable at high information density, which this product needs.
2. Printing and the monthly PDF report inherit the design almost unchanged.
3. Accessibility starts from a high contrast base.

Harder:

1. Typography carries the hierarchy, so a careless heading size breaks a screen.
2. Charts have to be restrained to fit the palette instead of the other way round.

## Action items

1. [ ] Token package with the measured ratios and a CI check on contrast.
2. [ ] Self hosted font subsets and the loading strategy.
3. [ ] ECharts theme generated from tokens, with the table equivalent as a shared
   component.
4. [ ] Space identity components: the dot, the header and the hairline.
5. [ ] Storybook or an equivalent gallery page for the component set, decided in
   phase 1 block A.
