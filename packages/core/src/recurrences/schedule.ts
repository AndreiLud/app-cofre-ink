// When a recurring thing happens.
//
// The whole series is a function of the rule, never a stored pointer to "the next one".
// A stored pointer drifts the moment a device is offline, a clock is wrong or somebody
// edits the rule, and then bills appear twice or not at all. Asking the question again
// from the start gives the same answer on every device, every time.
//
// The day is clamped, not rolled over. A bill due on the thirty first falls on the
// twenty eighth of February, not on the first of March, because that is when the money
// actually leaves.

import {
	addDays,
	type CalendarDate,
	CalendarError,
	compareCalendarDates,
	dateInMonth,
	formatCalendarMonth,
	monthOf,
	parseCalendarDate,
} from "../time/calendar.ts";

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

export type RecurrenceSpec = {
	frequency: RecurrenceFrequency;
	/** Every this many periods. Two, monthly, is every other month. */
	intervalCount?: number;
	startsOn: CalendarDate;
	endsOn?: CalendarDate | null;
	/** Defaults to the day of the month the series starts on. */
	dayOfMonth?: number | null;
	/** Defaults to the month the series starts on, for a yearly one. */
	monthOfYear?: number | null;
};

/** Sunday is zero, as in every calendar library, without going through local time. */
export function weekdayOf(date: CalendarDate): number {
	const { year, month, day } = parseCalendarDate(date);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function everyOf(spec: RecurrenceSpec): number {
	const count = spec.intervalCount ?? 1;
	if (!Number.isInteger(count) || count < 1 || count > 60) {
		throw new CalendarError("the interval is a whole number of periods, from 1 to 60");
	}
	return count;
}

/** The days this series falls on inside a window, both ends included. */
export function occurrencesBetween(
	spec: RecurrenceSpec,
	from: CalendarDate,
	to: CalendarDate,
): CalendarDate[] {
	parseCalendarDate(from);
	parseCalendarDate(to);
	const start = parseCalendarDate(spec.startsOn);
	const every = everyOf(spec);
	if (compareCalendarDates(to, from) < 0) return [];

	const last = spec.endsOn && compareCalendarDates(spec.endsOn, to) < 0 ? spec.endsOn : to;
	if (compareCalendarDates(last, spec.startsOn) < 0) return [];

	const found: CalendarDate[] = [];

	if (spec.frequency === "weekly") {
		const step = 7 * every;
		let day = spec.startsOn;
		// Jumping straight to the window keeps a series that began years ago cheap.
		const ahead = Math.floor(daysApart(spec.startsOn, from) / step);
		if (ahead > 0) day = addDays(day, ahead * step);
		while (compareCalendarDates(day, from) < 0) day = addDays(day, step);

		while (compareCalendarDates(day, last) <= 0) {
			found.push(day);
			day = addDays(day, step);
		}
		return found;
	}

	const dayOfMonth = spec.dayOfMonth ?? start.day;
	if (dayOfMonth < 1 || dayOfMonth > 31) {
		throw new CalendarError("the day of the month is between 1 and 31");
	}

	if (spec.frequency === "monthly") {
		const startMonth = monthOf(spec.startsOn);
		const firstMonth = monthOf(from);
		const distance = monthsApart(startMonth, firstMonth);
		// Only the months that fall on the interval count, and never before the start.
		let index = Math.max(0, Math.ceil(distance / every));

		for (;;) {
			const month = addMonths(startMonth, index * every);
			const day = dateInMonth(month, dayOfMonth);
			if (compareCalendarDates(day, last) > 0) break;
			if (compareCalendarDates(day, from) >= 0 && compareCalendarDates(day, spec.startsOn) >= 0) {
				found.push(day);
			}
			index += 1;
			// A window is never longer than a lifetime, and this is the safety rail.
			if (index > 2000) break;
		}
		return found;
	}

	const monthOfYear = spec.monthOfYear ?? start.month;
	if (monthOfYear < 1 || monthOfYear > 12) {
		throw new CalendarError("the month of the year is between 1 and 12");
	}

	let year = Math.max(start.year, parseCalendarDate(from).year - 1);
	// Keep the year on the interval the series was born on.
	const offset = (year - start.year) % every;
	if (offset !== 0) year += every - offset;

	for (; year <= parseCalendarDate(last).year; year += every) {
		const day = dateInMonth(formatCalendarMonth(year, monthOfYear), dayOfMonth);
		if (compareCalendarDates(day, spec.startsOn) < 0) continue;
		if (compareCalendarDates(day, from) < 0) continue;
		if (compareCalendarDates(day, last) > 0) break;
		found.push(day);
	}
	return found;
}

/** The next day this series falls on, strictly after the day given. */
export function nextOccurrence(spec: RecurrenceSpec, after: CalendarDate): CalendarDate | null {
	// Two years is far enough for any series that has not ended.
	const horizon = addDays(after, 366 * 2);
	const found = occurrencesBetween(spec, addDays(after, 1), horizon);
	return found[0] ?? null;
}

function daysApart(from: CalendarDate, to: CalendarDate): number {
	const start = parseCalendarDate(from);
	const end = parseCalendarDate(to);
	return Math.round(
		(Date.UTC(end.year, end.month - 1, end.day) -
			Date.UTC(start.year, start.month - 1, start.day)) /
			86_400_000,
	);
}

function monthsApart(from: string, to: string): number {
	const [fromYear, fromMonth] = from.split("-").map(Number);
	const [toYear, toMonth] = to.split("-").map(Number);
	return (toYear ?? 0) * 12 + (toMonth ?? 1) - ((fromYear ?? 0) * 12 + (fromMonth ?? 1));
}

function addMonths(month: string, count: number): string {
	const [year, index] = month.split("-").map(Number);
	const total = (year ?? 0) * 12 + ((index ?? 1) - 1) + count;
	return formatCalendarMonth(Math.floor(total / 12), (total % 12) + 1);
}
