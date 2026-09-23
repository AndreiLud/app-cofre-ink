import { describe, expect, it } from "vitest";
import { budgetsForMonth, countsToward, progressOf } from "./progress.ts";

const groceries = { id: "b1", scope: "category" as const, categoryId: "market", amount: 100_000 };
const superfluous = {
	id: "b2",
	scope: "priority" as const,
	priority: "superfluous",
	amount: 20_000,
};

const atMarket = { amount: -40_000, kind: "expense", categoryId: "market", priority: "essential" };
const delivery = {
	amount: -15_000,
	kind: "expense",
	categoryId: "delivery",
	priority: "superfluous",
};
const salary = { amount: 500_000, kind: "income", categoryId: "salary", priority: null };
const moved = { amount: -30_000, kind: "transfer", categoryId: null, priority: null };

const spending = [atMarket, delivery, salary, moved];
const anyLimit = { id: "b0", scope: "total" as const, amount: 1 };

describe("what counts against a limit", () => {
	it("counts only money leaving", () => {
		expect(countsToward(anyLimit, salary)).toBe(false);
		expect(countsToward(anyLimit, moved)).toBe(false);
		expect(countsToward(anyLimit, atMarket)).toBe(true);
	});

	it("counts by category and by priority", () => {
		expect(countsToward(groceries, atMarket)).toBe(true);
		expect(countsToward(groceries, delivery)).toBe(false);
		expect(countsToward(superfluous, delivery)).toBe(true);
		expect(countsToward(superfluous, atMarket)).toBe(false);
	});
});

describe("how a limit is doing", () => {
	it("says what is spent and what is left", () => {
		const progress = progressOf(groceries, spending, { dayOfMonth: 15, daysInMonth: 30 });
		expect(progress.spent).toBe(40_000);
		expect(progress.left).toBe(60_000);
		expect(progress.share).toBeCloseTo(0.4);
	});

	it("reads the same number differently at the start and at the end of the month", () => {
		const early = progressOf(groceries, spending, { dayOfMonth: 3, daysInMonth: 30 });
		const late = progressOf(groceries, spending, { dayOfMonth: 28, daysInMonth: 30 });

		// Forty thousand on the third is a month heading for four hundred thousand.
		expect(early.projected).toBe(400_000);
		expect(early.state).toBe("tight");
		expect(late.state).toBe("comfortable");
	});

	it("says over when it is over, whatever the day", () => {
		const progress = progressOf(superfluous, spending, { dayOfMonth: 28, daysInMonth: 30 });
		expect(progress.spent).toBe(15_000);
		expect(progress.state).toBe("comfortable");

		const smaller = progressOf({ ...superfluous, amount: 10_000 }, spending, {
			dayOfMonth: 28,
			daysInMonth: 30,
		});
		expect(smaller.state).toBe("over");
		expect(smaller.left).toBe(-5000);
	});
});

describe("which limit applies to a month", () => {
	const standing = { id: "s", scope: "category" as const, categoryId: "market", amount: 100_000 };
	const december = {
		id: "d",
		scope: "category" as const,
		categoryId: "market",
		month: "2026-12",
		amount: 200_000,
	};

	it("takes the standing one when the month has none of its own", () => {
		expect(budgetsForMonth([standing, december], "2026-09").map((one) => one.id)).toEqual(["s"]);
	});

	it("lets a month of its own win", () => {
		expect(budgetsForMonth([standing, december], "2026-12").map((one) => one.id)).toEqual(["d"]);
	});

	it("keeps limits that do not collide", () => {
		const other = { id: "o", scope: "priority" as const, priority: "superfluous", amount: 5000 };
		expect(budgetsForMonth([standing, december, other], "2026-12").map((one) => one.id)).toEqual([
			"d",
			"o",
		]);
	});
});
