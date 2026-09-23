# ADR 0012: Rules that sort, and series that write

**Status:** Accepted
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

## Context

Two features arrive together in phase 3 because they answer the same complaint. The
records somebody types by hand are the ones that stop being typed after three weeks,
and the categories somebody sets by hand are the ones that stop being set after one.
Both need something that acts without being asked, and anything that acts without
being asked has to be predictable or it becomes a thing people switch off.

## Decision

### A rule is a substring, a category and an order

No regular expressions, no wildcards, no amount ranges. A rule says "when the
description has this text, it belongs there", ignoring case and accents, and the first
rule in order wins. A person can read the whole list back a month later and know what
it will do, which a pattern language would not give them.

A rule may be narrowed to one account and to one kind, which covers the real cases
(the card used only for the market, the transfer that is never spending) without
turning into a query builder.

### A rule never overrules a person

Rules run when a record arrives with no category. Running them over what already
exists only touches records nobody sorted. Somebody who filed a purchase by hand has
answered the question, and a rule written afterwards does not get to change that
answer behind their back. The one way to overrule is to edit the record.

### A recurrence is a rule, not a queue

Nothing stores "the next occurrence". The series is worked out from its own
definition every time it is asked, so the answer does not drift when a device is
offline, a clock is wrong, or the definition is edited. `occurrencesBetween` in
`packages/core` is pure and covered by a property test.

The day is clamped, never rolled over: a bill due on the thirty first falls on the
twenty eighth of February, because that is when the money leaves.

### What a series writes are ordinary planned records

Not a separate kind of thing. A generated record is a transaction with `recurrence_id`
set and `status` planned, so every screen that understands a record understands these:
the list filters them, the calendar draws them, the balance leaves them out until
somebody says it happened.

Generation is idempotent by day. A series never writes two records for the same date,
whatever runs it and however often, which is what lets the interface simply run it on
every load instead of needing a scheduler that browser mode could not have.

Removing a series takes back the promises it made about days that have not arrived,
and leaves everything that already happened.

### One currency per series

A recurring record in another currency would need a rate for every day it writes, and
a rate from a year ago is not a rate anybody wants applied to next month. Until the
rate question is answered properly, a recurrence lives in the currency of its space
and says so when it refuses.

## Consequences

Phase 6 will import statements, and the same rule engine sorts what it reads, which is
where the feature pays for itself twice.

Generation on load costs one query per series per load. With a horizon of about two
months and the handful of series a person actually has, that is nothing. If somebody
ever has hundreds, the horizon and the trigger are both parameters.

The calendar is the first screen that shows the future as a fact of the month rather
than as a projection, and phase 8 builds its scenarios on the same rows.
