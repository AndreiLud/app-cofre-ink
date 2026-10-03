// The same move, written twice.
//
// Money moved from the current account into savings shows on two statements: as money out
// of one and as money into the other. Read in from both files, or written down from both
// ends, it is two records, and turning one of them into a move between accounts leaves the
// other counting the same money again. This is the one answer to which record is the other
// half, read by the screen that offers to join the two and by the repository that joins them.

import { daysBetween } from "@cofre/core";
import type { Transaction } from "./models.ts";

/** How far apart the two halves may be dated. A Pix lands the same day, a slip in two. */
export const MIRROR_DAYS = 3;

/**
 * Whether a candidate is the other half of a record about to become a move to or from
 * another account: the opposite kind, the same amount, on that other account, a few days
 * either side, and nothing that freezes it or ties it to a plan.
 */
export function isMirrorOf(
	record: Transaction,
	candidate: Transaction,
	otherAccountId: string,
): boolean {
	if (candidate.id === record.id || candidate.spaceId !== record.spaceId) return false;
	if (candidate.accountId !== otherAccountId) return false;
	const opposite =
		record.kind === "expense" ? "income" : record.kind === "income" ? "expense" : null;
	if (candidate.kind !== opposite) return false;
	if (Math.abs(candidate.amount) !== Math.abs(record.amount)) return false;
	if (Math.abs(daysBetween(record.happenedOn, candidate.happenedOn)) > MIRROR_DAYS) return false;
	if (candidate.reconciledAt !== null) return false;
	if (candidate.installmentGroup !== null || candidate.recurrenceId !== null) return false;
	return true;
}
