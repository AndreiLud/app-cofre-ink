import { describe, expect, it } from "vitest";
import { amountInAMonth, seriesInAMonth } from "./monthly.ts";

describe("what a series comes to in a month", () => {
	it("is itself once a month, a twelfth once a year, and fifty two twelfths every week", () => {
		expect(amountInAMonth({ frequency: "monthly", intervalCount: 1, amount: 145_000 })).toBe(
			145_000,
		);
		expect(amountInAMonth({ frequency: "monthly", intervalCount: 2, amount: 10_000 })).toBe(5_000);
		expect(amountInAMonth({ frequency: "yearly", intervalCount: 1, amount: 120_000 })).toBe(10_000);
		expect(amountInAMonth({ frequency: "weekly", intervalCount: 1, amount: 3_000 })).toBe(13_000);
	});

	it("adds what goes out and what comes in apart, and leaves a move between accounts out", () => {
		expect(
			seriesInAMonth([
				{ kind: "expense", frequency: "monthly", intervalCount: 1, amount: 145_000 },
				{ kind: "expense", frequency: "monthly", intervalCount: 1, amount: 2_790 },
				{ kind: "income", frequency: "monthly", intervalCount: 1, amount: 612_000 },
				{ kind: "transfer", frequency: "monthly", intervalCount: 1, amount: 100_000 },
			]),
		).toEqual({ out: 147_790, in: 612_000 });
	});
});
