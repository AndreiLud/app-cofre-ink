// Where the money comes from, and what happens if the biggest part of it stops.
//
// Almost every household answers the first question with one word, and there is nothing
// wrong with that: somebody with one job is not doing anything badly. So this does not
// scold, and it does not suggest anybody find a second income. It states a fact and the
// one consequence that follows from it, which is a number they can act on through the
// only lever they actually control: the reserve.
//
// The consequence is a stress test. If the biggest source stopped today, what is on hand
// and whatever else still comes in have to cover an ordinary month, and this says for
// how long. With one source that number is the reserve again, which is the point: the
// reserve stops being a rule of thumb and becomes the answer to a question somebody has
// actually asked themselves at three in the morning.
//
// A source that does not turn up every month is padded with the months it missed, so its
// usual month includes the months it brought nothing. Counting only the months a bit of
// freelance landed would call it reliable income, and reliable is exactly what it is not.

import { median } from "../plan/projection.ts";
import type { Snapshot } from "./findings.ts";

export type IncomeSource = {
	name: string;
	/** An ordinary month from this one, counting the months it brought nothing. */
	usual: number;
	/** Hundredths of an ordinary month's income, all sources together. */
	share: number;
};

export type Exposure = {
	sources: IncomeSource[];
	/** What the biggest one is, as hundredths of everything that comes in. */
	concentration: number;
	/** An ordinary month's income, all sources together. */
	income: number;
	/** What would still come in each month without the biggest source. */
	without: number;
	/**
	 * Months of ordinary spending covered if the biggest source stopped, in tenths.
	 * Null when what is left over already covers an ordinary month on its own.
	 */
	lasts: number | null;
};

/** Three months is where a median stops being one month with an opinion. */
const ENOUGH_MONTHS = 3;

/** How many places money comes from are worth naming. The rest go in as one line. */
const MOST = 4;

/** Under this, a source is a one off rather than somewhere money comes from. */
const NOISE = 5_000;

export function exposureFrom(snapshot: Snapshot): Exposure | null {
	if (snapshot.before.length < ENOUGH_MONTHS) return null;

	const months = snapshot.before.map((month) => month.month);
	const byName = new Map<string, Map<string, number>>();
	for (const row of snapshot.incomeSources) {
		const found = byName.get(row.name) ?? new Map<string, number>();
		found.set(row.month, (found.get(row.month) ?? 0) + row.amount);
		byName.set(row.name, found);
	}

	const sources = [...byName]
		// Padded with the months it brought nothing, which is what makes the median mean
		// "an ordinary month" rather than "an ordinary month when it turned up".
		.map(([name, amounts]) => ({
			name,
			usual: median(months.map((month) => amounts.get(month) ?? 0)),
		}))
		.filter((source) => source.usual > NOISE)
		.sort((left, right) => right.usual - left.usual);

	if (sources.length === 0) return null;

	const income = sources.reduce((total, source) => total + source.usual, 0);
	const biggest = sources[0]?.usual ?? 0;
	const without = income - biggest;

	const usualExpense = median(snapshot.before.map((month) => month.expense));
	const short = usualExpense - without;

	return {
		sources: sources.slice(0, MOST).map((source) => ({
			...source,
			share: income === 0 ? 0 : Math.round((source.usual / income) * 100),
		})),
		concentration: income === 0 ? 0 : Math.round((biggest / income) * 100),
		income,
		without,
		lasts: short <= 0 ? null : Math.round((snapshot.onHand / short) * 10),
	};
}
