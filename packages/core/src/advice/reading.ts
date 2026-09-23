// The four numbers somebody would ask for first, and one sentence about the state of
// the money.
//
// The findings next door say what happened this month. This says what shape the
// household is in, which is a different question and the one somebody actually wants
// answered before reading a list. Four signs, each of them a ratio between two figures
// the person can see on another screen, each with a line drawn where it is drawn and
// the line written down here rather than felt.
//
// Everything in this file obeys the same three rules the findings obey:
//
// 1. It can be recomputed by hand from the figures it carries.
// 2. It reads the household's own records and nothing else.
// 3. It ends in a number, never in an opinion about what anybody ought to want.
//
// Deliberately not here, and not anywhere in this package: what to buy, which fund to
// hold, when to enter a market. This reads arithmetic out loud. Telling somebody where
// to put their money is a different job, done by people who are licensed to do it, and
// a program that guesses at it while sounding certain is worse than one that does not
// try.

import { median } from "../plan/projection.ts";
import { type CalendarDate, daysBetween } from "../time/calendar.ts";
import {
	type Finding,
	findEverything,
	RESERVE_MONTHS,
	type Snapshot,
	THIN_SAVING,
} from "./findings.ts";
import { type Levers, leversIn, type Plan, planFrom } from "./plan.ts";

export type SignCode =
	/** What is left over each month, as a share of what comes in. */
	| "savingRate"
	/** Money on hand, measured in months of ordinary spending. */
	| "reserve"
	/** What falls due in the next days, against what is on hand to pay it with. */
	| "committed"
	/** What repeats every month, as a share of an ordinary month. */
	| "repeatingLoad";

/** Unknown is not a failure: it is a household with fewer than three months behind it. */
export type SignState = "good" | "fair" | "poor" | "unknown";

export type VitalSign = {
	code: SignCode;
	state: SignState;
	/**
	 * The reading, in the unit the code implies: hundredths for a share, tenths of a
	 * month for the reserve. Nothing here carries a fraction.
	 */
	value: number;
	/** The line between fair and good, in the same unit. */
	target: number;
	/** True when a bigger number is the better one, so a table can be drawn from this. */
	wantMore: boolean;
	/** The figures the reading was made from, in minor units unless the name says not. */
	amounts: Record<string, number>;
};

export type Verdict =
	/** At least one sign is poor. */
	| "tight"
	/** Nothing is poor and something is not yet good. */
	| "steady"
	/** Every sign that can be read is good. */
	| "comfortable"
	/** Nothing can be read yet, which takes three months of records. */
	| "tooSoon";

export type Reading = {
	today: CalendarDate;
	verdict: Verdict;
	/** How many months behind this was read from, which is what makes it trustworthy. */
	monthsRead: number;
	signs: VitalSign[];
	findings: Finding[];
	/** What to do, in order, with a month on each step. */
	plan: Plan;
	/** Where an ordinary month goes, and what their own quietest month in each was. */
	levers: Levers;
};

/** Left over, as hundredths of what came in. Under the second one is worth saying. */
export const SAVING_GOOD = 20;
export const SAVING_FAIR = Math.round(THIN_SAVING * 100);

/** Months of ordinary spending the money on hand covers, in tenths. */
export const RESERVE_GOOD = RESERVE_MONTHS * 10;
export const RESERVE_FAIR = 10;

/** What falls due soon, as hundredths of what is on hand. Lower is better here. */
export const COMMITTED_GOOD = 50;
export const COMMITTED_FAIR = 100;

/**
 * What repeats, as hundredths of what comes in. Lower is better here too.
 *
 * Against what comes in, and not against what goes out. Measured against spending it
 * would read close to a hundred for any tidy household, because rent, power and the
 * shop are most of an ordinary month and all three of them repeat: the sign would then
 * be poor for somebody who is doing fine, which is the most expensive mistake a screen
 * like this can make. Against income it says something worth knowing, which is how much
 * of the month is already decided before anybody decides anything.
 */
export const REPEATING_GOOD = 50;
export const REPEATING_FAIR = 70;

/** Three months is where a median stops being one month with an opinion. */
const ENOUGH_MONTHS = 3;

/** Something has to happen this often to be a thing that repeats. */
const REPEATS = 3;

/** What falls due inside this many days is what is about to be asked for. */
const SOON = 15;

function share(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole;
}

function percent(value: number): number {
	return Math.round(value * 100);
}

/** Higher is better: good at or above the first line, fair at or above the second. */
function rising(value: number, good: number, fair: number): SignState {
	if (value >= good) return "good";
	if (value >= fair) return "fair";
	return "poor";
}

/** Lower is better: good at or under the first line, fair at or under the second. */
function falling(value: number, good: number, fair: number): SignState {
	if (value <= good) return "good";
	if (value <= fair) return "fair";
	return "poor";
}

const UNKNOWN = { state: "unknown" as const, value: 0 };

/**
 * The four signs, always all four, in the order somebody would ask for them.
 *
 * A sign nobody can read yet says so instead of being left out. A row missing from a
 * table is a row somebody wonders about, and "not enough months yet" is a useful thing
 * to be told on the day you start.
 */
export function vitalSigns(snapshot: Snapshot): VitalSign[] {
	const usualExpense = median(snapshot.before.map((month) => month.expense));
	const usualIncome = median(snapshot.before.map((month) => month.income));
	const enough = snapshot.before.length >= ENOUGH_MONTHS;

	const signs: VitalSign[] = [];

	// 1. What is left over each month.
	const left = usualIncome - usualExpense;
	const rate = percent(share(left, usualIncome));
	signs.push({
		code: "savingRate",
		wantMore: true,
		target: SAVING_FAIR,
		...(enough && usualIncome > 0
			? { state: rising(rate, SAVING_GOOD, SAVING_FAIR), value: rate }
			: UNKNOWN),
		amounts: {
			income: usualIncome,
			expense: usualExpense,
			left,
			wanted: Math.round(usualIncome * (SAVING_FAIR / 100)),
			missing: Math.max(0, Math.round(usualIncome * (SAVING_FAIR / 100)) - left),
		},
	});

	// 2. How long the money on hand would last at the usual rate of spending.
	const covers = Math.round(share(snapshot.onHand, usualExpense) * 10);
	const wanted = usualExpense * RESERVE_MONTHS;
	signs.push({
		code: "reserve",
		wantMore: true,
		target: RESERVE_GOOD,
		...(enough && usualExpense > 0
			? { state: rising(covers, RESERVE_GOOD, RESERVE_FAIR), value: covers }
			: UNKNOWN),
		amounts: {
			onHand: snapshot.onHand,
			usualExpense,
			wanted,
			missing: Math.max(0, wanted - snapshot.onHand),
			everyMonth: Math.max(0, Math.ceil((wanted - snapshot.onHand) / 12)),
		},
	});

	// 3. What is about to be asked for, against what is there to pay it with. This one
	//    needs no history at all: a bill due on Friday is due on Friday in week one.
	const due = snapshot.pending
		.filter((charge) => daysBetween(snapshot.today, charge.dueOn) <= SOON)
		.reduce((total, charge) => total + charge.amount, 0);
	const committed = percent(share(due, snapshot.onHand));
	signs.push({
		code: "committed",
		wantMore: false,
		target: COMMITTED_GOOD,
		// Owing something with nothing to pay it from is the worst reading there is, and
		// a share of zero would otherwise round it into the best one.
		...(due > 0 && snapshot.onHand <= 0
			? { state: "poor" as const, value: committed }
			: { state: falling(committed, COMMITTED_GOOD, COMMITTED_FAIR), value: committed }),
		amounts: {
			due,
			onHand: snapshot.onHand,
			short: Math.max(0, due - snapshot.onHand),
			days: SOON,
			count: snapshot.pending.filter((charge) => daysBetween(snapshot.today, charge.dueOn) <= SOON)
				.length,
		},
	});

	// 4. How much of an ordinary month is spoken for before anybody decides anything.
	const repeating = snapshot.repeating.filter((charge) => charge.occurrences >= REPEATS);
	const everyMonth = repeating.reduce((total, charge) => total + charge.amount, 0);
	const load = percent(share(everyMonth, usualIncome));
	signs.push({
		code: "repeatingLoad",
		wantMore: false,
		target: REPEATING_GOOD,
		...(enough && usualIncome > 0
			? { state: falling(load, REPEATING_GOOD, REPEATING_FAIR), value: load }
			: UNKNOWN),
		amounts: {
			everyMonth,
			everyYear: everyMonth * 12,
			count: repeating.length,
			income: usualIncome,
		},
	});

	return signs;
}

/**
 * One word for the state of the money, and the rule that produces it is the whole of
 * it. Nothing is weighted, because a weight is an opinion wearing arithmetic.
 *
 * A problem is said out loud whenever it can be seen, including in week one: nothing on
 * hand and a bill due on Friday is tight on any day of any month. Saying that all is
 * well is held to a higher bar, and needs every sign readable, which takes three months
 * of records. A household nobody can see yet is told that, and not that it is fine.
 */
export function verdictFrom(signs: readonly VitalSign[]): Verdict {
	const known = signs.filter((sign) => sign.state !== "unknown");
	if (known.some((sign) => sign.state === "poor")) return "tight";
	if (known.length < signs.length) return "tooSoon";
	if (known.every((sign) => sign.state === "good")) return "comfortable";
	return "steady";
}

/**
 * The whole reading: the state of things, the four signs, everything found, what to do
 * about it in order, and where the month goes.
 *
 * One function over one snapshot, so that every figure on the screen was read from the
 * same set of records at the same moment. Two calls could disagree by a day.
 */
export function readingOf(snapshot: Snapshot): Reading {
	const signs = vitalSigns(snapshot);
	return {
		today: snapshot.today,
		verdict: verdictFrom(signs),
		monthsRead: snapshot.before.length,
		signs,
		findings: findEverything(snapshot),
		plan: planFrom(snapshot),
		levers: leversIn(snapshot),
	};
}
