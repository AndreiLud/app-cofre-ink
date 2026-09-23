import { describe, expect, it } from "vitest";
import type { MonthlyTotals, Snapshot } from "./findings.ts";
import { type Movement, type MovementCode, trendOf } from "./trend.ts";

const STEADY: MonthlyTotals[] = [
	{ month: "2026-08", income: 600_000, expense: 500_000 },
	{ month: "2026-07", income: 600_000, expense: 500_000 },
	{ month: "2026-06", income: 600_000, expense: 500_000 },
	{ month: "2026-05", income: 600_000, expense: 500_000 },
	{ month: "2026-04", income: 600_000, expense: 500_000 },
	{ month: "2026-03", income: 600_000, expense: 500_000 },
];

/** Six closed months, which is the least that can be cut into two windows. */
function household(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 500_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 500_000 },
		before: STEADY.map((month) => ({ ...month })),
		categories: [],
		budgets: [],
		goals: [],
		repeating: [],
		pending: [],
		possibleRepeats: [],
		netByMonth: [],
		invoices: [],
		instalments: [],
		incomeSources: [],
		longer: [],
		inflation: null,
	};
}

function movement(trend: ReturnType<typeof trendOf>, code: MovementCode): Movement {
	const found = trend?.movements.find((one) => one.code === code);
	if (!found) throw new Error(`no movement ${code}`);
	return found;
}

describe("comparing two windows", () => {
	it("says nothing until there are six closed months to cut in half", () => {
		const snapshot = household();
		snapshot.before = STEADY.slice(0, 5);
		expect(trendOf(snapshot)).toBeNull();

		expect(trendOf(household())?.months).toBe(3);
		expect(trendOf(household())?.since).toBe("2026-06");
	});

	it("calls a steady household steady, on every line", () => {
		const trend = trendOf(household());
		expect(trend?.movements.map((one) => one.direction)).toEqual(["same", "same", "same", "same"]);
	});

	it("reads spending less as better and earning less as worse", () => {
		const snapshot = household();
		// The three months just gone: two hundred less out, five hundred less in.
		snapshot.before = snapshot.before.map((month, index) =>
			index < 3 ? { ...month, income: 550_000, expense: 480_000 } : month,
		);

		const trend = trendOf(snapshot);
		expect(movement(trend, "expense").difference).toBe(-20_000);
		expect(movement(trend, "expense").direction).toBe("better");
		expect(movement(trend, "income").difference).toBe(-50_000);
		expect(movement(trend, "income").direction).toBe("worse");

		// What an ordinary month keeps: seven hundred now against a thousand before.
		expect(movement(trend, "kept").before).toBe(100_000);
		expect(movement(trend, "kept").now).toBe(70_000);
		expect(movement(trend, "kept").direction).toBe("worse");
	});
});

describe("the balance before", () => {
	/**
	 * The records hold what somebody has now. What they had in June is this walked
	 * backwards through every movement of the accounts they spend from.
	 */
	it("is today's balance with everything since then undone", () => {
		const snapshot = household();
		snapshot.onHand = 500_000;
		snapshot.netByMonth = [
			{ month: "2026-09", net: 50_000 },
			{ month: "2026-08", net: 100_000 },
			{ month: "2026-07", net: 100_000 },
			{ month: "2026-06", net: 100_000 },
			// Older than the window this compares, so it is not undone.
			{ month: "2026-05", net: 900_000 },
		];

		const trend = trendOf(snapshot);
		expect(movement(trend, "onHand").before).toBe(150_000);
		expect(movement(trend, "onHand").now).toBe(500_000);
		expect(movement(trend, "onHand").direction).toBe("better");

		// The sentence somebody remembers: months of cover, then and now, measured with
		// the same ordinary month on both sides.
		expect(trend?.coverBefore).toBe(3);
		expect(trend?.coverNow).toBe(10);
	});

	/**
	 * Money moved into an investment leaves the accounts somebody spends from without
	 * being spent. A balance walked back without it would say they saved less than they
	 * did, which is the one direction a tool like this must never be wrong in.
	 */
	it("counts money moved aside, and not only money spent", () => {
		const snapshot = household();
		snapshot.onHand = 200_000;
		// Kept a thousand a month and moved eight hundred of it into an investment.
		snapshot.netByMonth = [
			{ month: "2026-09", net: 20_000 },
			{ month: "2026-08", net: 20_000 },
			{ month: "2026-07", net: 20_000 },
			{ month: "2026-06", net: 20_000 },
		];

		expect(movement(trendOf(snapshot), "onHand").before).toBe(120_000);
	});
});
