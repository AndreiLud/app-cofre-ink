import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareCalendarDates } from "../time/calendar.ts";
import { nextOccurrence, occurrencesBetween, weekdayOf } from "./schedule.ts";

describe("a series that repeats every month", () => {
	const rent = { frequency: "monthly" as const, startsOn: "2026-01-05" };

	it("falls on the same day of every month", () => {
		expect(occurrencesBetween(rent, "2026-01-01", "2026-04-30")).toEqual([
			"2026-01-05",
			"2026-02-05",
			"2026-03-05",
			"2026-04-05",
		]);
	});

	it("never goes back before the day it started", () => {
		expect(occurrencesBetween(rent, "2025-01-01", "2026-02-28")).toEqual([
			"2026-01-05",
			"2026-02-05",
		]);
	});

	it("clamps a day that the month does not have", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-01-31" };
		expect(occurrencesBetween(series, "2026-01-01", "2026-04-30")).toEqual([
			"2026-01-31",
			"2026-02-28",
			"2026-03-31",
			"2026-04-30",
		]);
	});

	it("takes the day of the month over the day it started on", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-01-05", dayOfMonth: 20 };
		expect(occurrencesBetween(series, "2026-01-01", "2026-03-31")).toEqual([
			"2026-01-20",
			"2026-02-20",
			"2026-03-20",
		]);
	});

	it("counts the interval from the month it started on", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-01-10", intervalCount: 2 };
		expect(occurrencesBetween(series, "2026-01-01", "2026-07-31")).toEqual([
			"2026-01-10",
			"2026-03-10",
			"2026-05-10",
			"2026-07-10",
		]);
		// And the window not starting on an interval month changes nothing.
		expect(occurrencesBetween(series, "2026-04-01", "2026-06-30")).toEqual(["2026-05-10"]);
	});

	it("stops on the day it was told to stop", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-01-05", endsOn: "2026-03-05" };
		expect(occurrencesBetween(series, "2026-01-01", "2026-12-31")).toEqual([
			"2026-01-05",
			"2026-02-05",
			"2026-03-05",
		]);
	});

	it("turns the year over", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-11-15" };
		expect(occurrencesBetween(series, "2026-11-01", "2027-02-28")).toEqual([
			"2026-11-15",
			"2026-12-15",
			"2027-01-15",
			"2027-02-15",
		]);
	});
});

describe("a series that repeats every week", () => {
	const cleaning = { frequency: "weekly" as const, startsOn: "2026-09-03" };

	it("keeps the weekday it started on", () => {
		const found = occurrencesBetween(cleaning, "2026-09-01", "2026-09-30");
		expect(found).toEqual(["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"]);
		expect(found.every((day) => weekdayOf(day) === weekdayOf(cleaning.startsOn))).toBe(true);
	});

	it("skips weeks when the interval says so", () => {
		const series = { frequency: "weekly" as const, startsOn: "2026-09-03", intervalCount: 2 };
		expect(occurrencesBetween(series, "2026-09-01", "2026-10-15")).toEqual([
			"2026-09-03",
			"2026-09-17",
			"2026-10-01",
			"2026-10-15",
		]);
	});

	it("lands on the interval even when the window starts long after", () => {
		const series = { frequency: "weekly" as const, startsOn: "2020-01-01", intervalCount: 3 };
		const found = occurrencesBetween(series, "2026-09-01", "2026-10-01");
		expect(found.length).toBeGreaterThan(0);
		// Every day found is a whole number of intervals away from the start.
		const start = Date.UTC(2020, 0, 1);
		expect(
			found.every((day) => {
				const [year, month, date] = day.split("-").map(Number);
				const apart = (Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1) - start) / 86_400_000;
				return apart % 21 === 0;
			}),
		).toBe(true);
	});
});

describe("a series that repeats every year", () => {
	it("falls on the same day of the same month", () => {
		const insurance = { frequency: "yearly" as const, startsOn: "2026-03-12" };
		expect(occurrencesBetween(insurance, "2026-01-01", "2029-12-31")).toEqual([
			"2026-03-12",
			"2027-03-12",
			"2028-03-12",
			"2029-03-12",
		]);
	});

	it("clamps the twenty ninth of February to the years that do not have it", () => {
		const series = { frequency: "yearly" as const, startsOn: "2028-02-29" };
		expect(occurrencesBetween(series, "2028-01-01", "2030-12-31")).toEqual([
			"2028-02-29",
			"2029-02-28",
			"2030-02-28",
		]);
	});
});

describe("whatever the window", () => {
	it("gives back days inside it, in order, and never repeats one", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("weekly" as const, "monthly" as const, "yearly" as const),
				fc.integer({ min: 1, max: 6 }),
				fc.integer({ min: 1, max: 28 }),
				(frequency, intervalCount, day) => {
					const spec = {
						frequency,
						intervalCount,
						startsOn: `2026-01-${String(day).padStart(2, "0")}`,
					};
					const found = occurrencesBetween(spec, "2026-01-01", "2027-12-31");

					expect(new Set(found).size).toBe(found.length);
					expect([...found].sort(compareCalendarDates)).toEqual(found);
					expect(
						found.every(
							(one) =>
								compareCalendarDates(one, "2026-01-01") >= 0 &&
								compareCalendarDates(one, "2027-12-31") <= 0,
						),
					).toBe(true);
				},
			),
		);
	});

	it("says what comes next, which is the first day after the one given", () => {
		const series = { frequency: "monthly" as const, startsOn: "2026-01-10" };
		expect(nextOccurrence(series, "2026-01-10")).toBe("2026-02-10");
		expect(nextOccurrence(series, "2026-01-09")).toBe("2026-01-10");
		expect(nextOccurrence({ ...series, endsOn: "2026-01-10" }, "2026-01-10")).toBe(null);
	});
});
