import { describe, expect, it } from "vitest";
import { type Product, productOf } from "./products.ts";
import { type HoldingFacts, QUANTITY_SCALE, valueOfHolding, worthByAccount } from "./valuation.ts";

const NO_SERIES = { cdiDaily: [], selicDaily: [], savings: [] };

function facts(product: string, more: Partial<HoldingFacts> = {}): HoldingFacts {
	return {
		product: productOf(product) as Product,
		indexer: null,
		rate: null,
		quantity: QUANTITY_SCALE,
		unitPrice: 0,
		cost: 0,
		boughtOn: null,
		writtenOn: "2026-09-01",
		maturesOn: null,
		anniversaryDay: null,
		...more,
	};
}

describe("what a holding is worth", () => {
	it("counts units at the newest price typed, with what was bought since", () => {
		const share = valueOfHolding({
			facts: facts("stock", { quantity: 10 * QUANTITY_SCALE, unitPrice: 2_500, cost: 25_000 }),
			prices: [{ day: "2026-10-20", unitPrice: 2_700 }],
			moves: [{ day: "2026-10-10", kind: "in", amount: 13_000, quantity: 5 * QUANTITY_SCALE }],
			series: NO_SERIES,
			on: "2026-10-28",
		});
		expect(share).toMatchObject({ value: 40_500, quantity: 15 * QUANTITY_SCALE, invested: 38_000 });
	});

	it("takes a value typed as it is, with what went in after it", () => {
		const pension = valueOfHolding({
			facts: facts("pension", { unitPrice: 900_000, cost: 900_000 }),
			prices: [{ day: "2026-10-01", unitPrice: 1_000_000 }],
			moves: [
				{ day: "2026-09-15", kind: "in", amount: 20_000, quantity: null },
				{ day: "2026-10-10", kind: "in", amount: 50_000, quantity: null },
			],
			series: NO_SERIES,
			on: "2026-10-28",
		});
		expect(pension.value).toBe(1_050_000);
	});

	it("estimates one that follows the CDI from what was put in, on its day", () => {
		const box = valueOfHolding({
			facts: facts("box", {
				indexer: "cdi",
				rate: 10_000,
				unitPrice: 1_000_000,
				cost: 1_000_000,
				boughtOn: "2026-09-28",
			}),
			prices: [],
			moves: [],
			series: {
				...NO_SERIES,
				cdiDaily: [
					{ day: "2026-09-28", rate: 5_078_800 },
					{ day: "2026-09-29", rate: 5_078_800 },
					{ day: "2026-09-30", rate: 5_078_800 },
				],
			},
			on: "2026-10-05",
		});
		expect(box).toMatchObject({
			value: 1_001_524,
			estimated: true,
			estimatedThrough: "2026-09-30",
		});
	});

	it("adds up the holdings of an account, and leaves out an account with none", () => {
		expect(
			worthByAccount([
				{ accountId: "corretora", value: 480_000 },
				{ accountId: "corretora", value: 50_000 },
			]),
		).toEqual({ corretora: 530_000 });
	});
});
