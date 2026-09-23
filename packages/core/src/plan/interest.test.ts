import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	futureValue,
	grow,
	growAtRates,
	independence,
	independenceTarget,
	monthlyFactorOf,
	monthsToReach,
} from "./interest.ts";

describe("a yearly rate", () => {
	it("becomes a monthly one by the twelfth root, not by dividing", () => {
		const factor = monthlyFactorOf(1000);
		expect(factor ** 12).toBeCloseTo(1.1, 10);
		// Dividing by twelve would give 1.008333, which is wrong by a car over twenty
		// years. The difference is small and the point is that it is not zero.
		expect(factor).toBeLessThan(1 + 0.1 / 12);
	});

	it("leaves money alone at no rate at all", () => {
		expect(futureValue({ initial: 100_000, monthly: 0, yearly: 0, months: 120 })).toBe(100_000);
	});
});

describe("money that grows", () => {
	it("adds what goes in and what the rate does, month by month", () => {
		const months = grow({ initial: 100_000, monthly: 50_000, yearly: 1200, months: 12 });

		expect(months).toHaveLength(12);
		expect(months[0]?.contributed).toBe(150_000);
		expect(months[11]?.contributed).toBe(700_000);
		expect(months[11]?.total).toBeGreaterThan(months[11]?.contributed ?? 0);
		expect(months[11]?.earned).toBe((months[11]?.total ?? 0) - (months[11]?.contributed ?? 0));
	});

	it("says when the growth starts to outrun what goes in", () => {
		const months = grow({ initial: 0, monthly: 100_000, yearly: 1000, months: 360 });
		const crossing = months.findIndex((month) => month.earned > month.contributed);

		// Somewhere in the second decade, which is the fact that makes people keep going.
		expect(crossing).toBeGreaterThan(120);
		expect(crossing).toBeLessThan(240);
	});

	it("counts the months to an amount, and says when there are none", () => {
		expect(
			monthsToReach({ initial: 0, monthly: 100_000, yearly: 0, months: 0, target: 1_000_000 }),
		).toBe(10);
		expect(
			monthsToReach({ initial: 2_000_000, monthly: 0, yearly: 0, months: 0, target: 1_000_000 }),
		).toBe(0);
		// Nothing put aside and no rate never arrives, and saying so is the answer.
		expect(monthsToReach({ initial: 0, monthly: 0, yearly: 0, months: 0, target: 1_000_000 })).toBe(
			null,
		);
	});
});

describe("the pile that pays for the months without working", () => {
	it("is a year of spending divided by what a year may take", () => {
		// Five thousand a month is sixty thousand a year, and at four per cent a year a
		// million and a half is the pile that pays for it.
		expect(independenceTarget({ monthlyExpense: 500_000, withdrawalRate: 400 })).toBe(150_000_000);
	});

	it("says how far along somebody is, and how long the pile lasts as it is", () => {
		const progress = independence({
			monthlyExpense: 500_000,
			withdrawalRate: 400,
			saved: 1_500_000,
			monthly: 200_000,
			yearly: 800,
		});

		expect(progress.target).toBe(150_000_000);
		expect(progress.percent).toBe(1);
		expect(progress.monthsCovered).toBe(3);
		expect(progress.months).toBeGreaterThan(0);
	});

	it("does not divide by a rate of nothing", () => {
		expect(independenceTarget({ monthlyExpense: 500_000, withdrawalRate: 0 })).toBe(0);
	});
});

describe("against what an index did", () => {
	it("grows the same money at the rates that were published", () => {
		// One per cent a month, three months, nothing added.
		const totals = growAtRates(1_000_000, [100, 100, 100]);
		expect(totals).toEqual([1_010_000, 1_020_100, 1_030_301]);
	});

	it("adds what goes in every month", () => {
		expect(growAtRates(0, [0, 0], 100_000)).toEqual([100_000, 200_000]);
	});
});

describe("whatever the numbers are", () => {
	it("never gives back something that is not a whole number of cents", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100_000_000 }),
				fc.integer({ min: 0, max: 1_000_000 }),
				fc.integer({ min: -5000, max: 30_000 }),
				fc.integer({ min: 0, max: 600 }),
				(initial, monthly, yearly, months) => {
					const value = futureValue({ initial, monthly, yearly, months });
					expect(Number.isSafeInteger(value)).toBe(true);
					expect(value).toBeGreaterThanOrEqual(0);
				},
			),
			{ numRuns: 300 },
		);
	});
});
