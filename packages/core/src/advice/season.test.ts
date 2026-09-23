import { describe, expect, it } from "vitest";
import type { MonthlyTotals, Snapshot } from "./findings.ts";
import { seasonFrom } from "./season.ts";

/** Twelve closed months at four thousand a month, most recent first. */
function year(): MonthlyTotals[] {
	return [
		"2026-08",
		"2026-07",
		"2026-06",
		"2026-05",
		"2026-04",
		"2026-03",
		"2026-02",
		"2026-01",
		"2025-12",
		"2025-11",
		"2025-10",
		"2025-09",
	].map((month) => ({ month, income: 600_000, expense: 400_000 }));
}

function household(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 900_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 400_000 },
		before: year().slice(0, 6),
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
		longer: year(),
		inflation: null,
	};
}

/** Puts one month of the year behind at an amount, leaving the rest alone. */
function heavier(snapshot: Snapshot, month: string, expense: number) {
	snapshot.longer = snapshot.longer.map((one) => (one.month === month ? { ...one, expense } : one));
}

describe("the dearer months", () => {
	it("says nothing until there is a year of closed months to read", () => {
		const snapshot = household();
		snapshot.longer = year().slice(0, 11);
		expect(seasonFrom(snapshot)).toBeNull();
	});

	it("finds nothing in a year where every month cost the same", () => {
		expect(seasonFrom(household())?.heavy).toEqual([]);
	});

	it("turns a month that cost more into what it costs a month from here", () => {
		const snapshot = household();
		// January, which is where a car tax lands.
		heavier(snapshot, "2026-01", 900_000);

		const found = seasonFrom(snapshot)?.heavy ?? [];
		expect(found).toHaveLength(1);
		expect(found[0]?.was).toBe("2026-01");
		expect(found[0]?.next).toBe("2027-01");
		expect(found[0]?.over).toBe(500_000);
		// Four months from September, so twelve hundred and fifty a month.
		expect(found[0]?.away).toBe(4);
		expect(found[0]?.everyMonth).toBe(125_000);
	});

	it("puts the soonest one first, which is the order somebody can act in", () => {
		const snapshot = household();
		heavier(snapshot, "2025-12", 800_000);
		heavier(snapshot, "2026-03", 700_000);

		// The December just gone comes round again in three months, the March in six.
		expect(seasonFrom(snapshot)?.heavy.map((one) => one.next)).toEqual(["2026-12", "2027-03"]);
		expect(seasonFrom(snapshot)?.heavy.map((one) => one.away)).toEqual([3, 6]);
	});

	it("leaves alone a month that was merely a little dearer", () => {
		const snapshot = household();
		heavier(snapshot, "2026-01", 430_000);
		expect(seasonFrom(snapshot)?.heavy).toEqual([]);
	});
});
