// Which bills are coming, and which ones are already somebody's problem.
//
// A list of what falls due in the next days looked forward from today and was built with
// one bound: nothing further off than the horizon. For a record that is enough, because
// the query that feeds it starts at today. For a card invoice it was not: an invoice that
// fell due last week, or three months ago, passed the only test there was and was drawn
// under a heading that said it was coming. A bill nobody paid is the opposite of a bill
// that is coming, and it was the one line on the screen that needed answering.
//
// So the sorting is a rule of its own, here, rather than a filter inside a component.

import type { CalendarDate, CalendarMonth } from "../time/calendar.ts";
import { compareCalendarDates } from "../time/calendar.ts";

/** One invoice, said in the little that a list of bills needs to know about it. */
export type InvoiceFallingDue = {
	accountId: string;
	month: CalendarMonth;
	dueOn: CalendarDate;
	/** What is still to pay, in minor units. */
	left: number;
};

export type InvoicesFallingDue<T extends InvoiceFallingDue> = {
	/** Past the due day and still owing, oldest first. The bills to answer. */
	toAnswer: T[];
	/** Due today or later and inside the horizon, soonest first. The bills coming. */
	coming: T[];
};

/**
 * The invoices a card still owes, split into the ones to answer and the ones coming.
 *
 * An invoice with nothing left on it is in neither list, because it is paid. One past its
 * due day is in `toAnswer` with no bound at the far end: a bill three months late is still
 * a bill, and hiding it because it is old is how it came to be three months late. One due
 * today counts as coming, because the day is not over.
 */
export function splitInvoicesFallingDue<T extends InvoiceFallingDue>(input: {
	invoices: ReadonlyArray<T | null | undefined>;
	today: CalendarDate;
	/** The last day the forward list reaches. */
	until: CalendarDate;
}): InvoicesFallingDue<T> {
	const toAnswer: T[] = [];
	const coming: T[] = [];

	for (const invoice of input.invoices) {
		if (!invoice || invoice.left <= 0) continue;

		if (compareCalendarDates(invoice.dueOn, input.today) < 0) {
			toAnswer.push(invoice);
			continue;
		}
		if (compareCalendarDates(invoice.dueOn, input.until) <= 0) coming.push(invoice);
	}

	const byDueDay = (one: T, other: T) => compareCalendarDates(one.dueOn, other.dueOn);
	return { toAnswer: toAnswer.sort(byDueDay), coming: coming.sort(byDueDay) };
}
