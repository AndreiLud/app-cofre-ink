// What the next months look like.
//
// A projection is not a prediction. It is an arithmetic sum of three things a person
// can point at, kept apart on purpose so that the number on the screen can always be
// taken to pieces:
//
// 1. What is already written down for that month. A planned bill is not a guess.
// 2. What a rule says will happen. A subscription that repeats every month on the
//    tenth will happen on the tenth, and the rule is in the database.
// 3. The rest, which is the habit: the groceries, the fuel, the small things nobody
//    writes down in advance. That one is estimated from what actually happened in the
//    months behind, and it is the only part that can be wrong.
//
// Nothing here smooths, weights or learns. A median of the recent months is used rather
// than an average, because one holiday should not become a monthly expense, and because
// a number somebody can recompute in their head is a number they can argue with.

import { addMonthsToMonth, type CalendarMonth } from "../time/calendar.ts";

export type ProjectionSource = {
	/** Records already written for that month, planned or settled. */
	written: number;
	/** What the recurring rules say, beyond what is already written for them. */
	recurring: number;
	/** The habit, estimated from the months behind. */
	habitual: number;
};

export type ProjectedMonth = {
	month: CalendarMonth;
	income: number;
	expense: number;
	/** Income less expense, for that month alone. */
	left: number;
	/** What the balance reaches at the end of the month. */
	balance: number;
	incomeFrom: ProjectionSource;
	expenseFrom: ProjectionSource;
};

export type MonthlyAmounts = {
	month: CalendarMonth;
	income: number;
	expense: number;
};

export type ProjectionInput = {
	/** Where the money stands today, in minor units. */
	opening: number;
	from: CalendarMonth;
	/** One to thirty six. Beyond that the habit is fiction. */
	months: number;
	/** Records already written, month by month, positive amounts. */
	written: readonly MonthlyAmounts[];
	/** What the recurring rules add on top of what is written, month by month. */
	recurring: readonly MonthlyAmounts[];
	/** What happened in the months behind, for the habit. Most recent last. */
	history: readonly MonthlyAmounts[];
	/**
	 * How many months of history to look at. Six is enough to see a habit and short
	 * enough that last year is not still deciding this month.
	 */
	window?: number;
};

/**
 * The middle value, which is what "usually" means.
 *
 * An average is moved by one unusual month, and there is always one unusual month: a
 * holiday, a tyre, a year of insurance paid at once. The median is not moved by it, and
 * that is the whole reason it is here.
 */
export function median(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((one, other) => one - other);
	const middle = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function amountsOf(list: readonly MonthlyAmounts[], month: CalendarMonth): MonthlyAmounts {
	return list.find((entry) => entry.month === month) ?? { month, income: 0, expense: 0 };
}

/**
 * The months ahead, each one made of the three things above.
 *
 * The habit is the same number every month, because a habit that changed every month
 * would be a forecast, and forecasting somebody's groceries from six data points is
 * arithmetic pretending to be knowledge.
 */
export function project(input: ProjectionInput): ProjectedMonth[] {
	const months = Math.max(1, Math.min(Math.floor(input.months), 36));
	const window = Math.max(1, Math.min(input.window ?? 6, 24));
	const recent = input.history.slice(-window);

	const habitualIncome = median(recent.map((entry) => entry.income));
	const habitualExpense = median(recent.map((entry) => entry.expense));

	const projected: ProjectedMonth[] = [];
	let balance = input.opening;

	for (let index = 0; index < months; index += 1) {
		const month = addMonthsToMonth(input.from, index);
		const here = amountsOf(input.written, month);
		const rule = amountsOf(input.recurring, month);

		// The habit is what is left of a usual month once the things that are already
		// known about it are taken out. Without this, a month with the rent written down
		// would count the rent twice: once as itself and once inside the habit.
		const incomeFrom: ProjectionSource = {
			written: here.income,
			recurring: rule.income,
			habitual: Math.max(0, habitualIncome - here.income - rule.income),
		};
		const expenseFrom: ProjectionSource = {
			written: here.expense,
			recurring: rule.expense,
			habitual: Math.max(0, habitualExpense - here.expense - rule.expense),
		};

		const income = incomeFrom.written + incomeFrom.recurring + incomeFrom.habitual;
		const expense = expenseFrom.written + expenseFrom.recurring + expenseFrom.habitual;

		balance += income - expense;
		projected.push({
			month,
			income,
			expense,
			left: income - expense,
			balance,
			incomeFrom,
			expenseFrom,
		});
	}

	return projected;
}

export type AdjustmentKind = "income" | "expense";

/**
 * A change somebody wants to try out.
 *
 * Either a proportion of what is already there, for questions like "what if groceries
 * came down a tenth", or an amount, for questions like "what if I pay three hundred
 * more a month". Both, when both are given.
 */
export type Adjustment = {
	kind: AdjustmentKind;
	/** Hundredths of a percent, so a tenth is 1000. Negative takes away. */
	percent?: number;
	/** Minor units, added every month it applies to. */
	amount?: number;
	/** The first month it applies to. Left out, it applies from the start. */
	from?: CalendarMonth | null;
	/** The last month it applies to. Left out, it applies to the end. */
	to?: CalendarMonth | null;
};

export type Scenario = {
	name: string;
	adjustments: readonly Adjustment[];
};

function applies(adjustment: Adjustment, month: CalendarMonth): boolean {
	if (adjustment.from && month < adjustment.from) return false;
	if (adjustment.to && month > adjustment.to) return false;
	return true;
}

/**
 * The same months, with the adjustments applied.
 *
 * The opening balance is carried through again rather than patched, so the balance of
 * every month after a change is the balance that change produces, which is the only
 * number anybody is really asking about.
 */
export function applyScenario(
	projected: readonly ProjectedMonth[],
	scenario: Scenario,
	opening: number,
): ProjectedMonth[] {
	let balance = opening;

	return projected.map((month) => {
		let income = month.income;
		let expense = month.expense;

		for (const adjustment of scenario.adjustments) {
			if (!applies(adjustment, month.month)) continue;

			const percent = adjustment.percent ?? 0;
			const amount = adjustment.amount ?? 0;

			if (adjustment.kind === "income") {
				income = Math.max(0, income + Math.round((income * percent) / 10_000) + amount);
			} else {
				expense = Math.max(0, expense + Math.round((expense * percent) / 10_000) + amount);
			}
		}

		balance += income - expense;
		return { ...month, income, expense, left: income - expense, balance };
	});
}

/** The first month the balance goes below zero, when it does. */
export function firstShortfall(projected: readonly ProjectedMonth[]): CalendarMonth | null {
	return projected.find((month) => month.balance < 0)?.month ?? null;
}
