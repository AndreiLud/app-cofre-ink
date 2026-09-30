import { describe, expect, it } from "vitest";
import { addUpInBase } from "./addUp.ts";

describe("addUpInBase", () => {
	it("counts a record in another currency at what it was worth in the space currency", () => {
		// Forty dollars, written in a space that counts in reais, at 5.20 on the day.
		const rows = [
			{ kind: "expense", amount: -4000, amountInBase: -20_800 },
			{ kind: "expense", amount: -1500, amountInBase: -1500 },
		];
		expect(addUpInBase(rows)).toBe(-22_300);
	});

	it("leaves a transfer out", () => {
		const rows = [
			{ kind: "income", amount: 100_000, amountInBase: 100_000 },
			{ kind: "transfer", amount: -50_000, amountInBase: -50_000 },
		];
		expect(addUpInBase(rows)).toBe(100_000);
	});

	it("is nothing when there is nothing", () => {
		expect(addUpInBase([])).toBe(0);
	});
});
