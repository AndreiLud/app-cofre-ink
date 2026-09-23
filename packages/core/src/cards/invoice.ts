// The cycle of a credit card.
//
// Two days decide everything: the day the invoice closes and the day it falls due.
// A purchase made before the closing day lands on the invoice closing that month, and
// a purchase made on the closing day or after lands on the next one. That is the rule
// Brazilian issuers use, and it is the one that makes the "best day to buy" true.

import {
	addMonthsToMonth,
	type CalendarDate,
	CalendarError,
	type CalendarMonth,
	dateInMonth,
	formatCalendarMonth,
	parseCalendarDate,
} from "../time/calendar.ts";

export type CardCycle = {
	/** The day the invoice closes, from 1 to 31. */
	closingDay: number;
	/** The day it falls due, from 1 to 31. */
	dueDay: number;
};

export function assertCycle(cycle: CardCycle): void {
	const valid = (day: number) => Number.isInteger(day) && day >= 1 && day <= 31;
	if (!valid(cycle.closingDay) || !valid(cycle.dueDay)) {
		throw new CalendarError("the closing day and the due day are days of the month, from 1 to 31");
	}
}

/**
 * The invoice a purchase belongs to, named by the month it closes in.
 *
 * Buying on the closing day itself goes to the next invoice. Issuers differ by a day
 * here, and this is the choice that never surprises someone by charging earlier than
 * they expected.
 */
export function invoiceMonthOf(date: CalendarDate, cycle: CardCycle): CalendarMonth {
	assertCycle(cycle);
	const { year, month, day } = parseCalendarDate(date);
	const closes = day < cycle.closingDay;
	return closes
		? formatCalendarMonth(year, month)
		: addMonthsToMonth(formatCalendarMonth(year, month), 1);
}

export function invoiceClosingDate(month: CalendarMonth, cycle: CardCycle): CalendarDate {
	assertCycle(cycle);
	return dateInMonth(month, cycle.closingDay);
}

/**
 * When the invoice has to be paid. A due day after the closing day falls in the same
 * month, and a due day before it falls in the next one.
 */
export function invoiceDueDate(month: CalendarMonth, cycle: CardCycle): CalendarDate {
	assertCycle(cycle);
	const target = cycle.dueDay > cycle.closingDay ? month : addMonthsToMonth(month, 1);
	return dateInMonth(target, cycle.dueDay);
}

/** The days a given invoice covers, both ends included. */
export function invoicePeriod(
	month: CalendarMonth,
	cycle: CardCycle,
): { from: CalendarDate; to: CalendarDate } {
	assertCycle(cycle);
	const previous = addMonthsToMonth(month, -1);
	return {
		from: dateInMonth(previous, cycle.closingDay),
		// The closing day belongs to the next invoice, so this one ends the day before.
		to: dateInMonth(month, cycle.closingDay - 1 === 0 ? 31 : cycle.closingDay - 1),
	};
}

/**
 * How many days are left before this purchase has to be paid for. The number behind
 * "buy today and pay in forty days", which is the only reason the closing day matters
 * to a person.
 */
export function daysUntilDue(date: CalendarDate, cycle: CardCycle): number {
	const invoice = invoiceMonthOf(date, cycle);
	const due = invoiceDueDate(invoice, cycle);
	const purchase = parseCalendarDate(date);
	const payment = parseCalendarDate(due);
	return Math.round(
		(Date.UTC(payment.year, payment.month - 1, payment.day) -
			Date.UTC(purchase.year, purchase.month - 1, purchase.day)) /
			86_400_000,
	);
}
