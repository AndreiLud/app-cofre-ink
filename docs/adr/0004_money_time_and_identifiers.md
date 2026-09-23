# ADR 0004: Money, time and identifiers

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Three primitives show up in every table and every calculation of this product. Getting
them wrong is the kind of mistake that is discovered a year later, in production, by a
person whose reserve fund is off by four cents. They deserve a decision of their own.

## Decision

### Money

1. An amount is an integer number of minor units, cents for BRL. Floating point never
   touches an amount, not in the database, not in the core, not in the transport.
2. An amount always travels with a currency code. The type is branded in TypeScript,
   so a raw number cannot be passed where an amount is expected.
3. Each space has a base currency, BRL by default. A record in another currency stores
   three things: the original amount with its currency, the rate used at the moment of
   the record (an integer scaled by ten to the eighth), and the converted amount in the
   base currency. Reports read the converted amount, so changing today's rate never
   rewrites history.
4. Display rounding is half away from zero, done once, at the edge, by the formatter.
5. Splitting a total into parts uses the largest remainder method, in a deterministic
   order by member identifier. The parts always sum to the total, to the cent. This is
   covered by property tests: for any total and any weights, the sum of the parts
   equals the total and no part is negative.
6. Installments follow the same rule. Twelve installments of a value that does not
   divide evenly distribute the leftover cents to the earliest installments, which is
   what Brazilian card issuers do, and the sum matches the purchase exactly.

### Time

1. A date that means a calendar day, such as the day a purchase happened or the day a
   bill falls due, is stored as text in the ISO calendar form. It has no timezone,
   because a purchase on the thirtieth is on the thirtieth regardless of where the
   phone is.
2. An instant, such as when a row was created, is stored as an integer number of
   milliseconds since the epoch, in UTC.
3. Each space has a timezone, `America/Sao_Paulo` by default. Turning an instant into
   a calendar day, deciding what "today" means and closing a month all go through the
   space timezone, never through the device timezone.
4. Formatting for people uses the interface locale, which is independent from the
   timezone and from the currency.
5. Date handling uses `date-fns` with its timezone package. Temporal is the better
   answer and will be reconsidered once it is available in every target browser and in
   the Node version we ship.

### Identifiers

1. Primary keys are UUID version 7, generated on the client. They are sortable by
   creation time, they need no coordination, and they let an offline device create
   rows that will never collide with another device.
2. Identifiers are opaque strings everywhere above the database. No screen and no API
   derives meaning from them.
3. Human facing references, such as an invoice number, are separate columns and never
   the key.

## Options considered

### Money as integer cents

Rejected alternatives: a decimal library such as `decimal.js`, and PostgreSQL
`numeric` with strings at the boundary. Both are correct, and both add a conversion at
every layer boundary plus a dependency in the browser bundle. Integer cents are exact,
free, and trivially portable between SQLite and PostgreSQL. The known ceiling is the
safe integer range, which is about ninety trillion reais, far beyond the domain.

### Calendar dates as text

Rejected alternative: storing every date as an instant. It is the most common way to
get a transaction to jump one day across a timezone boundary, and it makes SQLite
grouping by month awkward. Text in ISO form sorts correctly, compares correctly and
groups with a substring.

### UUID version 7

Rejected alternatives: auto increment integers, which cannot be generated offline
without collisions, and UUID version 4, which is not sortable and fragments database
indexes as the table grows.

## Consequences

Easier:

1. Sums are exact by construction. No rounding drift accumulates over a year.
2. Rows created offline merge with no key negotiation.
3. Month boundaries behave the same on a phone in Lisbon and a laptop in São Paulo.

Harder:

1. Every amount that enters the system, from a form, a CSV file or a statement parser,
   has to be parsed into cents with the right locale rules. Brazilian files use a comma
   as the decimal separator and a period as the thousands separator, and some banks use
   the opposite in the same export.
2. Multi currency reports need the converted column to be filled at write time, so any
   importer that skips it creates a hole. The conformance suite checks for that.
3. Developers reading the code have to remember that `4290` means forty two reais and
   ninety cents. The branded type and the formatter make that hard to forget.

To revisit:

1. Temporal, once it is broadly available.
2. Currencies with three decimal places or with no minor unit, if anyone ever asks.
   The model already carries the minor unit scale per currency.

## Action items

1. [ ] Implement the `Money` branded type, the parser and the formatter in
   `packages/core`, with property tests.
2. [ ] Implement the largest remainder split and the installment split, with property
   tests asserting the sum equals the total.
3. [ ] Implement calendar date and instant helpers bound to the space timezone.
4. [ ] Add a lint rule or a review checklist item that forbids arithmetic on amounts
   outside `packages/core`.
