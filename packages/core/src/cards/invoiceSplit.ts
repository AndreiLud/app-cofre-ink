// What an invoice costs when it is not paid at once: split into parts, or paid with another
// card in parts.
//
// The bank names the parts and the app works out the rest. What was owed is the principal,
// spread over the parts the way every instalment here is spread (the leftover cents on the
// first ones), and whatever the bank charges beyond it is the cost, part by part, which is
// the one thing in the whole arrangement that is spending.

import { MoneyError } from "../money/money.ts";
import { MAX_INSTALLMENTS } from "./installments.ts";

export type InvoiceSplitInput = {
	/** What is still owed on the invoice on the day of the arrangement. */
	owed: number;
	/** Paid at once, out of an account, before the parts. Nothing when there is none. */
	entry: number;
	/** How many parts the bank splits the rest into. */
	parts: number;
	/** The figure the bank gave: each part, or all of them together. */
	amount: number;
	/** Whether `amount` is one part, rather than all of them. */
	eachPart: boolean;
};

export type InvoiceSplit = {
	/** What each part pays of what was owed, the leftover cents on the first parts. */
	principal: number[];
	/** What each part costs beyond it, which is the bank's part less the principal. */
	cost: number[];
	/** What the parts charge, each. */
	each: number[];
	/** What was owed and not paid as the entry, which the parts pay. */
	financed: number;
	/** What is paid beyond what was owed, in all. */
	totalCost: number;
};

export class InvoiceSplitError extends MoneyError {}

/** Spreads a total over parts, the leftover cents on the first ones. */
function spread(total: number, parts: number): number[] {
	const base = Math.floor(total / parts);
	const leftover = total - base * parts;
	return Array.from({ length: parts }, (_unused, index) => base + (index < leftover ? 1 : 0));
}

/**
 * The parts of an invoice paid over time.
 *
 * Refused when the entry is more than what is owed, and when the parts and the entry together
 * pay less than what is owed: a bank never offers that, so it is a figure typed wrong. A cost
 * of nothing is accepted, because some cards split an invoice without interest.
 */
export function invoiceSplit(input: InvoiceSplitInput): InvoiceSplit {
	for (const [name, value] of [
		["owed", input.owed],
		["entry", input.entry],
		["amount", input.amount],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new InvoiceSplitError(`${name} is a whole number of minor units, never negative`);
		}
	}
	if (!Number.isInteger(input.parts) || input.parts < 1 || input.parts > MAX_INSTALLMENTS) {
		throw new InvoiceSplitError(`the parts are a whole number from 1 to ${MAX_INSTALLMENTS}`);
	}
	if (input.owed <= 0) {
		throw new InvoiceSplitError("there is nothing owed on this invoice to split");
	}
	if (input.entry > input.owed) {
		throw new InvoiceSplitError("the entry is more than what is owed");
	}

	const financed = input.owed - input.entry;
	const each = input.eachPart
		? Array.from({ length: input.parts }, () => input.amount)
		: spread(input.amount, input.parts);
	const charged = each.reduce((total, part) => total + part, 0);
	if (charged < financed) {
		throw new InvoiceSplitError("the parts and the entry pay less than what is owed");
	}

	const principal = spread(financed, input.parts);
	const cost = each.map((part, index) => part - (principal[index] ?? 0));
	// The cost of one part is never below nothing: a bank whose parts are uneven puts the
	// leftover on the first ones, as the principal does, so both lean the same way.
	if (cost.some((part) => part < 0)) {
		throw new InvoiceSplitError("a part pays less than its share of what is owed");
	}
	return { principal, cost, each, financed, totalCost: charged - financed };
}
