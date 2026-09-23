// The months that cost more, and what they would cost a month if they were saved for.
//
// A car tax, a school year, a December: every household has a handful of months that are
// simply dearer than the others, and every one of them arrives as a surprise to a budget
// that only ever looks six months back. They are not surprises. They happened last year,
// on the same page of the same calendar, and the records say so.
//
// So this reads a longer window than anything else here, because a bill that comes once
// a year cannot be seen in six months of records. It does not read that window for the
// medians the rest of the package uses: what an ordinary month costs today should not be
// decided by last year.
//
// What it produces is the only thing worth producing about a lump in the future, which
// is a monthly figure. A thousand in February is frightening. Two hundred a month
// starting now is a decision.

import { median } from "../plan/projection.ts";
import { addMonthsToMonth, type CalendarMonth, monthOf } from "../time/calendar.ts";
import type { Snapshot } from "./findings.ts";

export type HeavyMonth = {
	/** The month it was, which is the evidence. */
	was: CalendarMonth;
	/** The same month, next time round. */
	next: CalendarMonth;
	spent: number;
	/** How far above an ordinary month it went. */
	over: number;
	/** Whole months from the one in hand until it comes. */
	away: number;
	/** What to put aside each month between now and then. */
	everyMonth: number;
};

export type Season = {
	/** How many closed months this could read, which is what makes it trustworthy. */
	monthsRead: number;
	/** An ordinary month over the whole of that, which the heavy ones are measured against. */
	usual: number;
	heavy: HeavyMonth[];
};

/** A year of closed months. Less than this cannot see a year at all. */
const A_YEAR = 12;

/** How far above an ordinary month a month has to go before it is one of these. */
const HEAVY = 1.2;

/** Under this, a month is not dearer, it is a month. Fifty units of currency. */
const NOISE = 5_000;

/** How many to name. Four is a year with a shape; twelve is a spreadsheet. */
const MOST = 4;

function monthsBetween(from: string, to: string): number {
	const [fromYear, fromMonth] = from.split("-").map(Number);
	const [toYear, toMonth] = to.split("-").map(Number);
	return ((toYear ?? 0) - (fromYear ?? 0)) * 12 + ((toMonth ?? 0) - (fromMonth ?? 0));
}

/**
 * The dearer months of the year behind, turned into what they cost a month.
 *
 * Null until there are twelve closed months, because a year is the whole of the idea:
 * with eight months of records, the four that are missing are exactly the ones nobody
 * can see coming.
 */
export function seasonFrom(snapshot: Snapshot): Season | null {
	if (snapshot.longer.length < A_YEAR) return null;

	const read = snapshot.longer.slice(0, A_YEAR);
	const usual = median(read.map((month) => month.expense));
	if (usual <= 0) return null;

	const thisMonth = monthOf(snapshot.today);

	const heavy = read
		.filter((month) => month.expense >= usual * HEAVY && month.expense - usual > NOISE)
		.map((month) => {
			const next = addMonthsToMonth(month.month, A_YEAR);
			const away = monthsBetween(thisMonth, next);
			const over = month.expense - usual;
			return {
				was: month.month,
				next,
				spent: month.expense,
				over,
				away,
				everyMonth: away > 0 ? Math.ceil(over / away) : over,
			};
		})
		// Soonest first, which is the order somebody can act in.
		.sort((left, right) => left.away - right.away)
		.slice(0, MOST);

	return { monthsRead: read.length, usual, heavy };
}
