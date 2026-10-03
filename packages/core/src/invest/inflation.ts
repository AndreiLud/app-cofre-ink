// What prices did over the last year, from the monthly IPCA.
//
// Twelve months that follow one another, compounded. The twelve newest held were multiplied
// whatever they were, so a year with a month missing from the table was a year of thirteen
// months, and the check up said a number for inflation that no year had.

/** A month and its rate, in hundredths of a percent: one per cent is 100. */
export type MonthRate = { month: string; rate: number };

function monthIndex(month: string): number {
	return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

/**
 * The twelve newest months held, when they follow one another, compounded, in hundredths of a
 * percent; nothing when there are fewer or one is missing.
 */
export function inflationOverAYear(
	points: readonly MonthRate[],
): { percent: number; months: number } | null {
	const newest = [...points]
		.sort((left, right) => monthIndex(right.month) - monthIndex(left.month))
		.slice(0, 12);
	if (newest.length < 12) return null;
	for (let index = 1; index < newest.length; index += 1) {
		const before = newest[index - 1] as MonthRate;
		const after = newest[index] as MonthRate;
		if (monthIndex(before.month) - monthIndex(after.month) !== 1) return null;
	}
	const factor = newest.reduce((total, point) => total * (1 + point.rate / 10_000), 1);
	return { percent: Math.round((factor - 1) * 10_000), months: 12 };
}
