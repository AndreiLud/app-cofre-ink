// Where one invoice stands.
//
// Until now an invoice was a filter over records: everything stamped with a month, added
// up. That answers what was spent and not whether it was paid, which is the question a
// person actually has in front of a card, and it is why the money left the accounts on
// the day of the purchase instead of on the day the invoice was paid.
//
// A payment is an ordinary transfer into the card account, marked with the invoice it
// pays. So an invoice is two sums and a subtraction, and everything a screen says about
// it comes from here rather than from each screen deciding again.

import type { CalendarDate, CalendarMonth } from "../time/calendar.ts";
import { compareCalendarDates, daysBetween } from "../time/calendar.ts";
import { type CardCycle, invoiceClosingDate, invoiceDueDate, invoicePeriod } from "./invoice.ts";

/**
 * Where an invoice stands.
 *
 * Paying more than was charged is a real thing people do, on purpose, to leave the card
 * with credit on it, so it has a name of its own rather than being folded into paid.
 */
export type InvoiceStanding = "open" | "partlyPaid" | "paid" | "inCredit";

export type InvoiceInput = {
	month: CalendarMonth;
	cycle: CardCycle;
	/** What was charged to this invoice, as a positive number. */
	charged: number;
	/** What has been paid against it, as a positive number. */
	paid: number;
	/** The day the question is being asked on. */
	today: CalendarDate;
};

export type InvoiceState = {
	month: CalendarMonth;
	/** The first and last day a purchase could land on this invoice. */
	from: CalendarDate;
	to: CalendarDate;
	closesOn: CalendarDate;
	dueOn: CalendarDate;
	charged: number;
	paid: number;
	/** What is still to pay. Negative means the card was paid more than it charged. */
	left: number;
	standing: InvoiceStanding;
	/** Whether the invoice has closed, so nothing new lands on it. */
	closed: boolean;
	/** Days until it closes. Negative once it has. */
	daysToClose: number;
	/** Days until it falls due. Negative once it has. */
	daysToDue: number;
	/** Closed, due, and still owing. The one state that is somebody's problem today. */
	late: boolean;
};

export function invoiceStateOf(input: InvoiceInput): InvoiceState {
	const { from, to } = invoicePeriod(input.month, input.cycle);
	const closesOn = invoiceClosingDate(input.month, input.cycle);
	const dueOn = invoiceDueDate(input.month, input.cycle);
	const left = input.charged - input.paid;

	// An invoice that charged nothing and was paid nothing is open rather than paid,
	// because there is nothing to have paid, and a card with no purchases on it saying
	// "paid" reads as an answer to a question nobody asked.
	const standing: InvoiceStanding =
		left < 0 ? "inCredit" : input.paid === 0 ? "open" : left === 0 ? "paid" : "partlyPaid";

	const daysToClose = daysBetween(input.today, closesOn);
	const daysToDue = daysBetween(input.today, dueOn);

	return {
		month: input.month,
		from,
		to,
		closesOn,
		dueOn,
		charged: input.charged,
		paid: input.paid,
		left,
		standing,
		closed: compareCalendarDates(input.today, closesOn) >= 0,
		daysToClose,
		daysToDue,
		late: compareCalendarDates(input.today, dueOn) > 0 && left > 0,
	};
}

/**
 * What a payment should be offered for, which is what is left rather than what was
 * charged. Paying an invoice twice because the field came back with the whole amount is
 * a mistake the screen can simply not make.
 */
export function amountToPay(state: InvoiceState): number {
	return Math.max(0, state.left);
}
