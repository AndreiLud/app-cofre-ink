import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MoneyError, money, sum } from "./money.ts";
import { allocateInstallments, splitByBasisPoints, splitByWeights, splitEvenly } from "./split.ts";

const amounts = fc.integer({ min: -100_000_000, max: 100_000_000 });
const counts = fc.integer({ min: 1, max: 60 });
const weights = fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 12 });

describe("splitEvenly", () => {
	it("gives parts that add up to the total, for any total", () => {
		fc.assert(
			fc.property(amounts, counts, (amount, parts) => {
				const total = money(amount);
				const pieces = splitEvenly(total, parts);
				expect(pieces).toHaveLength(parts);
				expect(sum(pieces).amount).toBe(amount);
			}),
		);
	});

	it("never lets two parts differ by more than one cent", () => {
		fc.assert(
			fc.property(amounts, counts, (amount, parts) => {
				const pieces = splitEvenly(money(amount), parts).map((piece) => piece.amount);
				expect(Math.max(...pieces) - Math.min(...pieces)).toBeLessThanOrEqual(1);
			}),
		);
	});

	it("splits a restaurant bill the way people expect", () => {
		expect(splitEvenly(money(10_000), 3).map((piece) => piece.amount)).toEqual([3334, 3333, 3333]);
	});

	it("refuses zero parts", () => {
		expect(() => splitEvenly(money(100), 0)).toThrow(MoneyError);
	});
});

describe("splitByWeights", () => {
	it("keeps the sum exact for any set of weights", () => {
		fc.assert(
			fc.property(amounts, weights, (amount, given) => {
				const pieces = splitByWeights(money(amount), given);
				expect(pieces).toHaveLength(given.length);
				expect(sum(pieces).amount).toBe(amount);
			}),
		);
	});

	it("divides the house bill by income", () => {
		// Ana earns six thousand, Joao earns four thousand, the market cost 543.21.
		const pieces = splitByWeights(money(54_321), [6000, 4000]);
		expect(pieces.map((piece) => piece.amount)).toEqual([32_593, 21_728]);
		expect(sum(pieces).amount).toBe(54_321);
	});

	it("refuses weights that add up to zero", () => {
		expect(() => splitByWeights(money(100), [0, 0])).toThrow(MoneyError);
	});
});

describe("splitByBasisPoints", () => {
	it("splits by percentage when the shares add up to one hundred", () => {
		const pieces = splitByBasisPoints(money(10_000), [3333, 3333, 3334]);
		expect(sum(pieces).amount).toBe(10_000);
	});

	it("refuses shares that do not add up to one hundred percent", () => {
		expect(() => splitByBasisPoints(money(10_000), [5000, 4000])).toThrow(MoneyError);
	});
});

describe("allocateInstallments", () => {
	it("keeps the sum equal to the purchase, for any purchase", () => {
		fc.assert(
			fc.property(amounts, counts, (amount, count) => {
				const pieces = allocateInstallments(money(amount), count);
				expect(pieces).toHaveLength(count);
				expect(sum(pieces).amount).toBe(amount);
			}),
		);
	});

	it("puts the leftover cents on the earliest installments", () => {
		const pieces = allocateInstallments(money(10_000), 3).map((piece) => piece.amount);
		expect(pieces).toEqual([3334, 3333, 3333]);
	});

	it("handles a purchase that divides exactly", () => {
		const pieces = allocateInstallments(money(12_000), 12).map((piece) => piece.amount);
		expect(new Set(pieces)).toEqual(new Set([1000]));
	});
});
