// The lines a bank prints for an invoice split into parts, or paid with another card.
//
// Written in the application, a split invoice is a part and what it costs on each invoice after
// it, and a payment with another card is the same on the card that paid. The bank prints them
// as "Parcelamento de fatura 2/6", "Encargos de parcelamento" and "IOF de financiamento", or as
// a charge on the card that paid. Read in as purchases, they counted the same money twice.

import type { ExistingRecord } from "./pipeline.ts";
import { fold, saysWord } from "./text.ts";

/** What a bank calls the lines of an arrangement. */
const WORDS = [
	"parcelamento de fatura",
	"parcelamento fatura",
	"parcelamento da fatura",
	"encargos de parcelamento",
	"encargos do parcelamento",
	"juros de parcelamento",
	"juros do parcelamento",
	"iof de financiamento",
	"iof financiamento",
	"iof do parcelamento",
];

export function looksLikeArrangement(description: string): boolean {
	const folded = fold(description);
	return WORDS.some((word) => saysWord(folded, word));
}

/** One part of an arrangement charged on an invoice: what it pays, and what it costs. */
type Part = { principal: number; cost: number };

/**
 * The parts of every arrangement charged on an invoice of the card: a transfer out of the card
 * whose origin is that invoice, and the cost of the same plan and number on it.
 */
function partsOn(existing: readonly ExistingRecord[], invoiceMonth: string): Part[] {
	const principals = existing.filter(
		(record) =>
			record.kind === "transfer" &&
			record.originInvoiceMonth === invoiceMonth &&
			record.installment !== null &&
			record.installment !== undefined,
	);
	return principals.map((principal) => {
		const cost = existing.find(
			(record) =>
				record.kind === "expense" &&
				record.installment?.group === principal.installment?.group &&
				record.installment?.number === principal.installment?.number &&
				record.invoiceMonth === invoiceMonth,
		);
		return { principal: Math.abs(principal.amount), cost: cost ? Math.abs(cost.amount) : 0 };
	});
}

/** Within a cent for every line added, which is how a division leaves them. */
function near(left: number, right: number, lines = 1): boolean {
	return Math.abs(left - right) <= lines;
}

/**
 * Which lines of an invoice are an arrangement already written, and which look like one that is
 * not. A line is already here when it is what a part pays, what it costs, or both; the lines
 * that look like an arrangement and are left are here too when together they are what the
 * parts cost, as a bank that prints the charges and the tax apart does. What looks like one
 * and is not written goes to the screens that write it.
 */
export function matchArrangements(
	lines: readonly { amount: number; description: string }[],
	existing: readonly ExistingRecord[],
	invoiceMonth: string | null,
): Map<number, "here" | "elsewhere"> {
	const found = new Map<number, "here" | "elsewhere">();
	if (invoiceMonth === null) return found;
	const parts = partsOn(existing, invoiceMonth);
	/** What of each part a line already answered: what it pays, what it costs. */
	const used = parts.map(() => ({ principal: false, cost: false }));

	lines.forEach((line, index) => {
		const amount = Math.abs(line.amount);
		for (const [place, part] of parts.entries()) {
			const state = used[place];
			if (!state) continue;
			if (!state.principal && near(part.principal, amount)) {
				state.principal = true;
			} else if (!state.principal && !state.cost && near(part.principal + part.cost, amount)) {
				state.principal = true;
				state.cost = true;
			} else if (!state.cost && part.cost > 0 && near(part.cost, amount)) {
				state.cost = true;
			} else {
				continue;
			}
			found.set(index, "here");
			return;
		}
	});

	const left = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line, index }) => !found.has(index) && looksLikeArrangement(line.description));
	const costsLeft = parts
		.map((part, place) => (used[place]?.cost ? 0 : part.cost))
		.reduce((sum, cost) => sum + cost, 0);
	const together = left.reduce((sum, { line }) => sum + Math.abs(line.amount), 0);
	const allHere = left.length > 0 && costsLeft > 0 && near(together, costsLeft, left.length);
	for (const { index } of left) found.set(index, allHere ? "here" : "elsewhere");
	return found;
}
