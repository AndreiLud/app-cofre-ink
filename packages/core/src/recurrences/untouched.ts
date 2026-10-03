// Whether a record a series wrote is still the one it wrote.
//
// A change to a series applies from its next occurrence on, and pausing or deleting one takes
// back what it wrote ahead. Taking back means deleting records, and a record somebody changed
// by hand is no longer the series' to take: it is what they said about that day. So the
// question is asked of every record before it goes, here, in one place.
//
// It is asked of the record itself and never of its timestamps. A record whose two moments
// are equal looks untouched, and a restore writes both moments as the moment of the restore,
// so after one every record in the space would have looked untouched.

import { addDays, type CalendarDate } from "../time/calendar.ts";
import { occurrencesBetween, type RecurrenceSpec, weekdayOf } from "./schedule.ts";

/** What a series writes on each of its days. */
export type SeriesRecord = RecurrenceSpec & {
	kind: "income" | "expense" | "transfer";
	/** Positive, as on a series. The direction comes from the kind. */
	amount: number;
	accountId: string;
	counterAccountId: string | null;
	cardId: string | null;
	categoryId: string | null;
	description: string;
};

/** A record as it is now. */
export type WrittenRecord = {
	/** As stored, with its sign. */
	amount: number;
	accountId: string;
	counterAccountId: string | null;
	cardId: string | null;
	categoryId: string | null;
	description: string;
	happenedOn: CalendarDate;
	reconciledAt: number | null;
};

/**
 * Nobody touched it: not reconciled, and its amount, accounts, card, category, description and
 * day are what the series writes on that day.
 */
export function isUntouchedOccurrence(record: WrittenRecord, series: SeriesRecord): boolean {
	if (record.reconciledAt !== null) return false;
	const amount = series.kind === "expense" ? -series.amount : series.amount;
	if (record.amount !== amount) return false;
	if (record.accountId !== series.accountId) return false;
	if ((record.counterAccountId ?? null) !== (series.counterAccountId ?? null)) return false;
	if ((record.cardId ?? null) !== (series.cardId ?? null)) return false;
	if ((record.categoryId ?? null) !== (series.categoryId ?? null)) return false;
	if (record.description !== series.description) return false;
	return occurrencesBetween(series, record.happenedOn, record.happenedOn).length === 1;
}

/**
 * The period a day belongs to for a series: its month, its year, or the Monday of its week.
 *
 * A series that follows another writes nothing in a period where a record of the one before is
 * still there, changed by hand: the rent of November was paid on the fifth and changed, and the
 * series that moved the rent to the tenth does not write the tenth as well.
 */
export function seriesPeriodOf(frequency: RecurrenceSpec["frequency"], day: CalendarDate): string {
	if (frequency === "monthly") return day.slice(0, 7);
	if (frequency === "yearly") return day.slice(0, 4);
	return addDays(day, -((weekdayOf(day) + 6) % 7));
}
