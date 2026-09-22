import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { balancesBetween, divide, SplitError, settleUp } from "./split.ts";

const ana = { userId: "ana", monthlyIncome: 600_000, weight: 2 };
const joao = { userId: "joao", monthlyIncome: 400_000, weight: 1 };

describe("dividing one expense", () => {
	it("splits evenly, to the cent", () => {
		const parts = divide(10_000, "evenly", [ana, joao]);
		expect(parts.map((part) => part.amount)).toEqual([5000, 5000]);
	});

	it("gives the odd cent away in a fixed order", () => {
		const parts = divide(10_001, "evenly", [ana, joao]);
		expect(parts.map((part) => part.amount)).toEqual([5001, 5000]);
		expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(10_001);
	});

	it("splits by shares", () => {
		const parts = divide(30_000, "shares", [ana, joao]);
		expect(parts.map((part) => part.amount)).toEqual([20_000, 10_000]);
	});

	it("splits in proportion to what each one earns", () => {
		const parts = divide(100_000, "income", [ana, joao]);
		expect(parts.map((part) => part.amount)).toEqual([60_000, 40_000]);
	});

	it("refuses when there is nothing to divide by", () => {
		expect(() => divide(1000, "income", [{ userId: "ana" }, { userId: "joao" }])).toThrow(
			SplitError,
		);
		expect(() => divide(1000, "evenly", [])).toThrow(SplitError);
		expect(() => divide(0, "evenly", [ana])).toThrow(SplitError);
	});

	it("always adds up to the total, whatever the amount and the shares", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 99_999_999 }),
				fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 8 }),
				(total, weights) => {
					const people = weights.map((weight, index) => ({
						userId: `person${index}`,
						weight,
					}));
					const parts = divide(total, "shares", people);
					expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(total);
					expect(parts.every((part) => part.amount >= 0)).toBe(true);
				},
			),
		);
	});
});

describe("who owes whom", () => {
	it("counts what one person paid for everybody", () => {
		const balances = balancesBetween([
			{ amount: 10_000, paidBy: "ana", parts: divide(10_000, "evenly", [ana, joao]) },
		]);
		expect(balances.get("ana")).toBe(5000);
		expect(balances.get("joao")).toBe(-5000);
	});

	it("evens out when both paid their share of different things", () => {
		const balances = balancesBetween([
			{ amount: 10_000, paidBy: "ana", parts: divide(10_000, "evenly", [ana, joao]) },
			{ amount: 10_000, paidBy: "joao", parts: divide(10_000, "evenly", [ana, joao]) },
		]);
		expect(balances.get("ana")).toBe(0);
		expect(balances.get("joao")).toBe(0);
	});

	it("moves the debt when somebody pays it back", () => {
		const balances = balancesBetween(
			[{ amount: 10_000, paidBy: "ana", parts: divide(10_000, "evenly", [ana, joao]) }],
			[{ fromUserId: "joao", toUserId: "ana", amount: 5000 }],
		);
		expect(balances.get("ana")).toBe(0);
		expect(balances.get("joao")).toBe(0);
	});

	it("never invents or loses money, whatever happened", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						amount: fc.integer({ min: 1, max: 1_000_000 }),
						payer: fc.constantFrom("ana", "joao", "carla"),
					}),
					{ maxLength: 20 },
				),
				(entries) => {
					const people = [{ userId: "ana" }, { userId: "joao" }, { userId: "carla" }];
					const balances = balancesBetween(
						entries.map((entry) => ({
							amount: entry.amount,
							paidBy: entry.payer,
							parts: divide(entry.amount, "evenly", people),
						})),
					);
					const total = [...balances.values()].reduce((sum, value) => sum + value, 0);
					expect(total).toBe(0);
				},
			),
		);
	});
});

describe("settling up", () => {
	it("says one payment when one person owes another", () => {
		const payments = settleUp(
			new Map([
				["ana", 5000],
				["joao", -5000],
			]),
		);
		expect(payments).toEqual([{ fromUserId: "joao", toUserId: "ana", amount: 5000 }]);
	});

	it("uses as few payments as it can with three people", () => {
		const payments = settleUp(
			new Map([
				["ana", 10_000],
				["joao", -6000],
				["carla", -4000],
			]),
		);
		expect(payments).toHaveLength(2);
		expect(payments.every((payment) => payment.toUserId === "ana")).toBe(true);
		expect(payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(10_000);
	});

	it("says nothing when everybody is even", () => {
		expect(
			settleUp(
				new Map([
					["ana", 0],
					["joao", 0],
				]),
			),
		).toEqual([]);
	});

	it("clears every balance it is given", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: -500_000, max: 500_000 }), { minLength: 2, maxLength: 6 }),
				(amounts) => {
					// Make them add up to zero, which is what a real set of balances does.
					const total = amounts.reduce((sum, value) => sum + value, 0);
					const balanced = [...amounts];
					balanced[0] = (balanced[0] ?? 0) - total;

					const balances = new Map<string, number>(
						balanced.map((amount, index) => [`person${index}`, amount]),
					);
					const payments = settleUp(balances);

					const after = new Map(balances);
					for (const payment of payments) {
						after.set(payment.fromUserId, (after.get(payment.fromUserId) ?? 0) + payment.amount);
						after.set(payment.toUserId, (after.get(payment.toUserId) ?? 0) - payment.amount);
					}
					expect([...after.values()].every((value) => value === 0)).toBe(true);
					expect(payments.every((payment) => payment.amount > 0)).toBe(true);
				},
			),
		);
	});
});
