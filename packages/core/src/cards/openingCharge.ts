// What a card already owes on the day it is written down.
//
// The cycle of a card somebody already owns started before they got here. So the account
// form asks what is on the invoice today, and the answer becomes one record dated today,
// charged to that card, which lands on the invoice still taking purchases because that is
// what any record dated today does.
//
// It is a small rule and it was seven lines inside a React component, where no test could
// reach it and where the question of what an empty field means was answered by a truthiness
// check. An amount of money is a rule, so it lives here.

import { MoneyError } from "../money/money.ts";
import {
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
	compareCalendarDates,
} from "../time/calendar.ts";
import { type CardCycle, invoiceDueDate, invoiceMonthOf, invoicePeriod } from "./invoice.ts";

export type OpeningCharge = {
	kind: "expense";
	/** Minor units, always above zero: nothing is written for an empty field. */
	amount: number;
	happenedOn: CalendarDate;
};

/**
 * The one record a card is written down with, or nothing.
 *
 * Nothing for an empty field, for zero and for a negative amount, which are three ways of
 * saying the card owes nothing and none of them is a record. A card with nothing on it is
 * the ordinary case and writing an expense of zero for it would put a line in somebody's
 * history that says nothing happened.
 *
 * A fraction of a cent is refused rather than rounded. Money is an integer number of cents
 * everywhere in this application, and a caller that has not parsed its field yet should
 * find that out here rather than halfway into a database.
 */
export function openingChargeOf(input: {
	charged: number | null;
	today: CalendarDate;
}): OpeningCharge | null {
	const amount = chargedAmount(input.charged);
	if (amount === null) return null;
	return { kind: "expense", amount, happenedOn: input.today };
}

function chargedAmount(charged: number | null): number | null {
	if (charged === null) return null;
	if (!Number.isSafeInteger(charged)) {
		throw new MoneyError("what is on an invoice is an integer number of cents");
	}
	return charged <= 0 ? null : charged;
}

/** The invoice that closed and waits to be paid, on one day. */
export type ClosedInvoice = {
	month: CalendarMonth;
	dueOn: CalendarDate;
	/** The last day it took purchases, the day before it closed. */
	lastDay: CalendarDate;
};

/**
 * The invoice that has closed and is not due yet, or nothing.
 *
 * Between the closing day and the due day somebody can mean two invoices: the one still
 * taking purchases, and the one that closed and waits to be paid, which is the one the bank
 * shows first. The form asked only about the first, so whoever typed the second there saw it
 * land on the invoice a month later.
 */
export function closedAndNotDue(today: CalendarDate, cycle: CardCycle): ClosedInvoice | null {
	const closed = addMonthsToMonth(invoiceMonthOf(today, cycle), -1);
	const dueOn = invoiceDueDate(closed, cycle);
	if (compareCalendarDates(today, dueOn) > 0) return null;
	return { month: closed, dueOn, lastDay: invoicePeriod(closed, cycle).to };
}

/**
 * The record for what the invoice that closed still holds, or nothing.
 *
 * Dated on the last day it took purchases and named after it, so it lands there whatever
 * the cycle says about that day, and counts as spending of those days rather than of today.
 */
export function closedChargeOf(input: {
	charged: number | null;
	today: CalendarDate;
	cycle: CardCycle;
}): (OpeningCharge & { invoiceMonth: CalendarMonth }) | null {
	const closed = closedAndNotDue(input.today, input.cycle);
	if (!closed) return null;
	const amount = chargedAmount(input.charged);
	if (amount === null) return null;
	return { kind: "expense", amount, happenedOn: closed.lastDay, invoiceMonth: closed.month };
}
