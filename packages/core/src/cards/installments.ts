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

/**
 * The most parts anything here is split into, which is decision 5 of 2.0.0.
 *
 * One ceiling for every door: the form offered 24, the quick entry read up to 99, and the core
 * and the server took 420. A plan written before 2.0.0 with more parts than this still counts
 * and still reads; only writing a new one past it is refused.
 */
export const MAX_INSTALLMENTS = 48;

export type Installment = {
	number: number;
	count: number;
	happenedOn: CalendarDate;
	amount: Money;
	/** Present when the purchase went on a credit card. */
	invoiceMonth?: CalendarMonth;
};

export type PlanInstallmentsInput = {
	/** The whole purchase, every part included, the ones paid before as well. */
	total: Money;
	count: number;
	/** The day of the first part written, which is the purchase unless some were paid before. */
	purchasedOn: CalendarDate;
	/** Given when the purchase went on a card, so each part knows its invoice. */
	cycle?: CardCycle;
	/**
	 * The number of the first part written. One, unless somebody says how many they already
	 * paid before writing the plan down, and then the ones before are not written.
	 */
	firstNumber?: number;
	/**
	 * The invoice of the first part written, when it is known rather than worked out: a
	 * statement says it, or somebody chose it. It wins over the cycle, because the cycle of a
	 * card read on a moved day lands on another invoice: the thirty first of January moved a
	 * month is the twenty eighth of February, the other side of a closing on the thirtieth.
	 */
	firstInvoice?: CalendarMonth;
};

/**
 * Every installment carries the same day of the month as the purchase, moved forward,
 * and the leftover cents go to the earliest ones, which is what card issuers do.
 *
 * From an anchor: the first part written, its day and its invoice. Each next part is one
 * month and one invoice after it, and never the invoice of its own day worked out again.
 */
export function planInstallments(input: PlanInstallmentsInput): Installment[] {
	const first = input.firstNumber ?? 1;
	if (!Number.isInteger(input.count) || input.count < 1 || input.count > 420) {
		throw new MoneyError("the number of installments has to be between 1 and 420");
	}
	if (!Number.isInteger(first) || first < 1 || first > input.count) {
		throw new MoneyError("the first part written is one of the parts of the plan");
	}

	const parts = allocateInstallments(input.total, input.count);
	const firstInvoice =
		input.firstInvoice ??
		(input.cycle ? invoiceMonthOf(input.purchasedOn, input.cycle) : undefined);

	return parts.slice(first - 1).map((amount, offset) => {
		const installment: Installment = {
			number: first + offset,
			count: input.count,
			happenedOn: addMonths(input.purchasedOn, offset),
			amount,
		};
		if (firstInvoice) installment.invoiceMonth = addMonthsToMonth(firstInvoice, offset);
		return installment;
	});
}

/**
 * Where a plan starts when somebody already paid some of it: the next part, a month for each
 * part paid after the purchase, on the invoice of the purchase moved by as many.
 */
export function anchorAfterPaid(input: {
	purchasedOn: CalendarDate;
	paid: number;
	cycle?: CardCycle;
}): { firstNumber: number; day: CalendarDate; invoice?: CalendarMonth } {
	const invoice = input.cycle
		? addMonthsToMonth(invoiceMonthOf(input.purchasedOn, input.cycle), input.paid)
		: undefined;
	return {
		firstNumber: input.paid + 1,
		day: addMonths(input.purchasedOn, input.paid),
		...(invoice ? { invoice } : {}),
	};
}

/**
 * The day of the purchase behind a part printed on an invoice or a statement.
 *
 * A bank prints either the day of the part, inside the days the invoice covers, or the day of
 * the purchase, before them. The part n was charged n less one months after the purchase.
 */
export function purchaseDayOf(input: {
	printedOn: CalendarDate;
	number: number;
	period: { from: CalendarDate; to: CalendarDate } | null;
}): CalendarDate {
	const inside =
		input.period !== null &&
		input.printedOn >= input.period.from &&
		input.printedOn <= input.period.to;
	return inside ? addMonths(input.printedOn, -(input.number - 1)) : input.printedOn;
}

/**
 * The parts a statement still has to write, from the one it prints to the last: each one the
 * amount printed, the part k on the day of the purchase plus k less one months and on the
 * invoice of the statement plus k less n, counted by the number and never by the day.
 */
export function statementParts(input: {
	/** What each part is, in minor units, as a positive number. */
	eachPart: Money;
	number: number;
	count: number;
	purchasedOn: CalendarDate;
	/** The invoice the part printed is on, when the statement is a card's. */
	invoice?: CalendarMonth;
}): Installment[] {
	return planInstallments({
		total: { amount: input.eachPart.amount * input.count, currency: input.eachPart.currency },
		count: input.count,
		purchasedOn: addMonths(input.purchasedOn, input.number - 1),
		firstNumber: input.number,
		...(input.invoice ? { firstInvoice: input.invoice } : {}),
	});
}

export type InstallmentRefusal =
	| "tooManyInstallments"
	| "onlyExpensesGoInInstallments"
	| "benefitIsNotInInstallments"
	| "transfersAreNotSplit"
	| "partBelowOneCent"
	| "firstInstallmentOutsidePlan";

/**
 * Whether a new plan may be written, and why not.
 *
 * Asked by every path that writes one, before anything is written, so a refusal leaves no
 * row behind. Refused rather than cut: a plan of forty nine parts brought down to forty eight
 * would be a purchase that is not the one somebody made. Never asked when a plan is read,
 * edited, restored or carried between devices, because a plan written before 2.0.0 with more
 * parts than the ceiling is a fact and keeps counting.
 */
export function installmentRefusal(input: {
	kind: "income" | "expense" | "transfer";
	accountKind: string;
	count: number;
	/** The whole purchase, in minor units, as a positive number. */
	total: number;
	firstNumber?: number;
}): InstallmentRefusal | null {
	if (input.count <= 1) return null;
	if (input.count > MAX_INSTALLMENTS) return "tooManyInstallments";
	if (input.kind === "transfer") return "transfersAreNotSplit";
	if (input.kind === "income") return "onlyExpensesGoInInstallments";
	if (input.accountKind === "voucher") return "benefitIsNotInInstallments";
	if (Math.abs(input.total) < input.count) return "partBelowOneCent";
	const first = input.firstNumber ?? 1;
	if (!Number.isInteger(first) || first < 1 || first > input.count) {
		return "firstInstallmentOutsidePlan";
	}
	return null;
}
