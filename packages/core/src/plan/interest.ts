// Money that grows, and the question everybody is really asking.
//
// Three calculations, all of them in minor units and all of them rounded the same way:
// once, at the end of each month, because that is when a bank does it too and because
// compounding a fraction of a cent for thirty years produces a number nobody can
// reconcile against a statement.
//
// The rate is given as a yearly one and turned into a monthly one properly, by the
// twelfth root, not by dividing by twelve. Dividing by twelve is wrong by a few percent
// a year, which over twenty years is a car.

/** A yearly rate in hundredths of a percent: ten per cent a year is 1000. */
export type Rate = number;

export function monthlyFactorOf(yearly: Rate): number {
	return (1 + yearly / 10_000) ** (1 / 12);
}

export type GrowthInput = {
	/** What is there at the start, in minor units. */
	initial: number;
	/** What goes in at the end of every month, in minor units. */
	monthly: number;
	yearly: Rate;
	months: number;
};

export type GrowthMonth = {
	month: number;
	/** What is in it at the end of the month. */
	total: number;
	/** What has been put in, by then. */
	contributed: number;
	/** What the growth alone has added, by then. */
	earned: number;
};

/**
 * Beyond this, a number stops being exact, and an amount of money that is not exact is
 * not an amount of money. A rate somebody typed to see what happens can get here, and
 * when it does the answer stops rather than turning into something that only looks like
 * a number.
 */
const CEILING = Number.MAX_SAFE_INTEGER;

function capped(value: number): number {
	return Number.isFinite(value) ? Math.min(Math.round(value), CEILING) : CEILING;
}

/**
 * Month by month, because the shape of the curve is the point.
 *
 * A single figure at the end tells somebody how much they would have. The months tell
 * them when the growth starts to outrun what they are putting in, which is the moment
 * that makes people keep going.
 */
export function grow(input: GrowthInput): GrowthMonth[] {
	const months = Math.max(0, Math.min(Math.floor(input.months), 1200));
	const factor = monthlyFactorOf(input.yearly);

	const result: GrowthMonth[] = [];
	let total = capped(input.initial);
	let contributed = capped(input.initial);

	for (let month = 1; month <= months; month += 1) {
		total = capped(total * factor + Math.round(input.monthly));
		contributed = capped(contributed + Math.round(input.monthly));
		result.push({ month, total, contributed, earned: Math.max(0, total - contributed) });
	}

	return result;
}

/** What it adds up to, for whoever only wants the end of the story. */
export function futureValue(input: GrowthInput): number {
	const months = grow(input);
	return months[months.length - 1]?.total ?? Math.round(input.initial);
}

export type ReachInput = GrowthInput & { target: number };

/**
 * How many months until the money reaches an amount, or nothing when it never does.
 *
 * Nothing is a real answer here: putting aside less than the amount is eaten by
 * inflation, or aiming at a number with no contributions and no rate, never arrives.
 * A screen that says "never at this rate" is more useful than one that says 1200.
 */
export function monthsToReach(input: ReachInput): number | null {
	if (input.initial >= input.target) return 0;

	const factor = monthlyFactorOf(input.yearly);
	let total = capped(input.initial);

	for (let month = 1; month <= 1200; month += 1) {
		const next = capped(total * factor + Math.round(input.monthly));
		// Standing still, or going backwards, never arrives.
		if (next <= total) return null;
		total = next;
		if (total >= input.target) return month;
	}

	return null;
}

export type IndependenceInput = {
	/** What a month costs, in minor units. */
	monthlyExpense: number;
	/**
	 * How much of the pile can be taken out each year without it shrinking, in
	 * hundredths of a percent. Four per cent is 400, and is the number most of the
	 * literature argues about.
	 */
	withdrawalRate: Rate;
};

/**
 * The pile that pays for the months without working.
 *
 * It is a division, and it is the whole of what "financial independence" means
 * arithmetically: a year of spending, divided by the share of the pile that a year may
 * safely take. Everything else about the idea is argument, and this number is the part
 * that is not.
 */
export function independenceTarget(input: IndependenceInput): number {
	if (input.withdrawalRate <= 0) return 0;
	return Math.round((input.monthlyExpense * 12 * 10_000) / input.withdrawalRate);
}

export type IndependenceProgress = {
	target: number;
	/** Zero to one hundred, for the bar on the screen. */
	percent: number;
	/** Months at the current pace, or nothing when the pace does not get there. */
	months: number | null;
	/** What the pile pays for today, in months, with no growth at all. */
	monthsCovered: number;
};

export function independence(
	input: IndependenceInput & { saved: number; monthly: number; yearly: Rate },
): IndependenceProgress {
	const target = independenceTarget(input);

	return {
		target,
		percent: target === 0 ? 0 : Math.min(100, Math.round((input.saved / target) * 100)),
		months: monthsToReach({
			initial: input.saved,
			monthly: input.monthly,
			yearly: input.yearly,
			months: 1200,
			target,
		}),
		monthsCovered: input.monthlyExpense <= 0 ? 0 : Math.floor(input.saved / input.monthlyExpense),
	};
}

/**
 * What a rate did to an amount over a set of monthly rates.
 *
 * This is how an investment is compared with an index: the same money, put in on the
 * same days, growing at what the index actually did. The rates are the ones the central
 * bank published, in hundredths of a percent, one per month.
 */
export function growAtRates(
	initial: number,
	monthlyRates: readonly number[],
	monthly = 0,
): number[] {
	let total = capped(initial);
	const totals: number[] = [];

	for (const rate of monthlyRates) {
		total = capped(total * (1 + rate / 10_000) + Math.round(monthly));
		totals.push(total);
	}

	return totals;
}
