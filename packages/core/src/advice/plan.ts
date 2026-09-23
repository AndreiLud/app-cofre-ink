// What to do, in what order, with how much a month and the month it lands in.
//
// The signs next door say what shape a household is in. A shape is not help: somebody
// told their reserve is thin already knew, and what they do not know is how long it
// takes to fix, what it costs a month, and what has to wait while it happens. That is
// arithmetic, and this is it.
//
// Two ideas hold the whole file up.
//
// The first is that a plan is a sequence and not a list. Every step is funded by the
// same money, so each one starts when the one before it finishes, which is why a step
// carries a month and not a wish. A screen that shows five things to save for at once,
// each with its own monthly figure, is describing a household with five incomes.
//
// The second is that the only honest target is one the household has already hit. Where
// this suggests spending less, the number is their own cheapest month in that category,
// never a share invented here and never a figure from somebody else's budget.
//
// Still not here: what to buy, which fund to hold, whether to borrow. The order below is
// an opinion about sequence, which is stated plainly on the screen and in ADR 0030, and
// it is the only opinion in this file.

import { median } from "../plan/projection.ts";
import { addMonthsToMonth, type CalendarMonth, monthOf } from "../time/calendar.ts";
import { RESERVE_MONTHS, type Snapshot, THIN_SAVING } from "./findings.ts";

export type StepCode =
	/** More falls due in the next days than there is money to pay it with. */
	| "coverDues"
	/** One month of ordinary spending, on hand, which is what stops a bad week. */
	| "buffer"
	/** The rest of the way to three months. */
	| "reserve"
	/** A goal the household already set for itself. */
	| "goal"
	/** The month does not leave enough over for any of the above to move. */
	| "freeUpMonthly";

export type PlanStep = {
	code: StepCode;
	/** The name of the goal, when the step is one. */
	subject: string | null;
	/** What still has to be found for this step. */
	amount: number;
	/** What goes into it each month. */
	everyMonth: number;
	/** Whole months to finish, counting from when the step before it finishes. */
	months: number;
	/** The month it lands in, or null when nothing can be put aside yet. */
	finishesOn: CalendarMonth | null;
	/** A goal with a date that this order does not reach in time. */
	late: boolean;
};

export type Plan = {
	/** What an ordinary month leaves over. Every date below is made of this one figure. */
	surplus: number;
	/** The month does not close with anything to spare, so nothing can be dated. */
	stuck: boolean;
	steps: PlanStep[];
	/** The month the last dated step lands in. */
	doneOn: CalendarMonth | null;
};

/** One place a household could spend less, measured against its own quietest month. */
export type Lever = {
	name: string;
	/** An ordinary month in this category. */
	usual: number;
	/** The least they actually spent on it in a month, in the months behind. */
	best: number;
	/** The difference, which is what repeating their own best month would free up. */
	frees: number;
	/** Hundredths of an ordinary month's income. */
	shareOfIncome: number;
};

export type Levers = {
	levers: Lever[];
	/** What all of them together would free up in a month. */
	frees: number;
};

/** Three months is where a median stops being one month with an opinion. */
const ENOUGH_MONTHS = 3;

/** Under this, a difference is not worth a line on a screen. Fifty units of currency. */
const NOISE = 5_000;

/** How many places to spend less are worth naming. More than this is a spreadsheet. */
const MOST_LEVERS = 5;

/** Nothing is dated further out than this, because nobody plans a household in decades. */
const FURTHEST = 600;

function share(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole;
}

/**
 * What to do, in order.
 *
 * The order is: what is already owed, then one month of cover, then three, then the
 * goals they set, by the date they set. A buffer comes before a goal because a
 * household with no buffer pays for the next bad week with a card, and a card costs more
 * than any goal earns. That is the opinion in this file, and it is the whole of it.
 */
export function planFrom(snapshot: Snapshot): Plan {
	const usualExpense = median(snapshot.before.map((month) => month.expense));
	const usualIncome = median(snapshot.before.map((month) => month.income));
	const enough = snapshot.before.length >= ENOUGH_MONTHS && usualExpense > 0;

	const surplus = enough ? usualIncome - usualExpense : 0;
	const stuck = surplus <= 0;
	const steps: PlanStep[] = [];

	// What is already owed. It is not funded out of next month's surplus, it is due now,
	// so it carries no date: the date is this week.
	const due = snapshot.pending.reduce((total, charge) => total + charge.amount, 0);
	if (due > snapshot.onHand && due > 0) {
		steps.push({
			code: "coverDues",
			subject: null,
			amount: due - snapshot.onHand,
			everyMonth: 0,
			months: 0,
			finishesOn: null,
			late: false,
		});
	}

	if (!enough) return { surplus, stuck, steps, doneOn: null };

	// A month that does not close is the first thing to fix, because every step under it
	// is funded by a number that does not exist yet.
	if (stuck) {
		steps.push({
			code: "freeUpMonthly",
			subject: null,
			amount: Math.round(usualIncome * THIN_SAVING) - surplus,
			everyMonth: 0,
			months: 0,
			finishesOn: null,
			late: false,
		});
	}

	const thisMonth = monthOf(snapshot.today);
	let cumulative = 0;

	/** Adds a step funded by the surplus, starting when everything before it finishes. */
	const fund = (code: StepCode, amount: number, subject: string | null, dueOn: string | null) => {
		if (amount <= NOISE) return;

		const months = stuck ? 0 : Math.min(FURTHEST, Math.ceil(amount / surplus));
		if (!stuck) cumulative += months;

		const finishesOn = stuck ? null : addMonthsToMonth(thisMonth, cumulative);
		steps.push({
			code,
			subject,
			amount,
			everyMonth: stuck ? 0 : surplus,
			months,
			finishesOn,
			late: dueOn !== null && finishesOn !== null && finishesOn > monthOf(dueOn),
		});
	};

	const oneMonth = usualExpense;
	const threeMonths = usualExpense * RESERVE_MONTHS;

	fund("buffer", oneMonth - snapshot.onHand, null, null);
	fund("reserve", threeMonths - Math.max(snapshot.onHand, oneMonth), null, null);

	// Their own goals, in the order they asked for them. A goal with no date goes last,
	// because a date is somebody saying this one matters more.
	const goals = [...snapshot.goals]
		.filter((goal) => goal.saved < goal.target)
		.sort((left, right) => {
			if (left.dueOn === right.dueOn) return 0;
			if (left.dueOn === null) return 1;
			if (right.dueOn === null) return -1;
			return left.dueOn < right.dueOn ? -1 : 1;
		});

	for (const goal of goals) {
		fund("goal", goal.target - goal.saved, goal.name, goal.dueOn);
	}

	const dated = steps.filter((step) => step.finishesOn !== null);
	return {
		surplus,
		stuck,
		steps,
		doneOn: dated[dated.length - 1]?.finishesOn ?? null,
	};
}

/**
 * Where an ordinary month goes, and what their own quietest month in each was.
 *
 * The comparison is deliberate. A quarter off the shopping is somebody else's number and
 * reads as a telling off. The least they spent on it in six months is a number they have
 * already lived, once, and the difference between that and the usual is the only target
 * here that nobody made up.
 *
 * It understates on purpose: a category with no spending at all in a month leaves no row
 * behind, so the quietest month it can see is the quietest month they spent anything.
 */
export function leversIn(snapshot: Snapshot, most = MOST_LEVERS): Levers {
	const usualIncome = median(snapshot.before.map((month) => month.income));

	const levers = snapshot.categories
		.filter((category) => category.before.length >= ENOUGH_MONTHS)
		.map((category) => {
			const usual = median(category.before);
			const best = Math.min(...category.before);
			return {
				name: category.name,
				usual,
				best,
				frees: Math.max(0, usual - best),
				shareOfIncome: Math.round(share(usual, usualIncome) * 100),
			};
		})
		.filter((lever) => lever.usual > NOISE)
		.sort((left, right) => right.usual - left.usual)
		.slice(0, most);

	return {
		levers,
		// Only what is on the screen is added up, so the total is a sum somebody can
		// check by reading the rows above it.
		frees: levers.reduce((total, lever) => total + lever.frees, 0),
	};
}
