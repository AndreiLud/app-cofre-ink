// Whether a part printed on an invoice is a part already written.
//
// The second invoice of a plan prints its next part, and read in as a purchase it doubled the
// plan, or left a loose line beside it. A part belongs to a plan of the same account with as
// many parts, whose part of that number is of the same amount, to the cent the division can
// differ by, on the invoice the file is. The name only decides between two: the bank says
// MAGAZINELUIZA for what somebody wrote down as "Geladeira".

import type { ExistingRecord } from "./pipeline.ts";
import type { InstallmentMark } from "./recognise/index.ts";
import { refundKey } from "./refunds.ts";

export type PartMatch =
	/** The same part, on this invoice: it is already here. */
	| { kind: "same"; record: ExistingRecord }
	/** The same part, on another invoice: here, and on the wrong invoice. */
	| { kind: "elsewhere"; record: ExistingRecord }
	/** Only the amount answers: it may be the same, and the person says. */
	| { kind: "looksSame"; record: ExistingRecord }
	/** Nothing written is this plan: the parts from this one on are new. */
	| { kind: "new" };

/** Within a cent: the division of a plan gives the extra cents to the first parts. */
function sameAmount(left: number, right: number): boolean {
	return Math.abs(Math.abs(left) - Math.abs(right)) <= 1;
}

/** How many words two names share, to choose between plans that both answer. */
function likeness(left: string, right: string): number {
	const words = new Set(refundKey(left).split(" "));
	return refundKey(right)
		.split(" ")
		.filter((word) => word.length > 2 && words.has(word)).length;
}

export function matchPart(
	line: { amount: number; description: string; installment: InstallmentMark },
	existing: readonly ExistingRecord[],
	invoiceMonth: string | null,
): PartMatch {
	const { number, count } = line.installment;
	const best = (records: ExistingRecord[]) =>
		[...records].sort(
			(left, right) =>
				likeness(right.description, line.description) -
				likeness(left.description, line.description),
		)[0];

	const parts = existing.filter(
		(record) =>
			record.kind === "expense" &&
			record.installment?.count === count &&
			record.installment.number === number &&
			sameAmount(record.amount, line.amount),
	);
	const here = parts.filter(
		(record) => invoiceMonth === null || record.invoiceMonth === invoiceMonth,
	);
	const same = best(here);
	if (same) return { kind: "same", record: same };

	// A plan typed from the middle: as many parts as are left, the first on this invoice.
	const typed = best(
		existing.filter(
			(record) =>
				record.kind === "expense" &&
				record.installment?.count === count - number + 1 &&
				record.installment.number === 1 &&
				(invoiceMonth === null || record.invoiceMonth === invoiceMonth) &&
				sameAmount(record.amount, line.amount),
		),
	);
	if (typed) return { kind: "same", record: typed };

	const elsewhere = best(parts);
	if (elsewhere) return { kind: "elsewhere", record: elsewhere };

	const looks = best(
		existing.filter(
			(record) =>
				record.kind === "expense" &&
				sameAmount(record.amount, line.amount) &&
				(invoiceMonth === null || record.invoiceMonth === invoiceMonth),
		),
	);
	if (looks) return { kind: "looksSame", record: looks };
	return { kind: "new" };
}
