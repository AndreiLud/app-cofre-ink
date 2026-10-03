import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvoiceSplitError, invoiceSplit } from "./invoiceSplit.ts";

describe("an invoice paid over time", () => {
	// Part 2, C.4.4 and C.14.1 of the request for 2.0.0: R$ 3.000,00 owed, an entry of R$ 500,00
	// and six parts of R$ 480,00.
	it("spreads what was owed and what it costs over the parts, to the cent", () => {
		const split = invoiceSplit({
			owed: 300_000,
			entry: 50_000,
			parts: 6,
			amount: 48_000,
			eachPart: true,
		});
		expect(split.financed).toBe(250_000);
		expect(split.principal).toEqual([41_667, 41_667, 41_667, 41_667, 41_666, 41_666]);
		expect(split.cost).toEqual([6_333, 6_333, 6_333, 6_333, 6_334, 6_334]);
		expect(split.totalCost).toBe(38_000);
	});

	// Part 2, C.3.4: A owes R$ 2.000,00 and B charges R$ 2.100,00 in three.
	it("reads a total for all the parts the same way", () => {
		const split = invoiceSplit({
			owed: 200_000,
			entry: 0,
			parts: 3,
			amount: 210_000,
			eachPart: false,
		});
		expect(split.each).toEqual([70_000, 70_000, 70_000]);
		expect(split.principal).toEqual([66_667, 66_667, 66_666]);
		expect(split.cost).toEqual([3_333, 3_333, 3_334]);
	});

	it("refuses parts that pay less than is owed, and an entry above it", () => {
		expect(() =>
			invoiceSplit({ owed: 300_000, entry: 50_000, parts: 6, amount: 40_000, eachPart: true }),
		).toThrow(InvoiceSplitError);
		expect(() =>
			invoiceSplit({ owed: 300_000, entry: 300_001, parts: 6, amount: 48_000, eachPart: true }),
		).toThrow(InvoiceSplitError);
		expect(() =>
			invoiceSplit({ owed: 300_000, entry: 0, parts: 49, amount: 10_000, eachPart: true }),
		).toThrow(InvoiceSplitError);
	});

	it("accepts a split that costs nothing", () => {
		const split = invoiceSplit({
			owed: 90_000,
			entry: 0,
			parts: 3,
			amount: 90_000,
			eachPart: false,
		});
		expect(split.totalCost).toBe(0);
		expect(split.cost).toEqual([0, 0, 0]);
	});

	it("always pays back exactly what was owed, and charges exactly what the bank said", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 10_000_000 }),
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 1, max: 48 }),
				fc.integer({ min: 0, max: 50 }),
				(owed, entryShare, parts, extraShare) => {
					const entry = Math.floor((owed * entryShare) / 100);
					const financed = owed - entry;
					const total = financed + Math.floor((financed * extraShare) / 100);
					const split = invoiceSplit({ owed, entry, parts, amount: total, eachPart: false });
					expect(split.principal.reduce((sum, part) => sum + part, 0)).toBe(financed);
					expect(split.each.reduce((sum, part) => sum + part, 0)).toBe(total);
					expect(split.cost.every((part) => part >= 0)).toBe(true);
				},
			),
		);
	});
});
