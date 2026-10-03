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
	/** What has been paid against it, as a positive number. Only payments whose day has come. */
	paid: number;
	/**
	 * What is marked to pay it on a day still to come, and the last of those days.
	 *
	 * A payment dated the day the invoice falls due is the normal way to pay one, and until
	 * that day the money is still in the bank. Counted as paid, it took the invoice off what
	 * falls due while the bank still showed the money, and what was left to spend went up
	 * by the whole invoice for a week.
	 */
	scheduled?: number;
	scheduledOn?: CalendarDate | null;
	/**
	 * How much of what was charged is the debt the card already had when it was written
	 * down, which is an opening balance and not a purchase. Part of `charged`, said apart
	 * so a screen can explain an invoice with no purchases on it.
	 */
	opening?: number;
	/**
	 * Credit from the invoices before this one, which pays it like a payment does, and what
	 * this one hands on to the next because it was paid more than it charged. Worked out by
	 * `invoicesInTurn` for a whole card, and nothing for an invoice read on its own.
	 */
	carriedIn?: number;
	carriedOut?: number;
	/** The day the question is being asked on. */
	today: CalendarDate;
	/** How many of its records were written in a currency other than the one it is summed in. */
	inOtherCurrencies?: number;
	/** And how many of those carry no rate, so they have no honest figure in that currency. */
	withoutRate?: number;
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
	/** Marked to be paid on a day still to come, which is not paid yet. */
	scheduled: number;
	/** The last day of those payments, or nothing when none is waiting. */
	scheduledOn: CalendarDate | null;
	/** The part of what was charged that is the card's opening balance. */
	opening: number;
	/** Credit from the invoices before this one that pays part of it. */
	carriedIn: number;
	/** What was paid on this one beyond what it charged, handed on to the next. */
	carriedOut: number;
	/**
	 * What is still to pay. Negative means the card holds credit, which happens on the last
	 * invoice only, because every other one hands its credit on.
	 */
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
	/**
	 * How many of its records were written in another currency, and how many of those have
	 * no rate.
	 *
	 * Carried through rather than used: nothing in this file knows about currency. They are
	 * facts about the invoice, and the second one is the one that matters, because an invoice
	 * holding a purchase with no rate has no honest total and must say so instead of printing
	 * one that quietly leaves that purchase out.
	 */
	inOtherCurrencies: number;
	withoutRate: number;
};

export function invoiceStateOf(input: InvoiceInput): InvoiceState {
	const { from, to } = invoicePeriod(input.month, input.cycle);
	const closesOn = invoiceClosingDate(input.month, input.cycle);
	const dueOn = invoiceDueDate(input.month, input.cycle);
	const carriedIn = input.carriedIn ?? 0;
	const carriedOut = input.carriedOut ?? 0;
	// Paid by money and by the credit of the invoices before it alike.
	const covered = input.paid + carriedIn;
	const left = input.charged - covered + carriedOut;

	// An invoice that charged nothing and was paid nothing is open rather than paid,
	// because there is nothing to have paid, and a card with no purchases on it saying
	// "paid" reads as an answer to a question nobody asked.
	const standing: InvoiceStanding =
		left < 0 ? "inCredit" : covered === 0 ? "open" : left === 0 ? "paid" : "partlyPaid";

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
		scheduled: input.scheduled ?? 0,
		scheduledOn: (input.scheduled ?? 0) > 0 ? (input.scheduledOn ?? null) : null,
		opening: input.opening ?? 0,
		carriedIn,
		carriedOut,
		left,
		standing,
		closed: compareCalendarDates(input.today, closesOn) >= 0,
		daysToClose,
		daysToDue,
		late: compareCalendarDates(input.today, dueOn) > 0 && left > 0,
		inOtherCurrencies: input.inOtherCurrencies ?? 0,
		withoutRate: input.withoutRate ?? 0,
	};
}

/**
 * Every invoice of one card, oldest first, with what was paid too much on one handed on.
 *
 * Paying more than an invoice charged is a thing people do, and taking a purchase off an
 * invoice already paid does the same. The money stays with the bank as credit and pays the
 * next invoice. Only a payment with no invoice named on it used to move on, so an invoice
 * paid by its own button said "paid, with credit", and the next one asked for the whole of
 * what it charged. The credit moves forward and never back: an older invoice still owed is
 * paid by what was meant for it. What is left after the last invoice stays on it as credit.
 */
export function invoicesInTurn(inputs: readonly InvoiceInput[]): InvoiceState[] {
	const inOrder = [...inputs].sort((one, other) => one.month.localeCompare(other.month));
	const states: InvoiceState[] = [];
	let carry = 0;
	inOrder.forEach((input, index) => {
		const surplus = input.paid + carry - input.charged;
		const handsOn = index < inOrder.length - 1 && surplus > 0 ? surplus : 0;
		states.push(invoiceStateOf({ ...input, carriedIn: carry, carriedOut: handsOn }));
		carry = handsOn;
	});
	return states;
}

/**
 * What a payment should be offered for, which is what is left rather than what was
 * charged. Paying an invoice twice because the field came back with the whole amount is
 * a mistake the screen can simply not make.
 *
 * Less what is already marked to pay it on a day still to come, for the same reason: that
 * payment is not paid yet, and it is not something to pay again either.
 */
export function amountToPay(state: InvoiceState): number {
	return Math.max(0, state.left - state.scheduled);
}

export type LimitLeftInput = {
	/** What the bank allows on the card, or nothing, when nobody wrote it down. */
	creditLimit: number | null;
	/** Every invoice of the card that has anything on it, as `invoicesInTurn` reads them. */
	states: readonly InvoiceState[];
};

/**
 * How much of the limit a card still has, which is the figure somebody checks before
 * paying at a till.
 *
 * Counted once: what is left on every invoice, the open one, the ones before it and the
 * instalments still to come after it. An invoice already paid is headroom given back.
 * Counting the months ahead twice, which this did once, made a card with a limit of five
 * thousand and a purchase of nine hundred in three parts report three thousand five
 * hundred left instead of four thousand one hundred.
 *
 * Credit the card holds is headroom too, which is what the bank does with it. It sits on
 * the last invoice, because every other one hands its credit on (`invoicesInTurn`).
 *
 * Nothing comes back when no limit was written down. Guessing at one would be inventing
 * the figure, so the screens say so in words instead.
 */
export function limitLeftOf(input: LimitLeftInput): number | null {
	if (input.creditLimit === null) return null;

	let owed = 0;
	for (const state of input.states) owed += state.left;
	return input.creditLimit - owed;
}
