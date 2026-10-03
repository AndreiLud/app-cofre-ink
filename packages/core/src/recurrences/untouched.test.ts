import { describe, expect, it } from "vitest";
import {
	isUntouchedOccurrence,
	type SeriesRecord,
	seriesPeriodOf,
	type WrittenRecord,
} from "./untouched.ts";

const RENT: SeriesRecord = {
	kind: "expense",
	amount: 145_000,
	accountId: "corrente",
	counterAccountId: null,
	cardId: null,
	categoryId: "moradia",
	description: "Aluguel",
	frequency: "monthly",
	startsOn: "2026-10-05",
};

const NOVEMBER: WrittenRecord = {
	amount: -145_000,
	accountId: "corrente",
	counterAccountId: null,
	cardId: null,
	categoryId: "moradia",
	description: "Aluguel",
	happenedOn: "2026-11-05",
	reconciledAt: null,
};

describe("a record nobody touched", () => {
	it("is the one the series writes on that day", () => {
		expect(isUntouchedOccurrence(NOVEMBER, RENT)).toBe(true);
	});

	it("is touched once anything a person sees on it changed, or it was reconciled", () => {
		for (const changed of [
			{ amount: -150_000 },
			{ accountId: "poupanca" },
			{ cardId: "cartao" },
			{ categoryId: null },
			{ description: "Aluguel de novembro" },
			{ happenedOn: "2026-11-06" },
			{ reconciledAt: 1_790_000_000_000 },
		]) {
			expect(isUntouchedOccurrence({ ...NOVEMBER, ...changed }, RENT)).toBe(false);
		}
	});
});

describe("the period of a day", () => {
	it("is the month, the year, or the Monday of the week", () => {
		expect(seriesPeriodOf("monthly", "2026-11-05")).toBe("2026-11");
		expect(seriesPeriodOf("yearly", "2026-11-05")).toBe("2026");
		// The fifth of November of 2026 is a Thursday.
		expect(seriesPeriodOf("weekly", "2026-11-05")).toBe("2026-11-02");
		expect(seriesPeriodOf("weekly", "2026-11-02")).toBe("2026-11-02");
		expect(seriesPeriodOf("weekly", "2026-11-08")).toBe("2026-11-02");
	});
});
