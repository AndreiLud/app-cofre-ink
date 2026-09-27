import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CardCycle, invoiceMonthOf } from "../cards/invoice.ts";
import { CalendarError } from "../time/calendar.ts";
import { MONTH_PARTS, monthMark, monthPartDay, readMonthMark } from "./monthInThree.ts";

describe("the mark the three records carry", () => {
	it("says the month and which of the three it is", () => {
		expect(monthMark("2026-09", "income")).toBe("mes:2026-09:income");
		expect(readMonthMark("mes:2026-09:income")).toEqual({ month: "2026-09", part: "income" });
	});

	it("comes back from whatever it was written as", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1900, max: 2999 }),
				fc.integer({ min: 1, max: 12 }),
				fc.constantFrom(...MONTH_PARTS),
				(year, month, part) => {
					const named = `${year}-${String(month).padStart(2, "0")}` as const;
					expect(readMonthMark(monthMark(named, part))).toEqual({ month: named, part });
				},
			),
		);
	});

	it("does not recognise what a bank wrote", () => {
		expect(readMonthMark(null)).toBeNull();
		expect(readMonthMark("")).toBeNull();
		expect(readMonthMark("20260915000123")).toBeNull();
		expect(readMonthMark("mes:2026-09")).toBeNull();
		expect(readMonthMark("mes:2026-09:salario")).toBeNull();
		expect(readMonthMark("mes:setembro:income")).toBeNull();
		expect(readMonthMark("mes:2026-13:income")).toBeNull();
		expect(readMonthMark("outro:2026-09:income")).toBeNull();
	});

	it("refuses to mark something that is not a month", () => {
		expect(() => monthMark("2026-13" as never, "income")).toThrow(CalendarError);
	});
});

describe("the day one of the three is written on", () => {
	it("is the last day of the month, whatever the month is worth", () => {
		expect(monthPartDay("2026-09", "income")).toBe("2026-09-30");
		expect(monthPartDay("2026-02", "spending")).toBe("2026-02-28");
		expect(monthPartDay("2024-02", "spending")).toBe("2024-02-29");
		expect(monthPartDay("2026-01", "income")).toBe("2026-01-31");
	});

	it("is the last day of that invoice, for the card", () => {
		const early: CardCycle = { closingDay: 3, dueDay: 10 };
		expect(monthPartDay("2026-09", "invoice", early)).toBe("2026-09-02");
	});

	it("falls back to the last day when the card has no cycle", () => {
		expect(monthPartDay("2026-09", "invoice", null)).toBe("2026-09-30");
	});

	it("always lands the card on the invoice of the month it was written for", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 31 }),
				fc.integer({ min: 1, max: 12 }),
				(closingDay, month) => {
					const cycle: CardCycle = { closingDay, dueDay: 10 };
					const named = `2026-${String(month).padStart(2, "0")}` as const;
					expect(invoiceMonthOf(monthPartDay(named, "invoice", cycle), cycle)).toBe(named);
				},
			),
		);
	});
});
