import { describe, expect, it } from "vitest";
import { benefitState, carriesByDefault, landingsBetween, periodOf } from "./benefit.ts";

describe("which period a day falls in", () => {
	it("starts the period on the day the money lands", () => {
		expect(periodOf("2026-09-05", 5)).toEqual({ from: "2026-09-05", to: "2026-10-04" });
	});

	it("puts a day before the landing day in the period that started last month", () => {
		expect(periodOf("2026-09-04", 5)).toEqual({ from: "2026-08-05", to: "2026-09-04" });
	});

	it("lands on the last day of a month too short for the day", () => {
		expect(periodOf("2026-03-01", 31)).toEqual({ from: "2026-02-28", to: "2026-03-30" });
	});

	it("crosses the turn of the year", () => {
		expect(periodOf("2026-01-03", 10)).toEqual({ from: "2025-12-10", to: "2026-01-09" });
	});

	it("refuses a day that is not a day of the month", () => {
		expect(() => periodOf("2026-09-05", 0)).toThrow(RangeError);
		expect(() => periodOf("2026-09-05", 32)).toThrow(RangeError);
	});
});

describe("how many allowances have landed", () => {
	it("counts none inside the period the card was written down in", () => {
		expect(landingsBetween("2026-09-10", "2026-09-20", 5)).toBe(0);
		expect(landingsBetween("2026-09-10", "2026-10-04", 5)).toBe(0);
	});

	it("counts one on the landing day itself", () => {
		expect(landingsBetween("2026-09-10", "2026-10-05", 5)).toBe(1);
	});

	it("counts a year of them", () => {
		expect(landingsBetween("2025-09-10", "2026-09-06", 5)).toBe(12);
	});

	it("counts none backwards", () => {
		expect(landingsBetween("2026-09-10", "2026-08-10", 5)).toBe(0);
	});
});

describe("what is left on a card that carries", () => {
	const meal = { amount: 90_000, day: 5, carries: true };

	it("is what was typed, less what has gone, before the first landing", () => {
		const state = benefitState({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 64_500,
			spentSinceOpening: 4_500,
			spentThisPeriod: 4_500,
		});
		expect(state.landed).toBe(0);
		expect(state.left).toBe(60_000);
	});

	/**
	 * A card written down with nothing typed on it, which is every card written down since
	 * the form stopped asking for an opening balance.
	 *
	 * The allowance of the period somebody is standing in counts, because there is no typed
	 * number standing in for it. Without this a card written down on the twentieth read as
	 * empty until the fifth of the next month, and what is in somebody's pocket on the
	 * twentieth is not nothing.
	 */
	it("counts the allowance of the period it was written down in, when nothing was typed", () => {
		const state = benefitState({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 0,
			spentSinceOpening: 12_000,
			spentThisPeriod: 12_000,
		});
		// The one that landed on the fifth, which is the period the tenth falls in.
		expect(state.landed).toBe(1);
		expect(state.left).toBe(90_000 - 12_000);
	});

	/** And the next landing adds to it, rather than starting again. */
	it("goes on adding after that first one", () => {
		const state = benefitState({
			quota: meal,
			today: "2026-10-06",
			openedOn: "2026-09-10",
			openingBalance: 0,
			spentSinceOpening: 12_000,
			spentThisPeriod: 0,
		});
		expect(state.landed).toBe(2);
		expect(state.left).toBe(180_000 - 12_000);
	});

	it("adds every landing since, and takes off everything spent since", () => {
		const state = benefitState({
			quota: meal,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 64_500,
			spentSinceOpening: 150_000,
			spentThisPeriod: 30_000,
		});
		// Two landings, October and November.
		expect(state.landed).toBe(2);
		expect(state.left).toBe(64_500 + 180_000 - 150_000);
	});

	it("goes negative rather than stopping at nothing, because the card did", () => {
		const state = benefitState({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 10_000,
			spentSinceOpening: 15_000,
			spentThisPeriod: 15_000,
		});
		expect(state.left).toBe(-5_000);
	});
});

describe("what is left on a card that does not carry", () => {
	const fare = { amount: 30_000, day: 1, carries: false };

	it("is what was typed, less what has gone, before the first landing", () => {
		const state = benefitState({
			quota: fare,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 22_000,
			spentSinceOpening: 2_000,
			spentThisPeriod: 2_000,
		});
		expect(state.left).toBe(20_000);
	});

	it("forgets everything before the last landing", () => {
		const state = benefitState({
			quota: fare,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 22_000,
			spentSinceOpening: 500_000,
			spentThisPeriod: 8_000,
		});
		expect(state.left).toBe(22_000);
	});

	it("says which period the answer is about", () => {
		const state = benefitState({
			quota: fare,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 0,
			spentSinceOpening: 0,
			spentThisPeriod: 0,
		});
		expect(state.from).toBe("2026-11-01");
		expect(state.to).toBe("2026-11-30");
	});
});

describe("what a kind of benefit does by default", () => {
	it("keeps what was not eaten", () => {
		expect(carriesByDefault("meal")).toBe(true);
	});

	it("does not keep what was not travelled", () => {
		expect(carriesByDefault("transport")).toBe(false);
	});

	it("keeps it for the others, which behave like the meal card", () => {
		expect(carriesByDefault("culture")).toBe(true);
		expect(carriesByDefault("mobility")).toBe(true);
	});
});
