// Reading a month back, for somebody who gave it three numbers.
//
// A household that will not keep a ledger types what came in, what went out and what the
// card charged, and registry 0038 says that is a complete answer. The screen then said
// nothing else at all: the three numbers, their difference, and a count of whatever was
// written by hand. So the one thing the numbers are for, which is knowing whether this
// month was a normal one, had no answer anywhere.
//
// Three readings, all pure, all over minor units, none of them holding a word of copy:
// whether the month is unusual, what carried a category, and which limits it is breaking.
//
// None of the three adds up a figure another screen owns, which is the rule registry 0044
// set. The comparison is fed the reports screen's own sum, the limits are fed the budget
// screen's own sum, and the ranking is the one new total: it deliberately leaves out the
// typed totals and names them apart, which is a different question from the one the reports
// screen answers and is the whole reason this exists.

import { WORTH_SAYING } from "../money/money.ts";
import { median } from "../plan/projection.ts";
import {
	type CalendarDate,
	type CalendarMonth,
	MONTH_MOSTLY_GONE,
	monthOf,
	shareOfMonthGone,
} from "../time/calendar.ts";
import { readMonthMark } from "./monthInThree.ts";

/** Fewer than this and there is no usual month, only some months. */
export const MONTHS_FOR_USUAL = 3;

/** And no more than this, because last year should not be deciding about this month. */
export const USUAL_WINDOW = 6;

export type UsualVerdict = "lower" | "higher" | "same" | "tooEarly";

export type AgainstUsual = {
	/** How many closed months the usual one is made of. */
	months: number;
	usualIn: number;
	usualOut: number;
	monthIn: number;
	monthOut: number;
	/** This month less a usual one. Negative means less was spent, or less came in. */
	differenceIn: number;
	differenceOut: number;
	/** Whether the month is far enough along for a verdict to mean anything. */
	comparable: boolean;
	verdict: UsualVerdict;
};

export type MonthAmounts = { month: string; income: number; expense: number };

/**
 * This month against the middle of the closed months before it.
 *
 * The median, because one holiday is not a habit, and the whole list is taken in so the
 * screen decides nothing about which months count.
 *
 * The verdict waits. A month that is three days old has spent almost nothing, and a screen
 * that reads that as thrift tells a household it is winning on the third and leaves it to
 * find out on the thirtieth. So a verdict is stated when the month is over, or when it is
 * the month today falls in and four fifths of it has gone, and otherwise both figures are
 * returned with "tooEarly" against them. That is the one way this reading can do harm.
 *
 * Nothing at all comes back when there are fewer than three closed months, because the
 * middle of two months is not a usual month, and saying so is the honest answer.
 */
export function againstAUsualMonth(input: {
	month: CalendarMonth;
	today: CalendarDate;
	months: readonly MonthAmounts[];
}): AgainstUsual | null {
	const before = input.months
		.filter((one) => one.month < input.month)
		.sort((one, other) => other.month.localeCompare(one.month))
		.slice(0, USUAL_WINDOW);

	if (before.length < MONTHS_FOR_USUAL) return null;

	const here = input.months.find((one) => one.month === input.month);
	const monthIn = here?.income ?? 0;
	const monthOut = here?.expense ?? 0;

	const usualIn = median(before.map((one) => one.income));
	const usualOut = median(before.map((one) => one.expense));

	const now = monthOf(input.today);
	const comparable =
		input.month < now ||
		(input.month === now && shareOfMonthGone(input.today) >= MONTH_MOSTLY_GONE);

	const differenceOut = monthOut - usualOut;
	const verdict: UsualVerdict = !comparable
		? "tooEarly"
		: Math.abs(differenceOut) < WORTH_SAYING
			? "same"
			: differenceOut < 0
				? "lower"
				: "higher";

	return {
		months: before.length,
		usualIn,
		usualOut,
		monthIn,
		monthOut,
		differenceIn: monthIn - usualIn,
		differenceOut,
		comparable,
		verdict,
	};
}

export type TookLine = {
	categoryId: string | null;
	amount: number;
	/**
	 * Of what is itemised, and not of the month.
	 *
	 * What is itemised is every expense that is not one of the three typed totals, including
	 * the money nobody sorted, which has a line of its own. So the shares add up to one over
	 * the lines that are drawn, and the part of the month this reading cannot see is named
	 * separately rather than being a hundredth of anything.
	 */
	share: number;
};

export type WhatTookIt = {
	ranked: TookLine[];
	/** What the ranked lines add up to. */
	sorted: number;
	/** The typed totals, which are spending with no category and no detail. */
	notItemised: number;
};

export type SpendingRow = {
	/**
	 * In the currency of the space, worked out at the rate of the day it was written.
	 *
	 * Never the amount as it was typed. This module shipped summing that one, which is the
	 * same fault this release took out of the card invoice: a month holding a dinner in
	 * dollars and a market in reais came back as a number in no currency at all, and the
	 * screen labelled it with the currency of the space.
	 */
	amountInBase: number;
	kind: string;
	categoryId: string | null;
	externalId: string | null;
};

/**
 * What the month went on, for the records that say.
 *
 * The three typed numbers are deliberately not in the ranking. They carry no category, and
 * a total somebody typed is not a kind of spending: left in, the block would be one line
 * saying that ninety per cent of the month went on nothing in particular, which is the
 * typed total looking at itself. They are returned separately so the screen can say how
 * much of the month this ranking cannot see.
 *
 * Money nobody sorted still gets a line, as it does on the reports screen, because a
 * household that has not sorted half its month should be told that and not have it hidden.
 *
 * The whole list comes back. Which of them fit on a screen is the screen's business.
 */
export function whatTookIt(rows: readonly SpendingRow[]): WhatTookIt {
	const byCategory = new Map<string | null, number>();
	let notItemised = 0;

	for (const row of rows) {
		if (row.kind !== "expense") continue;
		const amount = Math.abs(row.amountInBase);

		if (readMonthMark(row.externalId) !== null) {
			notItemised += amount;
			continue;
		}
		byCategory.set(row.categoryId, (byCategory.get(row.categoryId) ?? 0) + amount);
	}

	const sorted = [...byCategory.values()].reduce((total, amount) => total + amount, 0);
	const ranked = [...byCategory.entries()]
		.map(([categoryId, amount]) => ({
			categoryId,
			amount,
			share: sorted === 0 ? 0 : amount / sorted,
		}))
		.sort(
			(one, other) =>
				other.amount - one.amount || (one.categoryId ?? "").localeCompare(other.categoryId ?? ""),
		);

	return { ranked, sorted, notItemised };
}

export type LeftVerdict = "better" | "worse" | "same" | "tooEarly";

/**
 * What a usual month leaves over, against what this one leaves so far.
 *
 * The overview says the month in one sentence: in a usual month this much is left over, so
 * this one is doing better or worse. A usual month is the middle of what came in less the
 * middle of what went out, the two figures the month screen already compares, so the two
 * screens cannot disagree about what usual is. It waits like the comparison it comes from:
 * before four fifths of the month have gone it gives the usual figure and no verdict.
 */
export function leftAgainstUsual(against: AgainstUsual): {
	usualLeft: number;
	monthLeft: number;
	verdict: LeftVerdict;
} {
	const usualLeft = against.usualIn - against.usualOut;
	const monthLeft = against.monthIn - against.monthOut;
	const difference = monthLeft - usualLeft;
	const verdict: LeftVerdict = !against.comparable
		? "tooEarly"
		: Math.abs(difference) < WORTH_SAYING
			? "same"
			: difference > 0
				? "better"
				: "worse";
	return { usualLeft, monthLeft, verdict };
}

/** A limit this close to its figure is worth saying out loud. Four fifths of it. */
export const LIMIT_CLOSE = 0.8;

export type LimitRisk = {
	budgetId: string;
	limit: number;
	spent: number;
	/** What is left of it. Negative once it is passed. */
	left: number;
	share: number;
	state: "over" | "close";
};

/**
 * Which limits a month is breaking, or about to.
 *
 * Read as a whole month, with no pace and no projection, and that is the decision rather
 * than an omission. Three typed numbers are a claim about the whole of a month: measuring
 * them against how far through the month today is would tell a household on the third that
 * it is spending ten times too fast, when all it did was say what the month cost.
 *
 * A limit of nothing is not a limit and is left out, rather than being a limit everything
 * breaks.
 */
export function limitsNearBreaking(
	lines: readonly { budgetId: string; limit: number; spent: number }[],
): LimitRisk[] {
	const risks: LimitRisk[] = [];

	for (const line of lines) {
		if (line.limit <= 0) continue;
		const share = line.spent / line.limit;
		if (line.spent > line.limit) {
			risks.push({ ...line, left: line.limit - line.spent, share, state: "over" });
			continue;
		}
		if (share >= LIMIT_CLOSE) {
			risks.push({ ...line, left: line.limit - line.spent, share, state: "close" });
		}
	}

	// Broken first, by how far past it went, then the ones closest to breaking.
	return risks.sort((one, other) => {
		if (one.state !== other.state) return one.state === "over" ? -1 : 1;
		if (one.state === "over") return other.spent - other.limit - (one.spent - one.limit);
		return other.share - one.share;
	});
}
