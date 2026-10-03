// What falls due, said once.
//
// Four places asked it and each answered it differently. The check up read records written
// as promises and nothing else, so a card invoice, which is the bill most households have,
// was never in what falls due; with nothing due and the cards netted off the money it still
// said that one bill of R$ 0,00 was more than there was. The overview listed the invoices
// and its own idea of the records. The plan asked how much was due with no window at all.
// And the notices read the records of the next days, card purchases included, as bills.
//
// So there is one function, here, read by the overview, the findings, the sign, the plan
// and the notices (decision 14 of 2.0.0).
//
// 1. A record is a bill when it is money out still to come: a fact dated after today, or a
//    promise from before 1.1.0, which is late once its day has gone. Not a purchase already
//    on an invoice of a card with a cycle, because the invoice is the bill; not a lunch on a
//    benefit card, which the allowance pays; never a move between accounts, and so never the
//    payment of an invoice dated ahead: until its day the bill is the invoice, which says
//    that a payment is waiting.
// 2. An invoice is a bill on its due day for what is left on it. One whose due day has gone
//    is late and counted, however old, because an old bill is still a bill. One holding a
//    purchase in another currency with no rate has no honest total and is set apart.
// 3. What is short is what falls due, the late included, less what can be spent today. The
//    cards are not taken off the money: the invoice is already among the bills.

import type { CalendarDate, CalendarMonth } from "../time/calendar.ts";
import { addDays, compareCalendarDates, daysBetween } from "../time/calendar.ts";

/** How many days ahead "soon" is, everywhere it is said. */
export const SOON_DAYS = 15;

/** A record that may be a bill, said in what the rule needs to know about it. */
export type DueRecord = {
	description: string;
	/** In minor units of the currency of the space, as a positive number. */
	amount: number;
	day: CalendarDate;
	kind: "expense" | "income" | "transfer";
	status: "settled" | "planned";
	invoiceMonth: string | null;
	/** On a credit card that has a closing day and a due day, whose invoice holds what it marks. */
	onCardWithCycle: boolean;
	onBenefitCard: boolean;
};

/** One invoice of a card, as the invoices read it. */
export type DueInvoice = {
	/** The name of the card, which is what a sentence calls the bill. */
	card: string;
	accountId: string;
	month: CalendarMonth;
	dueOn: CalendarDate;
	/** What is still to pay, in minor units. */
	left: number;
	/** Purchases in another currency with no rate, which leave the total without an honest figure. */
	withoutRate: number;
	/** What is marked to pay it on a day still to come, and that day, and what it is. */
	scheduled: number;
	scheduledOn: CalendarDate | null;
	scheduledBy: "parts" | "card" | null;
};

export type Bill<R extends DueRecord = DueRecord, I extends DueInvoice = DueInvoice> = {
	kind: "record" | "invoice";
	/** What a sentence names: the description of a record, or the card of an invoice. */
	subject: string;
	amount: number;
	dueOn: CalendarDate;
	/** Days until it falls due, from today: nought today, negative once it has gone. */
	days: number;
	late: boolean;
	/** What is waiting to pay it on a day still to come: money, a split, or another card. */
	scheduledOn: CalendarDate | null;
	scheduledBy: "money" | "parts" | "card" | null;
	record: R | null;
	invoice: I | null;
};

export type BillsFallingDue<R extends DueRecord = DueRecord, I extends DueInvoice = DueInvoice> = {
	/** Due from today to the last day of the window, soonest first. */
	coming: Bill<R, I>[];
	/** Past their day and still owed, oldest first. Counted. */
	late: Bill<R, I>[];
	/** Invoices with no honest figure, which are said and not added. */
	uncounted: Bill<R, I>[];
	/** What the coming and the late add up to. */
	total: number;
	count: number;
	/** What falls due less what can be spent today, never below nothing. */
	short: number;
	/** The bill a sentence names: the oldest of the late, or else the largest. */
	naming: Bill<R, I> | null;
};

/** Whether a record is a bill at all, before any day is looked at. */
function isABill(record: DueRecord): boolean {
	if (record.kind !== "expense") return false;
	if (record.onBenefitCard) return false;
	// On an invoice already, which is the bill. A purchase on a card with no cycle, or one
	// that lost its invoice, has no invoice to stand for it and is a bill of its own.
	if (record.invoiceMonth !== null && record.onCardWithCycle) return false;
	return true;
}

/**
 * Everything that falls due from today to the end of the window, with what is late and what
 * cannot be added, against what can be spent today.
 */
export function billsFallingDue<R extends DueRecord, I extends DueInvoice>(input: {
	today: CalendarDate;
	/** The last day of the window, inclusive. Fifteen days from today when left out. */
	until?: CalendarDate;
	records: readonly R[];
	invoices: readonly I[];
	/** What can be spent today, the cards not taken off. */
	spendable: number;
}): BillsFallingDue<R, I> {
	const until = input.until ?? addDays(input.today, SOON_DAYS);
	const coming: Bill<R, I>[] = [];
	const late: Bill<R, I>[] = [];
	const uncounted: Bill<R, I>[] = [];
	const inWindow = (day: CalendarDate) => compareCalendarDates(day, until) <= 0;
	const before = (day: CalendarDate) => compareCalendarDates(day, input.today) < 0;

	for (const record of input.records) {
		if (!isABill(record)) continue;
		// A fact whose day has come is in the balance already.
		if (record.status === "settled" && !compareAfter(record.day, input.today)) continue;
		const bill: Bill<R, I> = {
			kind: "record",
			subject: record.description,
			amount: Math.abs(record.amount),
			dueOn: record.day,
			days: daysBetween(input.today, record.day),
			late: record.status === "planned" && before(record.day),
			scheduledOn: null,
			scheduledBy: null,
			record,
			invoice: null,
		};
		if (bill.late) late.push(bill);
		else if (inWindow(record.day)) coming.push(bill);
	}

	for (const invoice of input.invoices) {
		if (invoice.left <= 0) continue;
		const bill: Bill<R, I> = {
			kind: "invoice",
			subject: invoice.card,
			amount: invoice.left,
			dueOn: invoice.dueOn,
			days: daysBetween(input.today, invoice.dueOn),
			late: before(invoice.dueOn),
			scheduledOn: invoice.scheduled > 0 ? invoice.scheduledOn : null,
			scheduledBy: invoice.scheduled > 0 ? (invoice.scheduledBy ?? "money") : null,
			record: null,
			invoice,
		};
		if (!bill.late && !inWindow(invoice.dueOn)) continue;
		if (invoice.withoutRate > 0) uncounted.push(bill);
		else if (bill.late) late.push(bill);
		else coming.push(bill);
	}

	const byDay = (one: Bill<R, I>, other: Bill<R, I>) =>
		compareCalendarDates(one.dueOn, other.dueOn);
	coming.sort(byDay);
	late.sort(byDay);
	uncounted.sort(byDay);

	const counted = [...late, ...coming];
	const total = counted.reduce((sum, bill) => sum + bill.amount, 0);
	const largest = [...coming].sort((one, other) => other.amount - one.amount)[0] ?? null;
	return {
		coming,
		late,
		uncounted,
		total,
		count: counted.length,
		short: Math.max(0, total - input.spendable),
		naming: late[0] ?? largest,
	};
}

function compareAfter(day: CalendarDate, today: CalendarDate): boolean {
	return compareCalendarDates(day, today) > 0;
}
