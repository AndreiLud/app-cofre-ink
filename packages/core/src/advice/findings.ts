// What the numbers are trying to say.
//
// Everything here is arithmetic over records the person wrote down, and every finding
// carries the numbers it was made from. There is no model, no score out of ten and no
// opinion about what anybody ought to want. A finding is allowed to exist only when it
// passes three tests:
//
// 1. It can be recomputed by hand from the figures it carries.
// 2. It says something the person cannot see by looking at one screen.
// 3. It ends in something to do, or it is not worth a line on a screen.
//
// Deliberately not here: anything about what to buy, which fund to hold or where to put
// money. This reads a household's own spending and says what it found. Telling somebody
// what to invest in is a different job, done by people who are licensed to do it.
//
// The words are chosen by the interface, from the code of each finding. This file
// produces codes and numbers, so that the same finding reads in Portuguese, in English
// and in a table.

import {
	type BillsFallingDue,
	billsFallingDue,
	type DueInvoice,
	type DueRecord,
	SOON_DAYS,
} from "../cards/whatFallsDue.ts";
import { WORTH_SAYING } from "../money/money.ts";
import { median } from "../plan/projection.ts";
import {
	type CalendarDate,
	daysBetween,
	MONTH_MOSTLY_GONE,
	monthOf,
	shareOfMonthGone,
} from "../time/calendar.ts";

export type FindingWeight = "problem" | "attention" | "good";

export type FindingCode =
	/** More went out than came in, this month. */
	| "spentMoreThanEarned"
	/** One category is well above its usual month. */
	| "categoryAboveUsual"
	/** One category is well below its usual month. */
	| "categoryBelowUsual"
	/** A budget line is past its limit. */
	| "budgetPassed"
	/** A budget line is being spent faster than the month is passing. */
	| "budgetPace"
	/** What repeats every month, added up. */
	| "subscriptionLoad"
	/** Something that repeats costs more than it did. */
	| "subscriptionRose"
	/** Two records that look like the same charge twice. */
	| "chargedTwice"
	/** Money on hand, less what the cards owe, measured in months of ordinary spending. */
	| "thinReserve"
	/** The cards owe more than the accounts hold, so there is no reserve to measure yet. */
	| "cardsOverAccounts"
	/** An invoice with a purchase in another currency and no rate, left out of what is due. */
	| "invoiceUncounted"
	/** What is left over each month, as a share of what came in. */
	| "lowSavingRate"
	/** The card is going to ask for more than there is. */
	| "invoiceOverBalance"
	/** What falls due soon is more than what is here. */
	| "duesOverBalance"
	/** A goal that has not moved. */
	| "goalStalled"
	/** Rather more on hand than the next months need. */
	| "idleCash"
	/** A month that went better than usual. */
	| "betterThanUsual";

export type Finding = {
	code: FindingCode;
	weight: FindingWeight;
	/**
	 * What the finding is about, when it is about one thing: a category, an account, a
	 * goal, a description. The interface puts it in the sentence.
	 */
	subject: string | null;
	/**
	 * The figures the sentence is built from, in minor units unless the name says
	 * otherwise. Every one of them is on a screen somewhere else too.
	 */
	amounts: Record<string, number>;
	/**
	 * How much this is worth saying, in minor units of money at stake. It is what the
	 * order on the screen is made of, and it is never a made up score.
	 */
	atStake: number;
	/** The invoice it is about, when it is about one, which is where the screen sends somebody. */
	invoice?: { accountId: string; month: string };
};

export type MonthlyTotals = {
	month: string;
	income: number;
	expense: number;
};

export type CategorySpending = {
	categoryId: string;
	name: string;
	/** What went out in the month being looked at. */
	thisMonth: number;
	/** The same category in each of the months behind, most recent first. */
	before: readonly number[];
};

export type BudgetLine = {
	categoryId: string;
	name: string;
	limit: number;
	spent: number;
};

export type GoalLine = {
	goalId: string;
	name: string;
	target: number;
	saved: number;
	/** Last time anything was put into it, or null when nothing ever was. */
	lastAddedOn: CalendarDate | null;
	/** The day it was set up, which is what a goal nobody has fed yet is measured from. */
	createdOn: CalendarDate | null;
	/** When it is meant to be reached, or null when no date was set. */
	dueOn: CalendarDate | null;
};

export type RepeatingCharge = {
	/** What it is called on the statement, already tidied by the rules. */
	description: string;
	/** What it costs each time it happens. */
	amount: number;
	/** What it cost the time before, when there was one. */
	previousAmount: number | null;
	/** How many times it has happened. Two is a coincidence, three is a habit. */
	occurrences: number;
};

export type ChargePair = {
	description: string;
	amount: number;
	first: CalendarDate;
	second: CalendarDate;
	account: string;
};

/** A month of something, for the series the reading reads: invoices, instalments, moves. */
export type MonthlyAmount = {
	month: string;
	amount: number;
};

export type Snapshot = {
	/** The day the reading is made on, which decides how much of the month is left. */
	today: CalendarDate;
	/**
	 * What the accounts somebody spends from hold: current, savings and cash. Not "VocÃª tem",
	 * which counts what is invested too, and not less what the cards owe, which is the reserve.
	 *
	 * Nothing when the reading may not say it: somebody who sees only their own records, whose
	 * balance is made of their own rows, or accounts in more than one currency, which add up to
	 * no single amount. Every finding about money is then left out.
	 */
	money: number | null;
	/** What the cards owe, as a positive number, when the money is said. */
	owedOnCards: number | null;
	/** The records that may fall due, which `billsFallingDue` sorts. */
	bills: readonly DueRecord[];
	/** Every invoice of every card that is open or still owed. */
	cardInvoices: readonly DueInvoice[];
	/**
	 * What is in holdings that can be taken out the same day, a caixinha, money left at the
	 * broker, a poupanÃ§a. Said beside the reserve, never counted in it (part 2, H.10.3).
	 */
	availableAnyDay: number;
	/** The month being looked at, and the months behind it, most recent first. */
	thisMonth: MonthlyTotals;
	before: readonly MonthlyTotals[];
	categories: readonly CategorySpending[];
	budgets: readonly BudgetLine[];
	goals: readonly GoalLine[];
	repeating: readonly RepeatingCharge[];
	/** Pairs that already look like the same charge twice. */
	possibleRepeats: readonly ChargePair[];
	/**
	 * What the accounts somebody spends from moved, per month, most recent first.
	 *
	 * The records hold what they have now, never what they had in June, so a balance
	 * from before is this walked backwards. It counts transfers as well as spending,
	 * because money moved into an investment left the balance without being spent.
	 */
	netByMonth: readonly { month: string; net: number }[];
	/** Card invoices that have closed, most recent first. */
	invoices: readonly MonthlyAmount[];
	/** What instalments already bought take out of each month ahead, soonest first. */
	instalments: readonly MonthlyAmount[];
	/** What came in, by where it came from and in which month. One row per pair. */
	incomeSources: readonly { name: string; month: string; amount: number }[];
	/**
	 * The closed months of the last year and a half, most recent first.
	 *
	 * A bill that comes once a year cannot be seen in six months of records, so the one
	 * question about the year ahead reads a longer window than everything else. The
	 * medians the rest of this package is made of still use `before`, deliberately:
	 * last year should not decide what an ordinary month is today.
	 */
	longer: readonly MonthlyTotals[];
	/** What prices did over the last twelve published months, in hundredths of a percent. */
	inflation: { percent: number; months: number } | null;
};

/** A category has to be this much above its usual month before anybody is told. */
const ABOVE_USUAL = 1.3;
const BELOW_USUAL = 0.7;

/** Months of ordinary spending that a reserve is expected to cover. */
export const RESERVE_MONTHS = 3;

/**
 * Under this share of what came in, what is left over is worth saying out loud. It is
 * exported because two other files draw the same line, and a line drawn twice is a line
 * that moves once.
 */
export const THIN_SAVING = 0.1;

/** A goal nobody has touched for this long has stopped. */
const STALLED_DAYS = 60;

function share(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole;
}

/**
 * The reserve: what the accounts hold less what the cards owe (decision 14 of 2.0.0, and
 * registry 0042). A purchase on a card is money already gone, and a reserve measured without
 * it looks healthy until the invoice arrives. Nothing when the money is not said.
 */
export function reserveOf(snapshot: Snapshot): number | null {
	if (snapshot.money === null || snapshot.owedOnCards === null) return null;
	return snapshot.money - snapshot.owedOnCards;
}

/** What falls due in the next days, against what can be spent today, by the one rule for it. */
export function duesOf(snapshot: Snapshot): BillsFallingDue {
	return billsFallingDue({
		today: snapshot.today,
		records: snapshot.bills,
		invoices: snapshot.cardInvoices,
		spendable: snapshot.money ?? 0,
	});
}

/** A share as a whole number of hundredths, so nothing carries a fraction. */
function percent(value: number): number {
	return Math.round(value * 100);
}

/**
 * Everything the figures have to say, heaviest first.
 *
 * Order is by what is at stake and nothing else. A budget passed by two hundred comes
 * before one passed by twenty, and a good month comes after both, because somebody
 * reading three lines should read the three that matter.
 */
export function findEverything(snapshot: Snapshot): Finding[] {
	const found = [
		...aboutTheMonth(snapshot),
		...aboutCategories(snapshot),
		...aboutBudgets(snapshot),
		...aboutRepeating(snapshot),
		...aboutWhatIsComing(snapshot),
		...aboutWhatIsSaved(snapshot),
	];

	const order: Record<FindingWeight, number> = { problem: 0, attention: 1, good: 2 };
	return found.sort((left, right) => {
		if (left.weight !== right.weight) return order[left.weight] - order[right.weight];
		return right.atStake - left.atStake;
	});
}

function aboutTheMonth(snapshot: Snapshot): Finding[] {
	const { thisMonth, before } = snapshot;
	const found: Finding[] = [];

	const over = thisMonth.expense - thisMonth.income;
	if (over > WORTH_SAYING && thisMonth.income > 0) {
		found.push({
			code: "spentMoreThanEarned",
			weight: "problem",
			subject: null,
			amounts: {
				income: thisMonth.income,
				expense: thisMonth.expense,
				over,
				percent: percent(share(over, thisMonth.income)),
			},
			atStake: over,
		});
	}

	// The months before this one. On its last day a month counts as closed and is among the months
	// read, and comparing it with a usual month made of itself said R$ 1.553,70 less where the
	// month screen, comparing with July to September, said R$ 1.562,70.
	const behind = before.filter((month) => month.month !== thisMonth.month);
	const usual = median(behind.map((month) => month.expense));
	if (usual > 0 && behind.length >= 3) {
		const saved = usual - thisMonth.expense;
		// Only once the month is far enough along that the comparison means anything.
		// The same comparison the month screen makes, and not a stricter one. Sharing the
		// constant and then comparing differently leaves one day a month, the twenty fourth of
		// a month of thirty, where one screen says the month is far enough along and the other
		// does not.
		if (saved > WORTH_SAYING && shareOfMonthGone(snapshot.today) >= MONTH_MOSTLY_GONE) {
			found.push({
				code: "betterThanUsual",
				weight: "good",
				subject: null,
				amounts: { usual, expense: thisMonth.expense, saved },
				atStake: saved,
			});
		}
	}

	return found;
}

function aboutCategories(snapshot: Snapshot): Finding[] {
	const found: Finding[] = [];

	for (const category of snapshot.categories) {
		// Two months behind is not a habit yet, and comparing against it invents one.
		if (category.before.length < 3) continue;

		const usual = median(category.before);
		if (usual <= 0) continue;

		const difference = category.thisMonth - usual;
		if (difference > WORTH_SAYING && category.thisMonth >= usual * ABOVE_USUAL) {
			found.push({
				code: "categoryAboveUsual",
				weight: "attention",
				subject: category.name,
				amounts: {
					usual,
					thisMonth: category.thisMonth,
					difference,
					percent: percent(share(difference, usual)),
				},
				atStake: difference,
			});
			continue;
		}

		if (-difference > WORTH_SAYING && category.thisMonth <= usual * BELOW_USUAL) {
			found.push({
				code: "categoryBelowUsual",
				weight: "good",
				subject: category.name,
				amounts: {
					usual,
					thisMonth: category.thisMonth,
					difference: -difference,
					percent: percent(share(-difference, usual)),
				},
				atStake: -difference,
			});
		}
	}

	return found;
}

function aboutBudgets(snapshot: Snapshot): Finding[] {
	const found: Finding[] = [];
	const through = shareOfMonthGone(snapshot.today);

	for (const budget of snapshot.budgets) {
		if (budget.limit <= 0) continue;

		if (budget.spent > budget.limit) {
			const over = budget.spent - budget.limit;
			found.push({
				code: "budgetPassed",
				weight: "problem",
				subject: budget.name,
				amounts: { limit: budget.limit, spent: budget.spent, over },
				atStake: over,
			});
			continue;
		}

		// Spending faster than the month is passing, with enough month left for it to
		// matter. Ten per cent of slack, so the last day of a tidy month says nothing.
		const spentShare = share(budget.spent, budget.limit);
		if (through < 0.85 && spentShare > through + 0.1) {
			const atThisRate = Math.round(share(budget.spent, Math.max(through, 0.01)));
			found.push({
				code: "budgetPace",
				weight: "attention",
				subject: budget.name,
				amounts: {
					limit: budget.limit,
					spent: budget.spent,
					atThisRate,
					over: Math.max(0, atThisRate - budget.limit),
					left: budget.limit - budget.spent,
					percent: percent(spentShare),
				},
				atStake: Math.max(0, atThisRate - budget.limit),
			});
		}
	}

	return found;
}

function aboutRepeating(snapshot: Snapshot): Finding[] {
	const found: Finding[] = [];

	// Three or more times is something that repeats. Twice is two purchases.
	const settled = snapshot.repeating.filter((charge) => charge.occurrences >= 3);
	const everyMonth = settled.reduce((total, charge) => total + charge.amount, 0);

	if (everyMonth > WORTH_SAYING) {
		found.push({
			code: "subscriptionLoad",
			weight: "attention",
			subject: null,
			amounts: {
				everyMonth,
				everyYear: everyMonth * 12,
				count: settled.length,
				// What share of an ordinary month is spoken for before anybody decides
				// anything, which is the number that makes this worth reading.
				percent: percent(share(everyMonth, median(snapshot.before.map((one) => one.expense)))),
			},
			atStake: everyMonth * 12,
		});
	}

	for (const charge of snapshot.repeating) {
		if (charge.previousAmount === null || charge.previousAmount <= 0) continue;
		const rise = charge.amount - charge.previousAmount;
		// Five per cent, because a bill that moves with usage is not a price rise.
		if (rise > 0 && rise >= charge.previousAmount * 0.05) {
			found.push({
				code: "subscriptionRose",
				weight: "attention",
				subject: charge.description,
				amounts: {
					was: charge.previousAmount,
					now: charge.amount,
					rise,
					everyYear: rise * 12,
					percent: percent(share(rise, charge.previousAmount)),
				},
				atStake: rise * 12,
			});
		}
	}

	for (const pair of snapshot.possibleRepeats) {
		found.push({
			code: "chargedTwice",
			weight: "attention",
			subject: pair.description,
			amounts: {
				amount: pair.amount,
				days: daysBetween(pair.first, pair.second),
			},
			atStake: pair.amount,
		});
	}

	return found;
}

/**
 * What falls due against what can be spent, said at most once.
 *
 * It said "Uma conta vence nos prÃ³ximos quinze dias, de R$ 0,00" with nothing falling due:
 * nothing checked that anything did, the money had the cards netted off it, and the list of
 * an empty window agreed with every condition. Now nothing is said unless something falls due
 * and the money does not reach it, and then one sentence: about the invoice when it is the only
 * bill, about all of them otherwise, naming the oldest late one or the largest.
 */
/** The card and month of a bill that is an invoice, for the screen to send somebody to. */
function invoiceOf(invoice: DueInvoice | null): Pick<Finding, "invoice"> {
	return invoice ? { invoice: { accountId: invoice.accountId, month: invoice.month } } : {};
}

function aboutWhatIsComing(snapshot: Snapshot): Finding[] {
	const money = snapshot.money;
	if (money === null) return [];
	const found: Finding[] = [];
	const dues = duesOf(snapshot);

	for (const bill of dues.uncounted) {
		found.push({
			code: "invoiceUncounted",
			weight: "attention",
			subject: bill.subject,
			amounts: { amount: bill.amount, days: Math.max(0, bill.days) },
			atStake: bill.amount,
			...invoiceOf(bill.invoice),
		});
	}

	if (dues.count === 0 || dues.short <= 0 || dues.naming === null) return found;

	const naming = dues.naming;
	if (dues.count === 1 && naming.kind === "invoice") {
		found.push({
			code: "invoiceOverBalance",
			weight: "problem",
			subject: naming.subject,
			amounts: {
				amount: naming.amount,
				money,
				short: dues.short,
				days: Math.max(0, naming.days),
				late: naming.late ? 1 : 0,
			},
			atStake: dues.short,
			...invoiceOf(naming.invoice),
		});
		return found;
	}

	found.push({
		code: "duesOverBalance",
		weight: "problem",
		subject: naming.subject,
		amounts: {
			count: dues.count,
			total: dues.total,
			largest: naming.amount,
			money,
			short: dues.short,
			days: SOON_DAYS,
			late: dues.late.length,
			subjectIsInvoice: naming.kind === "invoice" ? 1 : 0,
			namingIsLate: naming.late ? 1 : 0,
		},
		atStake: dues.short,
		...invoiceOf(naming.invoice),
	});
	return found;
}

function aboutWhatIsSaved(snapshot: Snapshot): Finding[] {
	const found: Finding[] = [];
	const usualExpense = median(snapshot.before.map((month) => month.expense));
	const usualIncome = median(snapshot.before.map((month) => month.income));

	// Nothing about money for somebody whose money is not said: a logger, whose balance is made
	// of their own rows, or accounts in more than one currency (part 2, J.6 and J.3.4).
	const reserve = reserveOf(snapshot);
	const money = snapshot.money ?? 0;
	const cards = snapshot.owedOnCards ?? 0;

	if (reserve !== null && usualExpense > 0 && snapshot.before.length >= 3) {
		const covers = reserve / usualExpense;
		const wanted = usualExpense * RESERVE_MONTHS;
		// The holdings that come out the same day, named and never counted (part 2, H.10.3).
		const aside: Record<string, number> =
			snapshot.availableAnyDay > 0 ? { availableAnyDay: snapshot.availableAnyDay } : {};

		if (reserve <= 0) {
			// No reserve to measure in months: "dá para -0,4 mês" is not a sentence. What the
			// cards owe beyond the accounts has to be found before a reserve starts.
			found.push({
				code: "cardsOverAccounts",
				weight: "problem",
				subject: null,
				amounts: { money, cards, short: -reserve, usualExpense, wanted, ...aside },
				atStake: wanted - reserve,
			});
		} else if (covers < RESERVE_MONTHS) {
			const missing = wanted - reserve;
			found.push({
				code: "thinReserve",
				weight: covers < 1 ? "problem" : "attention",
				subject: null,
				amounts: {
					money,
					cards,
					reserve,
					usualExpense,
					wanted,
					missing,
					// Tenths of a month, so half a month is five and not a fraction.
					covers: Math.round(covers * 10),
					// What it takes to get there inside a year, which is the thing to do.
					everyMonth: Math.ceil(missing / 12),
					...aside,
				},
				atStake: missing,
			});
		} else if (reserve > wanted + usualExpense) {
			const spare = reserve - wanted;
			// What a year of sitting still costs it, when the figure for that is known.
			// Still good news, and still a number worth putting next to it: money that is
			// not spent is not therefore unharmed.
			const inflation = snapshot.inflation;
			found.push({
				code: "idleCash",
				weight: "good",
				subject: null,
				amounts: {
					money,
					cards,
					reserve,
					wanted,
					spare,
					covers: Math.round(covers * 10),
					...(inflation === null
						? {}
						: {
								inflation: inflation.percent,
								losing: Math.round((spare * inflation.percent) / 10_000),
							}),
				},
				atStake: spare,
			});
		}
	}

	if (snapshot.money !== null && usualIncome > 0 && snapshot.before.length >= 3) {
		const left = usualIncome - usualExpense;
		const rate = share(left, usualIncome);
		if (rate < THIN_SAVING) {
			const wanted = Math.round(usualIncome * THIN_SAVING);
			found.push({
				code: "lowSavingRate",
				weight: "attention",
				subject: null,
				amounts: {
					income: usualIncome,
					expense: usualExpense,
					left,
					percent: percent(rate),
					wanted,
					missing: Math.max(0, wanted - left),
				},
				atStake: Math.max(0, wanted - left),
			});
		}
	}

	for (const goal of snapshot.goals) {
		if (goal.saved >= goal.target) continue;

		const still = goal.target - goal.saved;

		// From the last time money went in, or from the day it was set up when none ever
		// has. A goal made this morning is not stalled, it is new, and telling somebody
		// their goal has not moved in nought days is the screen talking to itself.
		const since = goal.lastAddedOn ?? goal.createdOn;
		if (since === null) continue;

		const quiet = daysBetween(since, snapshot.today);
		if (quiet < STALLED_DAYS) continue;

		// How much a month it now takes, when there is a date to arrive by.
		const monthsLeft =
			goal.dueOn === null ? 0 : monthsBetween(monthOf(snapshot.today), monthOf(goal.dueOn));
		found.push({
			code: "goalStalled",
			weight: "attention",
			subject: goal.name,
			amounts: {
				target: goal.target,
				saved: goal.saved,
				still,
				months: Math.max(0, monthsLeft),
				everyMonth: monthsLeft > 0 ? Math.ceil(still / monthsLeft) : 0,
				days: quiet,
			},
			atStake: still,
		});
	}

	return found;
}

function monthsBetween(from: string, to: string): number {
	const [fromYear, fromMonth] = from.split("-").map(Number);
	const [toYear, toMonth] = to.split("-").map(Number);
	return ((toYear ?? 0) - (fromYear ?? 0)) * 12 + ((toMonth ?? 0) - (fromMonth ?? 0));
}
