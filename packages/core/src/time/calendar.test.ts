import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	addDays,
	addMonths,
	addMonthsToMonth,
	CalendarError,
	clampDay,
	compareCalendarDates,
	dateInMonth,
	daysBetween,
	lastDayOfMonth,
	monthOf,
	parseCalendarDate,
	todayIn,
} from "./calendar.ts";

const anyDate = fc
	.date({
		min: new Date("1990-01-01T00:00:00Z"),
		max: new Date("2090-12-31T00:00:00Z"),
		noInvalidDate: true,
	})
	.map((value) => value.toISOString().slice(0, 10));

describe("calendar dates", () => {
	it("refuses anything that is not a day", () => {
		expect(() => parseCalendarDate("2026-02-30")).toThrow(CalendarError);
		expect(() => parseCalendarDate("2026-13-01")).toThrow(CalendarError);
		expect(() => parseCalendarDate("ontem")).toThrow(CalendarError);
	});

	it("knows how long a month is, including February in a leap year", () => {
		expect(lastDayOfMonth(2026, 2)).toBe(28);
		expect(lastDayOfMonth(2028, 2)).toBe(29);
		expect(lastDayOfMonth(2026, 4)).toBe(30);
		expect(clampDay(2026, 2, 31)).toBe(28);
	});

	it("keeps the day of the month where it can", () => {
		expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
		expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
	});

	it("moves by months without losing a year", () => {
		expect(addMonthsToMonth("2026-12", 1)).toBe("2027-01");
		expect(addMonthsToMonth("2026-01", -1)).toBe("2025-12");
		expect(addMonthsToMonth("2026-06", 18)).toBe("2027-12");
	});

	it("moves by days across months and years", () => {
		expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
	});

	it("sorts as text exactly as it sorts as a day", () => {
		fc.assert(
			fc.property(fc.array(anyDate, { minLength: 2, maxLength: 20 }), (dates) => {
				const byText = [...dates].sort();
				const byValue = [...dates].sort(compareCalendarDates);
				expect(byText).toEqual(byValue);
			}),
		);
	});

	it("comes back to where it started after going and returning", () => {
		fc.assert(
			fc.property(anyDate, fc.integer({ min: -60, max: 60 }), (date, days) => {
				expect(addDays(addDays(date, days), -days)).toBe(date);
			}),
		);
	});

	it("names the month of a day", () => {
		expect(monthOf("2026-09-21")).toBe("2026-09");
		expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
	});
});

describe("what day it is where the space lives", () => {
	it("follows the zone, not the device", () => {
		// Three in the morning in London is still the day before in São Paulo.
		const instant = new Date("2026-09-21T03:00:00Z");
		expect(todayIn("Europe/London", instant)).toBe("2026-09-21");
		expect(todayIn("America/Sao_Paulo", instant)).toBe("2026-09-21");

		const laterInstant = new Date("2026-09-21T01:00:00Z");
		expect(todayIn("America/Sao_Paulo", laterInstant)).toBe("2026-09-20");
	});
});
