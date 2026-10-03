import { describe, expect, it } from "vitest";
import {
	benefitState,
	carriesByDefault,
	daysToLanding,
	landingsBetween,
	landingsOf,
	nextLandingOf,
	periodOf,
	type Quota,
	type QuotaVersion,
} from "./benefit.ts";

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

/** A card with one allowance, never changed, written down on a day, with what happened on it. */
function stateOf(input: {
	quota: Quota;
	today: string;
	openedOn: string;
	openingBalance: number;
	spent?: [string, number][];
}) {
	return benefitState({
		versions: [{ ...input.quota, since: null }],
		start: {
			on: input.openedOn,
			amount: input.openingBalance === 0 ? null : input.openingBalance,
		},
		movements: (input.spent ?? []).map(([on, amount]) => ({ on, amount, kind: "spent" as const })),
		today: input.today,
	});
}

describe("when the next allowance lands", () => {
	it("says the day it lands and how many days off it is", () => {
		const state = stateOf({
			quota: { amount: 90_000, day: 5, carries: true },
			today: "2026-10-25",
			openedOn: "2026-08-10",
			openingBalance: 0,
		});

		expect(state.landsOn).toBe("2026-11-05");
		expect(state.daysToLanding).toBe(11);
		expect(state.carries).toBe(true);
	});

	it("counts at least one day, because the landing day starts a period rather than ending one", () => {
		expect(daysToLanding("2026-11-04", 5)).toBe(1);
		expect(daysToLanding("2026-11-05", 5)).toBe(30);
	});

	it("lands on the last day of a month too short for the day", () => {
		expect(nextLandingOf("2026-03-01", 31)).toBe("2026-03-31");
	});

	it("says a card that does not carry will lose what is left", () => {
		const fare = stateOf({
			quota: { amount: 30_000, day: 1, carries: false },
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 0,
		});

		expect(fare.carries).toBe(false);
		expect(fare.landsOn).toBe("2026-12-01");
	});
});

describe("what is left on a card that carries", () => {
	const meal = { amount: 90_000, day: 5, carries: true };

	it("is what was typed, less what has gone, before the first landing", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 64_500,
			spent: [["2026-09-15", 4_500]],
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
		const state = stateOf({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 0,
			spent: [["2026-09-12", 12_000]],
		});
		// The one that landed on the fifth, which is the period the tenth falls in.
		expect(state.landed).toBe(1);
		expect(state.left).toBe(90_000 - 12_000);
	});

	// Part 1, B.1 of the request for 2.0.0, with its numbers: written down on the twenty
	// eighth, credited on the fifth, a lunch of 56 on the twenty fourth. The landing of the
	// fifth counted and the lunch, before the card was written down, did not: 900 of 900.
	it("counts the purchases of that period too, from the day the money landed", () => {
		const lunch: [string, number][] = [["2026-10-24", 5_600]];
		const now = stateOf({
			quota: meal,
			today: "2026-10-28",
			openedOn: "2026-10-28",
			openingBalance: 0,
			spent: lunch,
		});
		expect(now.left).toBe(84_400);

		// And the next landing adds to it, on a card that carries.
		const next = stateOf({
			quota: meal,
			today: "2026-11-05",
			openedOn: "2026-10-28",
			openingBalance: 0,
			spent: lunch,
		});
		expect(next.left).toBe(174_400);
	});

	it("leaves out a purchase from before the period it was written down in", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-10-28",
			openedOn: "2026-10-28",
			openingBalance: 0,
			spent: [["2026-10-01", 5_600]],
		});
		expect(state.left).toBe(90_000);
	});

	/** And the next landing adds to it, rather than starting again. */
	it("goes on adding after that first one", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-10-06",
			openedOn: "2026-09-10",
			openingBalance: 0,
			spent: [["2026-09-12", 12_000]],
		});
		expect(state.landed).toBe(2);
		expect(state.left).toBe(180_000 - 12_000);
	});

	it("adds every landing since, and takes off everything spent since", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 64_500,
			spent: [
				["2026-09-20", 60_000],
				["2026-10-20", 60_000],
				["2026-11-10", 30_000],
			],
		});
		// Two landings, October and November.
		expect(state.landed).toBe(2);
		expect(state.left).toBe(64_500 + 180_000 - 150_000);
	});

	it("goes negative rather than stopping at nothing, because the card did", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 10_000,
			spent: [["2026-09-11", 15_000]],
		});
		expect(state.left).toBe(-5_000);
	});

	it("leaves out what happens after today", () => {
		const state = stateOf({
			quota: meal,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 10_000,
			spent: [["2026-09-25", 5_000]],
		});
		expect(state.left).toBe(10_000);
	});
});

describe("what is left on a card that does not carry", () => {
	const fare = { amount: 30_000, day: 1, carries: false };

	it("is what was typed, less what has gone, before the first landing", () => {
		const state = stateOf({
			quota: fare,
			today: "2026-09-20",
			openedOn: "2026-09-10",
			openingBalance: 22_000,
			spent: [["2026-09-12", 2_000]],
		});
		expect(state.left).toBe(20_000);
	});

	it("forgets everything before the last landing", () => {
		const state = stateOf({
			quota: fare,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 22_000,
			spent: [
				["2026-09-20", 492_000],
				["2026-11-05", 8_000],
			],
		});
		expect(state.left).toBe(22_000);
	});

	it("says which period the answer is about", () => {
		const state = stateOf({
			quota: fare,
			today: "2026-11-20",
			openedOn: "2026-09-10",
			openingBalance: 0,
		});
		expect(state.from).toBe("2026-11-01");
		expect(state.to).toBe("2026-11-30");
	});
});

// Decision 4 of 2.0.0: a change applies from the next landing on.
describe("an allowance that changed", () => {
	it("lands each month with the amount in force on its own day", () => {
		const versions: QuotaVersion[] = [
			{ amount: 90_000, day: 5, carries: true, since: null },
			{ amount: 100_000, day: 5, carries: true, since: "2026-11-05" },
		];
		expect(landingsOf(versions, "2026-09-04", "2026-11-05")).toEqual([
			{ on: "2026-09-05", amount: 90_000 },
			{ on: "2026-10-05", amount: 90_000 },
			{ on: "2026-11-05", amount: 100_000 },
		]);
	});

	it("lands once in the month its day changed, on the new day", () => {
		const versions: QuotaVersion[] = [
			{ amount: 90_000, day: 5, carries: true, since: null },
			{ amount: 90_000, day: 10, carries: true, since: "2026-10-10" },
		];
		expect(landingsOf(versions, "2026-08-31", "2026-11-30").map((one) => one.on)).toEqual([
			"2026-09-05",
			"2026-10-10",
			"2026-11-10",
		]);
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
