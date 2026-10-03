import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CardCycle, invoiceMonthOf } from "../cards/invoice.ts";
import { CalendarError } from "../time/calendar.ts";
import { MONTH_PARTS, monthMark, monthPartDay, readMonthMark } from "./monthInThree.ts";

describe("the mark the three records carry", () => {
	it("says the month and which of the three it is", () => {
		expect(monthMark("2026-09", "income")).toBe("mes:2026-09:income");
		expect(readMonthMark("mes:2026-09:income")).toEqual({
			month: "2026-09",
			part: "income",
			cardAccountId: null,
		});
	});

	// Part 2, B.5.2 and B.5.5 of the request for 2.0.0: an invoice and its payment for each
	// card, with the card in the mark; the mark from before, with none, is still read.
	it("names the card of an invoice and of its payment, and reads the mark without one", () => {
		expect(monthMark("2026-09", "invoice", "acc1")).toBe("mes:2026-09:invoice:acc1");
		expect(readMonthMark("mes:2026-09:invoice:acc1")).toEqual({
			month: "2026-09",
			part: "invoice",
			cardAccountId: "acc1",
		});
		expect(readMonthMark("mes:2026-09:payment:acc1")?.cardAccountId).toBe("acc1");
		expect(readMonthMark("mes:2026-09:invoice")).toEqual({
			month: "2026-09",
			part: "invoice",
			cardAccountId: null,
		});
		// Income and spending have no card, so a card on them is not a mark this wrote.
		expect(monthMark("2026-09", "income", "acc1")).toBe("mes:2026-09:income");
		expect(readMonthMark("mes:2026-09:income:acc1")).toBeNull();
		expect(readMonthMark("mes:2026-09:invoice:")).toBeNull();
	});

	it("comes back from whatever it was written as", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1900, max: 2999 }),
				fc.integer({ min: 1, max: 12 }),
				fc.constantFrom(...MONTH_PARTS),
				fc.option(fc.stringMatching(/^[a-z0-9]{1,12}$/), { nil: null }),
				(year, month, part, card) => {
					const named = `${year}-${String(month).padStart(2, "0")}` as const;
					const carried = part === "invoice" || part === "payment" ? card : null;
					expect(readMonthMark(monthMark(named, part, card))).toEqual({
						month: named,
						part,
						cardAccountId: carried,
					});
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

	it("writes the month somebody is living in on the day they are writing it", () => {
		// A balance counts a record once its day has arrived, so the last day of the month
		// would mean typing what was spent on the fifth and watching nothing move until the
		// thirty first.
		expect(monthPartDay("2026-09", "income", null, "2026-09-05")).toBe("2026-09-05");
		expect(monthPartDay("2026-09", "spending", null, "2026-09-29")).toBe("2026-09-29");
	});

	it("keeps the last day for a month already over, and for one still to come", () => {
		expect(monthPartDay("2026-08", "income", null, "2026-09-05")).toBe("2026-08-31");
		expect(monthPartDay("2026-10", "income", null, "2026-09-05")).toBe("2026-10-31");
	});

	it("is the last day of that invoice, for the card", () => {
		const early: CardCycle = { closingDay: 3, dueDay: 10 };
		expect(monthPartDay("2026-09", "invoice", early)).toBe("2026-09-02");
	});

	it("falls back to the last day when the card has no cycle", () => {
		expect(monthPartDay("2026-09", "invoice", null)).toBe("2026-09-30");
		expect(monthPartDay("2026-09", "payment", null)).toBe("2026-09-30");
	});

	it("pays the card on the day that invoice falls due", () => {
		// Closes on the third and falls due on the tenth, so both are in the same month.
		expect(monthPartDay("2026-09", "payment", { closingDay: 3, dueDay: 10 })).toBe("2026-09-10");
		// Closes on the twenty eighth and falls due on the fifth, which is the month after,
		// and that is the month the money really leaves the account in.
		expect(monthPartDay("2026-09", "payment", { closingDay: 28, dueDay: 5 })).toBe("2026-10-05");
	});

	it("never pays an invoice before it closed", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 31 }),
				fc.integer({ min: 1, max: 31 }),
				fc.integer({ min: 1, max: 12 }),
				(closingDay, dueDay, month) => {
					const cycle: CardCycle = { closingDay, dueDay };
					const named = `2026-${String(month).padStart(2, "0")}` as const;
					const closes = monthPartDay(named, "invoice", cycle);
					const pays = monthPartDay(named, "payment", cycle);
					expect(pays >= closes).toBe(true);
				},
			),
		);
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
