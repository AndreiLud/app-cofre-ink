// Calendar dates, kept as text.
//
// A purchase made on the thirtieth is on the thirtieth, whatever the phone thinks the
// time zone is. So a date that means a day is a string, never an instant, and the
// arithmetic here never goes through a local Date.

export type CalendarDate = string;
export type CalendarMonth = string;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

export class CalendarError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CalendarError";
	}
}

export type DateParts = { year: number; month: number; day: number };

export function parseCalendarDate(value: CalendarDate): DateParts {
	const found = DATE.exec(value);
	if (!found) throw new CalendarError(`"${value}" is not a calendar date`);
	const year = Number(found[1]);
	const month = Number(found[2]);
	const day = Number(found[3]);
	if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) {
		throw new CalendarError(`"${value}" is not a day that exists`);
	}
	return { year, month, day };
}

export function parseCalendarMonth(value: CalendarMonth): { year: number; month: number } {
	const found = MONTH.exec(value);
	if (!found) throw new CalendarError(`"${value}" is not a calendar month`);
	const year = Number(found[1]);
	const month = Number(found[2]);
	if (month < 1 || month > 12) throw new CalendarError(`"${value}" is not a month that exists`);
	return { year, month };
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function formatCalendarDate(year: number, month: number, day: number): CalendarDate {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function formatCalendarMonth(year: number, month: number): CalendarMonth {
	return `${pad(year, 4)}-${pad(month)}`;
}

export function monthOf(date: CalendarDate): CalendarMonth {
	const { year, month } = parseCalendarDate(date);
	return formatCalendarMonth(year, month);
}

export function lastDayOfMonth(year: number, month: number): number {
	// Day zero of the next month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Turns the thirty first into the last day a shorter month actually has. */
export function clampDay(year: number, month: number, day: number): number {
	return Math.min(Math.max(day, 1), lastDayOfMonth(year, month));
}

export function dateInMonth(month: CalendarMonth, day: number): CalendarDate {
	const parts = parseCalendarMonth(month);
	return formatCalendarDate(parts.year, parts.month, clampDay(parts.year, parts.month, day));
}

export function addMonthsToMonth(month: CalendarMonth, count: number): CalendarMonth {
	const parts = parseCalendarMonth(month);
	const total = parts.year * 12 + (parts.month - 1) + count;
	return formatCalendarMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Keeps the day of the month where it can, and clamps where the month is shorter. */
export function addMonths(date: CalendarDate, count: number): CalendarDate {
	const { year, month, day } = parseCalendarDate(date);
	const total = year * 12 + (month - 1) + count;
	const nextYear = Math.floor(total / 12);
	const nextMonth = (total % 12) + 1;
	return formatCalendarDate(nextYear, nextMonth, clampDay(nextYear, nextMonth, day));
}

export function addDays(date: CalendarDate, count: number): CalendarDate {
	const { year, month, day } = parseCalendarDate(date);
	const moved = new Date(Date.UTC(year, month - 1, day + count));
	return formatCalendarDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** Sorting as text gives the same answer, which is why the format is what it is. */
export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	const start = parseCalendarDate(from);
	const end = parseCalendarDate(to);
	const startMillis = Date.UTC(start.year, start.month - 1, start.day);
	const endMillis = Date.UTC(end.year, end.month - 1, end.day);
	return Math.round((endMillis - startMillis) / 86_400_000);
}

/**
 * What day it is where the space lives, which is not always what day it is where the
 * device is. A person in Lisbon writing into a space in São Paulo still gets the day
 * their money lives in.
 */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);

	const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
	return formatCalendarDate(read("year"), read("month"), read("day"));
}
