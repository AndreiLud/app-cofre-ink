import { describe, expect, it } from "vitest";
import { printedDay } from "./printedDay.ts";

// Part 2, E.4 of the request for 2.0.0.
describe("the year of a day printed without one", () => {
	it("puts the end of December before an invoice due in January", () => {
		expect(
			printedDay({ day: 28, month: 12, anchor: "2027-01-10", period: null, fallbackYear: 2027 }),
		).toBe("2026-12-28");
	});

	it("puts a part of a plan near its purchase, however far back", () => {
		expect(
			printedDay({
				day: 12,
				month: 3,
				anchor: "2026-10-10",
				period: null,
				fallbackYear: 2026,
				part: 20,
			}),
		).toBe("2025-03-12");
		expect(
			printedDay({
				day: 12,
				month: 9,
				anchor: "2026-10-10",
				period: null,
				fallbackYear: 2026,
				part: 2,
			}),
		).toBe("2026-09-12");
	});

	it("keeps a day inside the period of the document", () => {
		expect(
			printedDay({
				day: 5,
				month: 9,
				anchor: "2026-09-30",
				period: { from: "2026-09-01", to: "2026-09-30" },
				fallbackYear: 2020,
			}),
		).toBe("2026-09-05");
	});

	it("takes the year it is given when nothing places the day", () => {
		expect(printedDay({ day: 5, month: 9, anchor: null, period: null, fallbackYear: 2024 })).toBe(
			"2024-09-05",
		);
		expect(printedDay({ day: 31, month: 2, anchor: null, period: null, fallbackYear: 2024 })).toBe(
			null,
		);
	});
});
