// What is left on a benefit card, and until when.
//
// A voucher is not an account somebody pays into. An amount lands on a day each month,
// it is spent down on lunch or on fares, and at the end of the period what is left
// either carries or does not, depending on the card. Nothing is written when the money
// arrives, because from the household's side nothing arrives: it was never theirs to
// move. So what is left is worked out rather than read off a balance, and this is where
// the working out lives.
//
// The opening balance of a voucher is what was on the card the day somebody wrote it
// down. Every landing after that day adds the allowance; the landing of the period the
// card was written down in does not, because whatever it put there is already inside the
// number that was typed.
//
// Unless nothing was typed, which is every card written down since the form stopped asking
// for an opening balance. Then there is no number standing in for that period's landing,
// and the allowance of the period somebody is standing in is what the card holds as far as
// anybody here knows. Without that a card written down on the twentieth read as empty until
// the fifth of the next month, which is not what is in somebody's pocket.

import {
	addDays,
	addMonthsToMonth,
	type CalendarDate,
	compareCalendarDates,
	dateInMonth,
	monthOf,
	parseCalendarDate,
	parseCalendarMonth,
} from "../time/calendar.ts";

export type Quota = {
	/** What lands each period, in minor units. */
	amount: number;
	/** The day of the month it lands on, one to thirty one. */
	day: number;
	/** Whether what is left at the end of a period carries into the next one. */
	carries: boolean;
};

export type BenefitPeriod = {
	/** The day this period's money landed. */
	from: CalendarDate;
	/** The last day of it, which is the day before the next one lands. */
	to: CalendarDate;
};

export type BenefitState = BenefitPeriod & {
	/** What lands each period. */
	quota: number;
	/** How many allowances have landed since the card was written down. */
	landed: number;
	/** What is left to spend now. Negative when the card was overspent, because it was. */
	left: number;
};

/**
 * The period a day falls in, for an allowance that lands on a day of the month.
 *
 * A day on or after the landing day belongs to the period that started this month; a day
 * before it belongs to the one that started last month. A month too short for the day
 * lands on its last day, which is what `dateInMonth` already does for a card that closes
 * on the thirty first.
 */
export function periodOf(day: CalendarDate, quotaDay: number): BenefitPeriod {
	parseCalendarDate(day);
	assertQuotaDay(quotaDay);

	const thisMonth = dateInMonth(monthOf(day), quotaDay);
	const from =
		compareCalendarDates(day, thisMonth) >= 0
			? thisMonth
			: dateInMonth(addMonthsToMonth(monthOf(day), -1), quotaDay);
	const next = dateInMonth(addMonthsToMonth(monthOf(from), 1), quotaDay);
	return { from, to: addDays(next, -1) };
}

function assertQuotaDay(quotaDay: number): void {
	if (!Number.isInteger(quotaDay) || quotaDay < 1 || quotaDay > 31) {
		throw new RangeError("the day an allowance lands on is a day of the month");
	}
}

/** How many landings happened after one day and up to another, both in the same rhythm. */
export function landingsBetween(from: CalendarDate, to: CalendarDate, quotaDay: number): number {
	assertQuotaDay(quotaDay);
	if (compareCalendarDates(to, from) <= 0) return 0;

	const first = periodOf(from, quotaDay);
	const last = periodOf(to, quotaDay);
	const a = parseCalendarMonth(monthOf(first.from));
	const b = parseCalendarMonth(monthOf(last.from));
	return (b.year - a.year) * 12 + (b.month - a.month);
}

export type BenefitInput = {
	quota: Quota;
	/** The day the question is being asked on. */
	today: CalendarDate;
	/** The day the card was written down. */
	openedOn: CalendarDate;
	/** What was on the card that day, in minor units. */
	openingBalance: number;
	/** Everything spent on the card since it was written down, as a positive number. */
	spentSinceOpening: number;
	/** What was spent in the period the question is being asked in, as a positive number. */
	spentThisPeriod: number;
};

/**
 * What is on the card today.
 *
 * Two cards, two sums. One that carries is the whole history: what was there at the
 * start, plus every landing since, less everything spent. One that does not is only this
 * period, because the rest was taken back on the landing day, and the opening balance
 * only survives while the card is still in the period it was written down in.
 */
export function benefitState(input: BenefitInput): BenefitState {
	const period = periodOf(input.today, input.quota.day);

	/**
	 * Whether the landing of the period the card was written down in counts.
	 *
	 * It counts only when nobody said what was on the card that day. Somebody who typed a
	 * number typed what was actually there, and that number already holds whatever that
	 * period had put on it, so counting the landing as well would count it twice: that is
	 * the case of every card carried over from a release that asked for an opening balance.
	 *
	 * Somebody who typed nothing, which is every card written down since the form stopped
	 * asking, is telling us only that the card exists. Then the allowance of the period they
	 * are standing in is the best thing anybody knows about it, and saying nothing is on the
	 * card is worse than saying the allowance is, because a meal card in the middle of a
	 * month is not empty. It reads high for whoever had already eaten some of it outside the
	 * application, and it is exact from the next landing onwards.
	 */
	const nobodySaid = input.openingBalance === 0;
	const countFrom = nobodySaid
		? addDays(periodOf(input.openedOn, input.quota.day).from, -1)
		: input.openedOn;
	const landed = landingsBetween(countFrom, input.today, input.quota.day);

	if (input.quota.carries) {
		return {
			...period,
			quota: input.quota.amount,
			landed,
			left: input.openingBalance + landed * input.quota.amount - input.spentSinceOpening,
		};
	}

	// Still inside the period it was written down in: nothing has been taken back yet, so
	// what was typed is what is there, less what has gone since.
	const started = landed === 0;
	return {
		...period,
		quota: input.quota.amount,
		landed,
		left: started
			? input.openingBalance - input.spentSinceOpening
			: input.quota.amount - input.spentThisPeriod,
	};
}

/** What the default is for a kind of benefit, which is what the card in somebody's pocket does. */
export function carriesByDefault(benefit: string): boolean {
	// A meal card keeps what was not eaten. A transport card is topped back up to the
	// same amount each month and what was left goes, which is why it is the exception.
	return benefit !== "transport";
}
