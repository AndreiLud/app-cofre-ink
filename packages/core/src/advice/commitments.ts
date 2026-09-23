// The card, and the months it has already spent.
//
// A card invoice is the one bill most households cannot predict, because it is not a
// price anybody agreed to: it is the sum of a month of small decisions, and it arrives
// after all of them have been made. Two things about it are worth saying and neither is
// on any other screen.
//
// The first is what an ordinary invoice is, as a share of what comes in, and whether the
// newest one is above it. The second matters more here than almost anywhere: what has
// already been bought in instalments, month by month, out into the future. Somebody with
// eight months of instalments has spent eight months of their own surplus before those
// months arrived, and nothing in the product said so.
//
// There is no invented line about what share of an income a card ought to be, because
// there is no honest one. What is flagged instead is derived and not decided here: a
// month ahead whose instalments are already more than an ordinary month leaves over is a
// month that is spent before it starts.

import { median } from "../plan/projection.ts";
import type { CalendarMonth } from "../time/calendar.ts";
import type { Snapshot } from "./findings.ts";

export type MonthAhead = {
	month: CalendarMonth;
	amount: number;
	/** Already more than an ordinary month leaves over, before that month has begun. */
	overSurplus: boolean;
};

export type Commitments = {
	/** An ordinary invoice: the middle one of the closed invoices in the window. */
	usual: number;
	/** The newest closed invoice, which is the one they have just been asked for. */
	latest: number;
	/** An ordinary invoice, as hundredths of what comes in in an ordinary month. */
	shareOfIncome: number;
	/** Where the newest one sits against the ordinary one, outside a band of noise. */
	direction: "rising" | "steady" | "falling";
	/** What is already bought, month by month, out into the future. */
	ahead: MonthAhead[];
	aheadTotal: number;
	/** The last month something already bought lands in. */
	lastMonth: CalendarMonth | null;
	/** How many months ahead are already spent past what a month leaves over. */
	tight: number;
};

/**
 * How far off the usual an invoice has to be before it is a direction rather than a
 * month. A card moves a little every month by its nature.
 */
const BAND = 0.1;

function share(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole;
}

/**
 * What the card takes, and what it has already taken from the months ahead.
 *
 * Null when there is no card story at all: no closed invoice behind and nothing bought
 * in instalments ahead. A household that pays for everything once does not need a panel
 * telling them so.
 */
export function commitmentsFrom(snapshot: Snapshot): Commitments | null {
	if (snapshot.invoices.length === 0 && snapshot.instalments.length === 0) return null;

	const usualIncome = median(snapshot.before.map((month) => month.income));
	const usualExpense = median(snapshot.before.map((month) => month.expense));
	const surplus = usualIncome - usualExpense;

	const closed = snapshot.invoices.map((invoice) => invoice.amount);
	const usual = median(closed);
	const latest = closed[0] ?? 0;

	const direction =
		usual <= 0 || Math.abs(latest - usual) <= usual * BAND
			? "steady"
			: latest > usual
				? "rising"
				: "falling";

	// A month is tight when what is already bought takes more than a month leaves over.
	// With nothing left over, anything already bought is more than nothing, which is the
	// true and useful reading.
	const ahead = snapshot.instalments.map((month) => ({
		month: month.month,
		amount: month.amount,
		overSurplus: month.amount > Math.max(0, surplus),
	}));

	return {
		usual,
		latest,
		shareOfIncome: Math.round(share(usual, usualIncome) * 100),
		direction,
		ahead,
		aheadTotal: ahead.reduce((total, month) => total + month.amount, 0),
		lastMonth: ahead[ahead.length - 1]?.month ?? null,
		tight: ahead.filter((month) => month.overSurplus).length,
	};
}
