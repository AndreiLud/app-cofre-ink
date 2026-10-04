// Whether a record has happened yet, asked in one place.
//
// Release 1.1.0 decided that a record dated ahead, a part of an instalment plan and a
// day a series owes all count by themselves once their day arrives, with nobody saying
// so. It was built halfway: the form, the one line reader and the series went on writing
// those records as promises, nothing ever turned a promise into a fact, and on its day a
// record dated ahead stayed out of the balance and the next morning showed up as late.
//
// So a record written from now on is written as having happened, and its day holds it
// back until the day arrives. A promise, the status called planned, is what release 1.0
// wrote and what the bulk edit can still set by hand; it counts only when somebody says it
// happened, as it always did.
//
// That makes two questions with one answer each, and every query that separates what has
// happened from what is still to come asks them here. Each one used to write its own, and
// four of them wrote none: the balance of a goal, the months the check up reads, the net of
// each month behind, and the month so far on the overview.

import type { CalendarDate } from "@cofre/core";

/** The prefix of a column in a query: an alias with its dot, or nothing. */
function prefix(alias: string | null): string {
	return alias === null ? "" : `${alias}.`;
}

/**
 * Has happened by a day: a fact, and its day has come. One parameter, the day.
 *
 * The status alone is not enough any more, because a fact dated ahead is a fact whose
 * day is still to come. The day alone is not enough either, because a promise from before
 * 1.1.0 counts only when somebody says it happened.
 */
export function happenedBy(alias: string | null): string {
	const column = prefix(alias);
	return `(${column}"status" = 'settled' AND ${column}"happened_on" <= ?)`;
}

/**
 * Still to come on a day: everything that has not happened by it. One parameter, the day.
 *
 * It holds a promise from before 1.1.0 whatever its day, which is how the months ahead
 * have always counted one that nobody answered, and a fact dated after the day.
 */
export function stillToComeOn(alias: string | null): string {
	const column = prefix(alias);
	return `(${column}"status" = 'planned' OR ${column}"happened_on" > ?)`;
}

/**
 * Existed by a day that has gone: its day had come, or it is a part of a purchase in parts whose
 * first part had, because the bank puts the whole plan on the card the day of the purchase. One
 * parameter, the day. The alias is required, because the plan is read from the same table.
 *
 * What "as it stood" means for a record, registry 0062. The cards of the month on paper read it
 * from 2.0.0, and the months ahead of that file wrote their own nothing until a chair bought in
 * October turned up in the file of September.
 */
export function stoodBy(alias: string): string {
	const column = prefix(alias);
	return `(CASE WHEN ${column}"installment_group" IS NULL THEN ${column}"happened_on"
	     ELSE (SELECT MIN(sibling."happened_on") FROM "transactions" sibling
	           WHERE sibling."installment_group" = ${column}"installment_group"
	             AND sibling."deleted_at" IS NULL)
	     END) <= ?`;
}

/** The same question about a record already read, for code that holds rows rather than SQL. */
export function hasHappened(
	record: { status: string; happenedOn: CalendarDate },
	today: CalendarDate,
): boolean {
	return record.status === "settled" && record.happenedOn <= today;
}
