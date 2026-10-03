// What the things that happen again come to in a month.
//
// The screen of the series opens with one sentence: every month what repeats takes this much
// and brings this much. A rent is once a month, a gym paid weekly is fifty two times a year,
// and an insurance paid yearly is a twelfth of itself a month, so each is brought to a month
// before they are added. A move between two accounts is neither money in nor money out and is
// not in the sentence.

import type { RecurrenceFrequency } from "./schedule.ts";

/** What a series takes or brings in an average month, in the minor units it is written in. */
export function amountInAMonth(series: {
	frequency: RecurrenceFrequency;
	intervalCount: number;
	amount: number;
}): number {
	const every = Math.max(1, series.intervalCount);
	if (series.frequency === "monthly") return Math.round(series.amount / every);
	if (series.frequency === "yearly") return Math.round(series.amount / (12 * every));
	return Math.round((series.amount * 52) / (12 * every));
}

/** Every month, what the series that are running take out and bring in. */
export function seriesInAMonth(
	series: readonly {
		kind: "income" | "expense" | "transfer";
		frequency: RecurrenceFrequency;
		intervalCount: number;
		amount: number;
	}[],
): { out: number; in: number } {
	let out = 0;
	let into = 0;
	for (const one of series) {
		if (one.kind === "expense") out += amountInAMonth(one);
		if (one.kind === "income") into += amountInAMonth(one);
	}
	return { out, in: into };
}
