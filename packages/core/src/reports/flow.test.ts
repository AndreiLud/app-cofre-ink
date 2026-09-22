import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { balanceFlow, sharesOf } from "./flow.ts";

const item = (key: string, amount: number) => ({ key, label: key, amount });

describe("balancing what came in against what went out", () => {
	it("adds what was left over to the side that went out", () => {
		const flow = balanceFlow([item("salary", 600_000)], [item("rent", 150_000)]);

		expect(flow.leftOver).toBe(450_000);
		expect(flow.fromReserves).toBe(0);
		expect(flow.destinations.map((one) => one.key)).toEqual(["rent", "leftOver"]);
		expect(flow.total).toBe(600_000);
	});

	it("says when the month spent more than it earned", () => {
		const flow = balanceFlow([item("salary", 100_000)], [item("rent", 150_000)]);

		expect(flow.fromReserves).toBe(50_000);
		expect(flow.leftOver).toBe(0);
		expect(flow.sources.map((one) => one.key)).toEqual(["fromReserves", "salary"]);
		expect(flow.total).toBe(150_000);
	});

	it("leaves out what is zero, because a line of nothing says nothing", () => {
		const flow = balanceFlow(
			[item("salary", 100_000), item("refunds", 0)],
			[item("rent", 100_000), item("gifts", 0)],
		);

		expect(flow.sources.map((one) => one.key)).toEqual(["salary"]);
		expect(flow.destinations.map((one) => one.key)).toEqual(["rent"]);
		expect(flow.leftOver).toBe(0);
	});

	it("always adds up to the same number on both sides", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 5_000_000 }), { maxLength: 8 }),
				fc.array(fc.integer({ min: 0, max: 5_000_000 }), { maxLength: 8 }),
				(income, spending) => {
					const flow = balanceFlow(
						income.map((amount, index) => item(`in${index}`, amount)),
						spending.map((amount, index) => item(`out${index}`, amount)),
					);

					const left = flow.sources.reduce((sum, one) => sum + one.amount, 0);
					const right = flow.destinations.reduce((sum, one) => sum + one.amount, 0);

					expect(left).toBe(right);
					expect(left).toBe(flow.total);
					expect(flow.leftOver === 0 || flow.fromReserves === 0).toBe(true);
				},
			),
		);
	});
});

describe("the share of each line", () => {
	it("adds up to one", () => {
		const shares = sharesOf([item("a", 250), item("b", 750)]);
		expect(shares.get("a")).toBeCloseTo(0.25);
		expect(shares.get("b")).toBeCloseTo(0.75);
	});

	it("says zero for everything when there is nothing", () => {
		const shares = sharesOf([item("a", 0)]);
		expect(shares.get("a")).toBe(0);
	});
});
