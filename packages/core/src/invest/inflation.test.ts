import { describe, expect, it } from "vitest";
import { inflationOverAYear, type MonthRate } from "./inflation.ts";

const months = (from: string, count: number, rate = 40): MonthRate[] =>
	Array.from({ length: count }, (_unused, index) => {
		const total = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1 + index;
		return {
			month: `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`,
			rate,
		};
	});

describe("the inflation of a year", () => {
	it("compounds twelve months that follow one another", () => {
		expect(inflationOverAYear(months("2025-11", 12, 40))?.percent).toBe(
			Math.round((1.004 ** 12 - 1) * 10_000),
		);
	});

	it("says nothing when a month is missing", () => {
		// January of 2026 to January of 2027, with no December.
		const held = months("2026-01", 13).filter((point) => point.month !== "2026-12");
		expect(inflationOverAYear(held)).toBeNull();
		expect(inflationOverAYear(months("2026-01", 11))).toBeNull();
	});
});
