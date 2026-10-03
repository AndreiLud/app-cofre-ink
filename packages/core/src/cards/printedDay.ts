// Which year a day printed without one belongs to.
//
// A card invoice prints "28 DEZ" and "12/03", and the year is whatever the reader makes of
// it. Taking the year of the first full date on the page put a purchase of the twenty eighth
// of December on an invoice due in January into the December that has not come yet, and a
// part of a plan bought a year and a half ago into this March.

import {
	addMonths,
	type CalendarDate,
	clampDay,
	daysBetween,
	formatCalendarDate,
} from "../time/calendar.ts";

export type PrintedDayInput = {
	day: number;
	month: number;
	/** When the invoice falls due, or the last day of the statement: no entry is after it. */
	anchor: CalendarDate | null;
	/** The days the document covers, when it says. A day inside them is that one. */
	period: { from: CalendarDate; to: CalendarDate } | null;
	/** The year to use when the document says nothing to place the day by. */
	fallbackYear: number;
	/**
	 * The number of the part, when the line is a part of a plan. Its day may be the day of the
	 * purchase, that many months before the invoice, and not of this year at all.
	 */
	part?: number | null;
};

/**
 * The day, in the year that makes sense of it.
 *
 * Inside the period, it is that one. Otherwise it is on or before the anchor: the latest such
 * day, which is never more than a year back, or, for a part of a plan, the one nearest the
 * purchase, as many months before the invoice as the number of the part.
 */
export function printedDay(input: PrintedDayInput): CalendarDate | null {
	if (input.month < 1 || input.month > 12 || input.day < 1 || input.day > 31) return null;
	const on = (year: number): CalendarDate | null =>
		input.day > clampDay(year, input.month, input.day)
			? null
			: formatCalendarDate(year, input.month, input.day);

	if (input.anchor === null) return on(input.fallbackYear);
	const anchorYear = Number(input.anchor.slice(0, 4));
	const candidates: CalendarDate[] = [];
	for (let year = anchorYear - 5; year <= anchorYear + 1; year += 1) {
		const day = on(year);
		if (day !== null) candidates.push(day);
	}

	const period = input.period;
	if (period) {
		const inside = candidates.find((day) => day >= period.from && day <= period.to);
		if (inside) return inside;
	}

	const anchor = input.anchor;
	const before = candidates.filter((day) => day <= anchor);
	if (before.length === 0) return on(input.fallbackYear);

	const part = input.part ?? null;
	if (part !== null && part > 1) {
		const target = addMonths(anchor, -part);
		return before.reduce((best, day) =>
			Math.abs(daysBetween(day, target)) < Math.abs(daysBetween(best, target)) ? day : best,
		);
	}
	return before[before.length - 1] ?? null;
}
