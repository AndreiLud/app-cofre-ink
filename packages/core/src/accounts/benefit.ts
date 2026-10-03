// What is left on a benefit card, and until when.
//
// A voucher is not an account somebody pays into. An amount lands on a day each month,
// it is spent down on lunch or on fares, and at the end of the period what is left
// either carries or does not, depending on the card. Nothing is written when the money
// arrives, because from the household's side nothing arrives: it was never theirs to
// move. So what is left is worked out rather than read off a balance, and this is where
// the working out lives.
//
// Where counting starts is decided once, in `countingFrom`, and everything that reads a card
// reads it from there: what is left on it, and the allowance a report counts as money that
// came in. A figure somebody gave, on its day, or else the allowance of the period the card
// was written down in, with every purchase dated in that period.

import {
	addDays,
	addMonthsToMonth,
	type CalendarDate,
	compareCalendarDates,
	dateInMonth,
	daysBetween,
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
	/** The day the next allowance lands. */
	landsOn: CalendarDate;
	/** How many days off that is, counted from the day the question was asked. */
	daysToLanding: number;
	/** Whether what is left survives that day, or goes with it. */
	carries: boolean;
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

/** The day the next allowance lands, which is the day after the last day of this period. */
export function nextLandingOf(day: CalendarDate, quotaDay: number): CalendarDate {
	return addDays(periodOf(day, quotaDay).to, 1);
}

/**
 * How many days until the next allowance lands.
 *
 * Never less than one, because a day on the landing day belongs to the period that starts
 * on it, so the next landing is always ahead. This is the number that makes the figure
 * beside it mean something: what is left has to last exactly this long.
 */
export function daysToLanding(day: CalendarDate, quotaDay: number): number {
	return daysBetween(day, nextLandingOf(day, quotaDay));
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

/**
 * One version of an allowance, and the first day it applies from.
 *
 * Changing what lands on a card changes it from the next landing onwards, and never one
 * that already landed: that is decision 4 of 2.0.0. So an allowance is a list of these, and
 * each landing is worked out with the version in force on its own day.
 */
export type QuotaVersion = Quota & {
	/** The first day it applies from, or nothing when it applies from the start. */
	since: CalendarDate | null;
};

/**
 * Where counting what is on a card starts.
 *
 * Somebody either said what was on it on a day, which is the opening balance a card from
 * release 1.0 carries and the "how much is on the card today" of 2.0.0, or nobody did. Then
 * the allowance of the period the card was written down in is what it holds, and every
 * purchase dated in that period counts against it.
 */
export type VoucherStart = {
	/** The day it was said, or the day the card was written down when nothing was. */
	on: CalendarDate;
	/** What was on the card that day, or nothing when nobody said. */
	amount: number | null;
};

/**
 * Something that happened on a card, with its day, as a positive amount.
 *
 * A purchase is "spent", and a refund of one is a purchase taken back, so it is "spent" with
 * the amount the other way round. Money moved onto the card by hand, a top up by Pix, is
 * "added". An income somebody wrote on the card before 2.0.0 is "income": it was usually the
 * allowance written by hand, so it stands for the allowance of its own month.
 */
export type VoucherMovement = {
	on: CalendarDate;
	amount: number;
	kind: "spent" | "added" | "income";
};

export type BenefitInput = {
	/** Every version of the allowance, oldest first. One, for an allowance never changed. */
	versions: readonly QuotaVersion[];
	start: VoucherStart;
	/** What happened on the card, whatever its day: what counts is decided here. */
	movements: readonly VoucherMovement[];
	/** The day the question is being asked on. */
	today: CalendarDate;
};

/** The version of an allowance in force on a day: the last one whose first day has come. */
export function quotaOn(versions: readonly QuotaVersion[], day: CalendarDate): QuotaVersion {
	const [first] = versions;
	if (!first) throw new RangeError("an allowance needs at least one version");
	let found = first;
	for (const version of versions) {
		if (version.since === null || compareCalendarDates(version.since, day) <= 0) found = version;
	}
	return found;
}

/**
 * Every landing after one day and up to another, each with the amount in force on its day.
 *
 * One landing a month, on the day of the version in force by then, so changing the day of
 * an allowance does not land it twice in the month it changed.
 */
export function landingsOf(
	versions: readonly QuotaVersion[],
	after: CalendarDate,
	until: CalendarDate,
): { on: CalendarDate; amount: number }[] {
	const found: { on: CalendarDate; amount: number }[] = [];
	if (compareCalendarDates(until, after) <= 0) return found;
	const last = monthOf(until);
	for (let month = monthOf(after); month <= last; month = addMonthsToMonth(month, 1)) {
		let landing: { on: CalendarDate; amount: number } | null = null;
		for (const version of versions) {
			assertQuotaDay(version.day);
			const on = dateInMonth(month, version.day);
			if (version.since === null || compareCalendarDates(version.since, on) <= 0) {
				landing = { on, amount: version.amount };
			}
		}
		if (
			landing &&
			compareCalendarDates(landing.on, after) > 0 &&
			compareCalendarDates(landing.on, until) <= 0
		) {
			found.push(landing);
		}
	}
	return found;
}

/**
 * From which day a card counts, and with what, which is the one answer every reading of a
 * card shares: what is left on it, and the allowance a report counts as money that came in.
 *
 * With a figure somebody gave, that figure on its day, the landings after it, and what
 * happened from that day on. With none, the allowance of the period the card was written
 * down in, and what happened from the first day of that period. That second half is part 1,
 * item B.1 of 2.0.0: the landing of that period was counted and the purchases of the same
 * period before the card was written down were not, so a card written down on the
 * twenty eighth said 900 of 900 with a lunch of 56 from the twenty fourth on it.
 */
export function countingFrom(
	versions: readonly QuotaVersion[],
	start: VoucherStart,
): { from: CalendarDate; landingsAfter: CalendarDate; base: number } {
	if (start.amount !== null) {
		return { from: start.on, landingsAfter: start.on, base: start.amount };
	}
	const period = periodOf(start.on, quotaOn(versions, start.on).day);
	return { from: period.from, landingsAfter: addDays(period.from, -1), base: 0 };
}

/**
 * The landings a card has had up to a day, each with its amount, which is what a report
 * counts as the benefit that came in.
 *
 * A month with an income written on the card has no landing of its own: that income was the
 * allowance written by hand, before the application worked it out, and counting both would
 * count the month twice. That is the answer to part 1, item B.7 of 2.0.0.
 */
export function voucherLandings(
	input: Omit<BenefitInput, "today"> & { until: CalendarDate },
): { on: CalendarDate; amount: number }[] {
	const { from, landingsAfter } = countingFrom(input.versions, input.start);
	const written = new Set(
		input.movements
			.filter(
				(movement) =>
					movement.kind === "income" &&
					compareCalendarDates(movement.on, from) >= 0 &&
					compareCalendarDates(movement.on, input.until) <= 0,
			)
			.map((movement) => monthOf(movement.on)),
	);
	return landingsOf(input.versions, landingsAfter, input.until).filter(
		(landing) => !written.has(monthOf(landing.on)),
	);
}

/**
 * What is on the card today.
 *
 * Two cards, two sums. One that carries is the whole history from where counting starts:
 * that figure, plus every landing since, plus what was added, less what was spent. One that
 * does not is only this period, because the rest was taken back on the landing day, and the
 * figure somebody gave only survives while the card is still in the period it was given in.
 */
export function benefitState(input: BenefitInput): BenefitState {
	const current = quotaOn(input.versions, input.today);
	const period = periodOf(input.today, current.day);
	const { from, base } = countingFrom(input.versions, input.start);
	const counted = voucherLandings({ ...input, until: input.today });

	// When the next one lands, and whether this one survives it. A figure with no horizon on
	// it says nothing: three hundred has to last twenty days or two, and on a card that does
	// not carry it does not last at all.
	const landsOn =
		landingsOf(input.versions, input.today, addMonthsToMonthDay(input.today, 2))[0]?.on ??
		nextLandingOf(input.today, current.day);
	const until = {
		landsOn,
		daysToLanding: daysBetween(input.today, landsOn),
		carries: current.carries,
	};

	/** Everything that happened from a day up to today, added up with its sign. */
	const movedSince = (day: CalendarDate): number =>
		input.movements
			.filter(
				(movement) =>
					compareCalendarDates(movement.on, day) >= 0 &&
					compareCalendarDates(movement.on, input.today) <= 0,
			)
			.reduce(
				(total, movement) =>
					total + (movement.kind === "spent" ? -movement.amount : movement.amount),
				0,
			);
	const landedSince = (day: CalendarDate): number =>
		counted
			.filter((landing) => compareCalendarDates(landing.on, day) >= 0)
			.reduce((total, landing) => total + landing.amount, 0);

	if (current.carries) {
		return {
			...period,
			...until,
			quota: current.amount,
			landed: counted.length,
			left: base + landedSince(from) + movedSince(from),
		};
	}

	// Only this period. The figure somebody gave is still on the card while the card is in
	// the period it was given in, and was taken back on the next landing otherwise.
	const inThisPeriod = compareCalendarDates(from, period.from) >= 0;
	const since = inThisPeriod ? from : period.from;
	return {
		...period,
		...until,
		quota: current.amount,
		landed: counted.length,
		left: (inThisPeriod ? base : 0) + landedSince(since) + movedSince(since),
	};
}

/** A day some months on, for looking ahead far enough to find the next landing. */
function addMonthsToMonthDay(day: CalendarDate, months: number): CalendarDate {
	return dateInMonth(addMonthsToMonth(monthOf(day), months), 28);
}

/** What the default is for a kind of benefit, which is what the card in somebody's pocket does. */
export function carriesByDefault(benefit: string): boolean {
	// A meal card keeps what was not eaten. A transport card is topped back up to the
	// same amount each month and what was left goes, which is why it is the exception.
	return benefit !== "transport";
}
