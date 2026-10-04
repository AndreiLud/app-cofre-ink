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

	it("counts money put in after a value typed on the same day, and not before it", () => {
		const box = (writtenAt: number) =>
			valueOfHolding({
				facts: facts("box", { indexer: "cdi", rate: 10_000, unitPrice: 100_000 }),
				prices: [{ day: "2026-10-28", unitPrice: 100_000, writtenAt: 1_000 }],
				moves: [{ day: "2026-10-28", kind: "in", amount: 50_000, quantity: null, writtenAt }],
				series: NO_SERIES,
				on: "2026-10-28",
			}).value;
		// Typed after the deposit, the value already had it; typed before, it did not.
		expect(box(500)).toBe(100_000);
		expect(box(2_000)).toBe(150_000);
		// The same moment, on a clock that did not move between the two writes: the money put in
		// is not lost (a caixinha of R$ 1.000,00 written down and given R$ 500,00 at once read
		// R$ 1.000,00 and a loss of R$ 500,00).
		expect(box(1_000)).toBe(150_000);
	});

	it("is an estimate only once a day of the index went into it", () => {
		const typedToday = valueOfHolding({
			facts: facts("box", { indexer: "cdi", rate: 10_000, unitPrice: 100_000 }),
			prices: [{ day: "2026-10-28", unitPrice: 100_000, writtenAt: 1_000 }],
			moves: [],
			series: {
				...NO_SERIES,
				cdiDaily: [{ day: "2026-09-30", rate: 5_078_800 }],
			},
			on: "2026-10-28",
		});
		// Nothing published after the value typed: the value typed, and not "calculated up to"
		// the day it was typed on.
		expect(typedToday).toMatchObject({
			value: 100_000,
			estimated: false,
			estimatedThrough: null,
		});
	});

	// Found reading the code for the report of 2.0.0: a Tesouro Selic of three units at R$
	// 1.523,40 follows the Selic, and the price of one unit its purchase writes down, or any price
	// typed for it later, was read as the value of the whole holding, so it was worth R$ 1.523,40
	// instead of R$ 4.570,20.
	it("reads a price typed for a product counted in units as the price of one unit", () => {
		const selic = (
			prices: { day: "2026-10-28" | "2026-10-20"; unitPrice: number; writtenAt: number }[],
			moves: Parameters<typeof valueOfHolding>[0]["moves"] = [],
		) =>
			valueOfHolding({
				facts: facts("treasurySelic", {
					indexer: "selic",
					quantity: 3 * QUANTITY_SCALE,
					unitPrice: 152_340,
					cost: 450_000,
					writtenOn: "2026-10-01",
				}),
				prices,
				moves,
				series: NO_SERIES,
				on: "2026-10-28",
			}).value;
		expect(selic([{ day: "2026-10-28", unitPrice: 152_340, writtenAt: 1_000 }])).toBe(457_020);
		expect(selic([{ day: "2026-10-28", unitPrice: 160_000, writtenAt: 1_000 }])).toBe(480_000);
		// A unit bought before the price was typed is one of the units it prices.
		expect(
			selic(
				[{ day: "2026-10-20", unitPrice: 160_000, writtenAt: 2_000 }],
				[
					{
						day: "2026-10-10",
						kind: "in",
						amount: 155_000,
						quantity: QUANTITY_SCALE,
						writtenAt: 500,
					},
				],
			),
		).toBe(640_000);
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
