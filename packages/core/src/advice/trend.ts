// Whether it is getting better.
//
// Every other file here reads one moment: what shape the money is in today, what is
// wrong today, what to do from today. None of them answers the question somebody asks
// themselves after three months of trying, which is whether any of it worked.
//
// So this compares two windows of the same length, the three closed months just gone
// against the three before them, and says which way each number went. Nothing is scored
// and nothing is congratulated: a number moved, and the direction it moved in is stated.
//
// The balance is the interesting one and the only one that cannot simply be read: the
// records hold what somebody has now, not what they had in June. So it is walked
// backwards through every movement of the accounts they spend from, which is why the
// snapshot carries those movements and not only what came in and what went out. A
// transfer into an investment is not spending, and a balance reconstructed without it
// would say a household saved less than it did.

import { median } from "../plan/projection.ts";
import type { CalendarMonth } from "../time/calendar.ts";
import type { Snapshot } from "./findings.ts";

export type MovementCode =
	/** What came in, in an ordinary month of each window. */
	| "income"
	/** What went out. */
	| "expense"
	/** The difference, which is what an ordinary month kept. */
	| "kept"
	/** Money on hand, then and now. This one is a balance and not a monthly figure. */
	| "onHand";

export type Movement = {
	code: MovementCode;
	before: number;
	now: number;
	/** Now minus before, so a fall is negative whatever the code means. */
	difference: number;
	/** True when a bigger number is the better one. */
	wantMore: boolean;
	/** Which way it went, once the noise floor has had its say. */
	direction: "better" | "worse" | "same";
};

export type Trend = {
	/** How many closed months are on each side of the comparison. */
	months: number;
	/** The first month of the recent window, which is what the sentence says "since". */
	since: CalendarMonth;
	movements: Movement[];
	/** Months of cover then and now, in tenths, measured with the same ordinary month. */
	coverBefore: number;
	coverNow: number;
};

/** Three each side. Fewer is one month with an opinion, more is last year deciding today. */
const WINDOW = 3;

/** Under this, a difference is not a direction. Fifty units of currency. */
const NOISE = 5_000;

function directionOf(difference: number, wantMore: boolean): Movement["direction"] {
	if (Math.abs(difference) < NOISE) return "same";
	return difference > 0 === wantMore ? "better" : "worse";
}

function movement(code: MovementCode, before: number, now: number, wantMore: boolean): Movement {
	const difference = now - before;
	return { code, before, now, difference, wantMore, direction: directionOf(difference, wantMore) };
}

/**
 * The two windows compared, or null when there are not six closed months to compare.
 *
 * Six is not a preference. Three months is the least that makes a median mean anything,
 * and this needs two of them: with five, one window is a habit and the other is a
 * rumour.
 */
export function trendOf(snapshot: Snapshot): Trend | null {
	if (snapshot.before.length < WINDOW * 2) return null;

	// `before` is most recent first, so the first three are the window just gone.
	const recent = snapshot.before.slice(0, WINDOW);
	const earlier = snapshot.before.slice(WINDOW, WINDOW * 2);

	const incomeNow = median(recent.map((month) => month.income));
	const incomeBefore = median(earlier.map((month) => month.income));
	const expenseNow = median(recent.map((month) => month.expense));
	const expenseBefore = median(earlier.map((month) => month.expense));

	// Walking the balance back to where the recent window opened: every movement of the
	// accounts they spend from, since that month, undone.
	const since = recent[recent.length - 1]?.month ?? snapshot.thisMonth.month;
	const moved = snapshot.netByMonth
		.filter((entry) => entry.month >= since)
		.reduce((total, entry) => total + entry.net, 0);
	const onHandBefore = snapshot.onHand - moved;

	// Both sides are measured against the same ordinary month, so that what moved is the
	// balance and not the yardstick. Saying a reserve grew because spending fell would
	// be true of the ratio and false of the money.
	const usual = median(snapshot.before.map((month) => month.expense));
	const cover = (amount: number) => (usual <= 0 ? 0 : Math.round((amount / usual) * 10));

	return {
		months: WINDOW,
		since,
		movements: [
			movement("income", incomeBefore, incomeNow, true),
			movement("expense", expenseBefore, expenseNow, false),
			movement("kept", incomeBefore - expenseBefore, incomeNow - expenseNow, true),
			movement("onHand", onHandBefore, snapshot.onHand, true),
		],
		coverBefore: cover(onHandBefore),
		coverNow: cover(snapshot.onHand),
	};
}
