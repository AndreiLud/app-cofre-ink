// What a holding that follows an index is worth on a day, worked out from the days the Banco
// Central published.
//
// A caixinha, a CDB, an LCI or an LCA that follow the CDI earn a share of the daily CDI (series
// 12) on every day it was published; one at a fixed rate earns (1 + the rate a year) to the
// power of one over 252 on the same days; the Tesouro Selic grows from the last price typed by
// the daily Selic (series 11); a poupança earns, on its anniversary, the rate published for the
// month that ends there (series 195). The days that count are the ones the series published,
// which is what a business day is here.
//
// The conventions, written down because each of them moves a cent:
//
// 1. A deposit earns the rate of the day it was made, and a withdrawal takes its money away
//    before that day's rate.
// 2. A value typed from a statement is the value at the end of its day: the estimate starts
//    again from it and grows from the next day published.
// 3. "Calculated through the thirtieth" includes the rate of the thirtieth.
// 4. The factor is carried without rounding, and the value becomes cents once, at the end. The
//    interest of the projections rounds every month and is not a precedent for this.
// 5. It stops on the day the holding matures, and never goes past the last day kept.

import { addDays, type CalendarDate, compareCalendarDates } from "../time/calendar.ts";

/**
 * A rate published for a day, in hundred millionths of a percentage point: 0,050788% is
 * 5078800. For the poupança the day is the first of the month the rate is for.
 */
export type IndexDay = { day: CalendarDate; rate: number };

/** Hundred millionths of a percentage point in one whole: 1 is 100% is 10000000000. */
const RATE_SCALE = 10_000_000_000;

/** Hundredths of a percentage point in one whole: 100% of the CDI is 10000. */
const HOLDING_RATE_SCALE = 10_000;

/** Money in, positive, or out, negative, on a day, in minor units. */
export type HoldingMovement = { day: CalendarDate; amount: number };

export type EstimateInput = {
	indexer: "cdi" | "prefixed" | "selic" | "savings";
	/**
	 * The rate on the holding, in hundredths of a percentage point: the share of the CDI (100% is
	 * 10000) or the fixed rate a year (12% is 1200). Not read for the Selic or the poupança.
	 */
	rate: number;
	/** The last value typed and its day, which the estimate starts again from. Null: nothing. */
	from: { day: CalendarDate; value: number } | null;
	/** What went in and came out, in any order. Only what is after `from` is read. */
	moves: readonly HoldingMovement[];
	/** The day it is asked about. */
	until: CalendarDate;
	maturesOn?: CalendarDate | null;
	/** The day of the month a poupança is credited on. */
	anniversaryDay?: number | null;
	/** The series the indexer reads. */
	days: readonly IndexDay[];
};

export type Estimate = {
	/** Minor units. */
	value: number;
	/** The last day whose rate is in the value, or the day of the value typed, or nothing. */
	through: CalendarDate | null;
};

const before = (left: CalendarDate, right: CalendarDate) => compareCalendarDates(left, right) < 0;
const atMost = (left: CalendarDate, right: CalendarDate) => compareCalendarDates(left, right) <= 0;

/** The same day of the month before, kept inside the month. */
function monthBefore(day: CalendarDate, dayOfMonth: number): CalendarDate {
	const year = Number(day.slice(0, 4));
	const month = Number(day.slice(5, 7));
	const previousYear = month === 1 ? year - 1 : year;
	const previousMonth = month === 1 ? 12 : month - 1;
	const last = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
	const dayThere = Math.min(dayOfMonth, last);
	return `${previousYear}-${String(previousMonth).padStart(2, "0")}-${String(dayThere).padStart(2, "0")}`;
}

/** The anniversaries of a day of the month inside a stretch of days, both ends included. */
function anniversariesBetween(
	dayOfMonth: number,
	after: CalendarDate | null,
	until: CalendarDate,
): CalendarDate[] {
	const found: CalendarDate[] = [];
	const startYear = after ? Number(after.slice(0, 4)) : Number(until.slice(0, 4)) - 1;
	const startMonth = after ? Number(after.slice(5, 7)) : 1;
	for (let year = startYear, month = startMonth; ; ) {
		const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const day = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dayOfMonth, last)).padStart(2, "0")}`;
		if (!atMost(day, until)) break;
		if (after === null || before(after, day)) found.push(day);
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
		if (found.length > 1200) break;
	}
	return found;
}

/** What a holding that follows an index is worth on a day, and through which day it is known. */
export function estimateByIndex(input: EstimateInput): Estimate {
	const end =
		input.maturesOn && before(input.maturesOn, input.until) ? input.maturesOn : input.until;
	const start = input.from?.day ?? null;
	const moves = input.moves
		.filter((move) => start === null || before(start, move.day))
		.filter((move) => atMost(move.day, input.until))
		.slice()
		.sort((left, right) => compareCalendarDates(left.day, right.day));

	let balance = input.from?.value ?? 0;
	let through: CalendarDate | null = start;
	let next = 0;
	const takeMovesUpTo = (day: CalendarDate) => {
		while (next < moves.length && atMost((moves[next] as HoldingMovement).day, day)) {
			balance += (moves[next] as HoldingMovement).amount;
			next += 1;
		}
	};

	if (input.indexer === "savings") {
		const dayOfMonth = input.anniversaryDay ?? 1;
		const rateOf = new Map(input.days.map((one) => [one.day, one.rate]));
		// From the value typed, or from the day before the first money went in.
		const first = moves[0];
		const after = start ?? (first ? addDays(first.day, -1) : null);
		for (const anniversary of anniversariesBetween(dayOfMonth, after, end)) {
			// What arrived before the anniversary is credited on it; what arrives on it, after.
			while (next < moves.length && before((moves[next] as HoldingMovement).day, anniversary)) {
				balance += (moves[next] as HoldingMovement).amount;
				next += 1;
			}
			if (balance === 0) continue;
			const rate = rateOf.get(monthBefore(anniversary, dayOfMonth));
			if (rate === undefined) break;
			balance *= 1 + rate / RATE_SCALE;
			through = anniversary;
		}
		takeMovesUpTo(input.until);
		return { value: Math.round(balance), through };
	}

	const days = input.days
		.filter((one) => (start === null || before(start, one.day)) && atMost(one.day, end))
		.slice()
		.sort((left, right) => compareCalendarDates(left.day, right.day));
	for (const one of days) {
		takeMovesUpTo(one.day);
		const factor =
			input.indexer === "prefixed"
				? (1 + input.rate / HOLDING_RATE_SCALE) ** (1 / 252)
				: input.indexer === "selic"
					? 1 + one.rate / RATE_SCALE
					: 1 + (one.rate / RATE_SCALE) * (input.rate / HOLDING_RATE_SCALE);
		balance *= factor;
		through = one.day;
	}
	// What went in after the last day published is there, and has earned nothing yet.
	takeMovesUpTo(input.until);
	return { value: Math.round(balance), through };
}
