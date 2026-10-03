// A refund and the purchase it takes back.
//
// A bank prints a refund as its own line, "Estorno Loja X", and the purchase it undoes is on the
// same invoice or on one already written. Written as it comes, the month shows a purchase it
// did not keep and a refund as money coming in. Found, the two cancel: in the same file both
// stay out, and a purchase already written is taken out instead of the refund going in.

import type { ExistingRecord } from "./pipeline.ts";
import { fold } from "./text.ts";

/** The words a refund adds to the name of what it takes back, and what an acquirer prefixes. */
const REFUND_WORDS =
	/\b(?:estorno|estornada|estornado|estornos|devolucao|devolvido|reembolso|credito de|refund)\b/g;
const ACQUIRER = /\b(?:mp|pag|ifd)\s*\*\s*/g;

/** The name a purchase and its refund share once the bank's additions are taken off. */
export function refundKey(description: string): string {
	return fold(description)
		.replace(ACQUIRER, " ")
		.replace(REFUND_WORDS, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Only what pairing needs of a line. */
type Line = { happenedOn: string; amount: number; description: string; nature: string };

/**
 * Refunds paired with a purchase of the same file: the same amount, the purchase on the same
 * day or before, the same name. Each purchase pairs once. The answer maps the place of the
 * refund to the place of its purchase.
 */
export function refundsInFile(lines: readonly Line[]): Map<number, number> {
	const pairs = new Map<number, number>();
	const taken = new Set<number>();
	lines.forEach((refund, index) => {
		if (refund.nature !== "credit") return;
		const key = refundKey(refund.description);
		const found = lines.findIndex(
			(purchase, at) =>
				at !== index &&
				!taken.has(at) &&
				purchase.nature !== "credit" &&
				purchase.nature !== "payment" &&
				Math.abs(purchase.amount) === Math.abs(refund.amount) &&
				purchase.happenedOn <= refund.happenedOn &&
				refundKey(purchase.description) === key,
		);
		if (found >= 0) {
			taken.add(found);
			pairs.set(index, found);
		}
	});
	return pairs;
}

/**
 * The purchase already written that a refund takes back: an expense of the same account, the
 * whole amount, on the same day or before, of the same name. A partial refund has none, and is
 * money coming back to the card.
 */
export function refundedPurchase(
	refund: Line,
	existing: readonly ExistingRecord[],
): ExistingRecord | null {
	if (refund.nature !== "credit") return null;
	const key = refundKey(refund.description);
	return (
		existing.find(
			(record) =>
				record.kind === "expense" &&
				record.amount === -Math.abs(refund.amount) &&
				record.happenedOn <= refund.happenedOn &&
				refundKey(record.description) === key,
		) ?? null
	);
}
