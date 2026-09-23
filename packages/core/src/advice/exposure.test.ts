import { describe, expect, it } from "vitest";
import { exposureFrom } from "./exposure.ts";
import type { Snapshot } from "./findings.ts";

const MONTHS = ["2026-08", "2026-07", "2026-06", "2026-05"];

/** Six thousand in and four out, with nine thousand on hand. */
function household(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 900_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 400_000 },
		before: MONTHS.map((month) => ({ month, income: 600_000, expense: 400_000 })),
		categories: [],
		budgets: [],
		goals: [],
		repeating: [],
		pending: [],
		possibleRepeats: [],
		netByMonth: [],
		invoices: [],
		instalments: [],
		incomeSources: MONTHS.map((month) => ({ name: "salario", month, amount: 600_000 })),
		longer: [],
		inflation: null,
	};
}

describe("where the money comes from", () => {
	it("says nothing when nothing came in, or when there is too little history", () => {
		const nothing = household();
		nothing.incomeSources = [];
		expect(exposureFrom(nothing)).toBeNull();

		const young = household();
		young.before = young.before.slice(0, 2);
		expect(exposureFrom(young)).toBeNull();
	});

	/**
	 * One job is what most people have and it is not a fault. The useful part is not the
	 * hundred per cent, it is the number underneath it.
	 */
	it("reads one salary as the whole of it, and says how long the money would last", () => {
		const exposure = exposureFrom(household());

		expect(exposure?.concentration).toBe(100);
		expect(exposure?.without).toBe(0);
		// Nine thousand on hand against four thousand a month is two months and a quarter.
		expect(exposure?.lasts).toBe(23);
	});

	it("counts what else would still come in, which is what makes the test worth doing", () => {
		const snapshot = household();
		snapshot.incomeSources = [
			...snapshot.incomeSources,
			...MONTHS.map((month) => ({ name: "aluguel", month, amount: 300_000 })),
		];

		const exposure = exposureFrom(snapshot);
		expect(exposure?.sources.map((one) => one.name)).toEqual(["salario", "aluguel"]);
		expect(exposure?.sources[1]?.share).toBe(33);
		expect(exposure?.concentration).toBe(67);
		// Three thousand still comes in, so only a thousand a month has to be covered.
		expect(exposure?.without).toBe(300_000);
		expect(exposure?.lasts).toBe(90);
	});

	it("says nothing about lasting when what is left already covers the month", () => {
		const snapshot = household();
		snapshot.incomeSources = [
			...snapshot.incomeSources,
			...MONTHS.map((month) => ({ name: "aluguel", month, amount: 500_000 })),
		];
		expect(exposureFrom(snapshot)?.lasts).toBeNull();
	});

	/**
	 * A bit of freelance that landed twice in six months is not income anybody can plan
	 * around, and calling it income would say the household is less exposed than it is.
	 */
	it("counts the months a source brought nothing, so a windfall is not a wage", () => {
		const snapshot = household();
		snapshot.incomeSources = [
			...snapshot.incomeSources,
			{ name: "freela", month: "2026-08", amount: 400_000 },
		];

		const exposure = exposureFrom(snapshot);
		expect(exposure?.sources.map((one) => one.name)).toEqual(["salario"]);
		expect(exposure?.concentration).toBe(100);
	});
});
