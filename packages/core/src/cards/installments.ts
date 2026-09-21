// Splitting a purchase into installments.
//
// Two things have to be exact: the parts add up to the purchase, to the cent, and each
// part lands on the invoice it will really be charged on.

import type { Money } from "../money/money.ts";
import { MoneyError } from "../money/money.ts";
import { allocateInstallments } from "../money/split.ts";
import {
	addMonths,
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
} from "../time/calendar.ts";
import { type CardCycle, invoiceMonthOf } from "./invoice.ts";

export type Installment = {
	number: number;
	count: number;
	happenedOn: CalendarDate;
	amount: Money;
	/** Present when the purchase went on a credit card. */
	invoiceMonth?: CalendarMonth;
};

export type PlanInstallmentsInput = {
	total: Money;
	count: number;
	purchasedOn: CalendarDate;
	/** Given when the purchase went on a card, so each part knows its invoice. */
	cycle?: CardCycle;
};

/**
 * Every installment carries the same day of the month as the purchase, moved forward,
 * and the leftover cents go to the earliest ones, which is what card issuers do.
 */
export function planInstallments(input: PlanInstallmentsInput): Installment[] {
	if (!Number.isInteger(input.count) || input.count < 1 || input.count > 420) {
		throw new MoneyError(`the number of installments has to be between 1 and 420`);
	}

	const parts = allocateInstallments(input.total, input.count);
	const firstInvoice = input.cycle ? invoiceMonthOf(input.purchasedOn, input.cycle) : undefined;

	return parts.map((amount, index) => {
		const installment: Installment = {
			number: index + 1,
			count: input.count,
			happenedOn: addMonths(input.purchasedOn, index),
			amount,
		};
		if (firstInvoice) installment.invoiceMonth = addMonthsToMonth(firstInvoice, index);
		return installment;
	});
}
