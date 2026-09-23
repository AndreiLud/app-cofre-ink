import { describe, expect, it } from "vitest";
import { commitmentsFrom } from "./commitments.ts";
import type { Snapshot } from "./findings.ts";

/** Six thousand in, five out, so an ordinary month leaves a thousand over. */
function household(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 500_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 500_000 },
		before: [
			{ month: "2026-08", income: 600_000, expense: 500_000 },
			{ month: "2026-07", income: 600_000, expense: 500_000 },
			{ month: "2026-06", income: 600_000, expense: 500_000 },
		],
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

describe("the card", () => {
	it("says nothing at all to somebody who does not use one", () => {
		expect(commitmentsFrom(household())).toBeNull();
	});

	it("reads an ordinary invoice out of the closed ones, and what share of the month it is", () => {
		const snapshot = household();
		snapshot.invoices = [
			{ month: "2026-08", amount: 180_000 },
			{ month: "2026-07", amount: 150_000 },
			{ month: "2026-06", amount: 150_000 },
		];

		const card = commitmentsFrom(snapshot);
		expect(card?.usual).toBe(150_000);
		expect(card?.latest).toBe(180_000);
		// Fifteen hundred against six thousand coming in.
		expect(card?.shareOfIncome).toBe(25);
		expect(card?.direction).toBe("rising");
	});

	it("does not call a card that moved a little a direction", () => {
		const snapshot = household();
		snapshot.invoices = [
			{ month: "2026-08", amount: 157_000 },
			{ month: "2026-07", amount: 150_000 },
			{ month: "2026-06", amount: 150_000 },
		];
		expect(commitmentsFrom(snapshot)?.direction).toBe("steady");
	});
});

describe("the months already bought", () => {
	it("adds up what instalments take from each month ahead, and when they end", () => {
		const snapshot = household();
		snapshot.instalments = [
			{ month: "2026-10", amount: 60_000 },
			{ month: "2026-11", amount: 60_000 },
			{ month: "2026-12", amount: 40_000 },
		];

		const card = commitmentsFrom(snapshot);
		expect(card?.aheadTotal).toBe(160_000);
		expect(card?.lastMonth).toBe("2026-12");
		// A thousand a month left over covers every one of them.
		expect(card?.tight).toBe(0);
	});

	/**
	 * The one flag here, and it is derived rather than decided: a month whose
	 * instalments are already more than an ordinary month leaves over is a month that
	 * was spent before it began.
	 */
	it("names a month that is already spent past what a month leaves over", () => {
		const snapshot = household();
		snapshot.instalments = [
			{ month: "2026-10", amount: 60_000 },
			{ month: "2026-11", amount: 150_000 },
		];

		const card = commitmentsFrom(snapshot);
		expect(card?.tight).toBe(1);
		expect(card?.ahead[1]?.overSurplus).toBe(true);
	});

	it("counts every month ahead as tight when the month itself leaves nothing over", () => {
		const snapshot = household();
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 650_000 }));
		snapshot.instalments = [{ month: "2026-10", amount: 10_000 }];

		expect(commitmentsFrom(snapshot)?.tight).toBe(1);
	});
});
