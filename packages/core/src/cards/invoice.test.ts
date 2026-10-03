import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { money, sum } from "../money/money.ts";
import { CalendarError, compareCalendarDates } from "../time/calendar.ts";
import { planInstallments } from "./installments.ts";
import {
	type CardCycle,
	daysUntilDue,
	invoiceClosingDate,
	invoiceDueDate,
	invoiceMonthForDue,
	invoiceMonthOf,
	invoicePeriod,
} from "./invoice.ts";

// A card that closes on the third and falls due on the tenth.
const early: CardCycle = { closingDay: 3, dueDay: 10 };
// A card that closes on the twenty eighth and falls due on the fifth of the month after.
const late: CardCycle = { closingDay: 28, dueDay: 5 };

// Part 2, E.7 of the request for 2.0.0: which invoice a due date printed on paper is.
describe("the invoice of a printed due date", () => {
	it("is the one whose due date is nearest", () => {
		expect(invoiceMonthForDue("2026-10-10", early)).toBe("2026-10");
		expect(invoiceMonthForDue("2026-10-05", late)).toBe("2026-09");
		// A bank that moved the due date to the next working day is still that invoice.
		expect(invoiceMonthForDue("2026-10-12", early)).toBe("2026-10");
		expect(invoiceMonthForDue("2026-10-06", late)).toBe("2026-09");
	});

	it("is the month of the date for a card with no cycle", () => {
		expect(invoiceMonthForDue("2026-10-10", null)).toBe("2026-10");
	});
});

describe("which invoice a purchase lands on", () => {
	it("puts a purchase before the closing day on the invoice closing that month", () => {
		expect(invoiceMonthOf("2026-09-01", early)).toBe("2026-09");
		expect(invoiceMonthOf("2026-09-02", early)).toBe("2026-09");
	});

	it("pushes a purchase made on the closing day to the next invoice", () => {
		expect(invoiceMonthOf("2026-09-03", early)).toBe("2026-10");
		expect(invoiceMonthOf("2026-09-04", early)).toBe("2026-10");
	});

	it("turns the year over", () => {
		expect(invoiceMonthOf("2026-12-29", late)).toBe("2027-01");
		expect(invoiceMonthOf("2026-12-27", late)).toBe("2026-12");
	});

	it("never goes backwards as the days go forward", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 28 }),
				fc.integer({ min: 1, max: 27 }),
				(closingDay, day) => {
					const cycle: CardCycle = { closingDay, dueDay: 10 };
					const before = invoiceMonthOf(`2026-06-${String(day).padStart(2, "0")}`, cycle);
					const after = invoiceMonthOf(`2026-06-${String(day + 1).padStart(2, "0")}`, cycle);
					expect(after >= before).toBe(true);
				},
			),
		);
	});
});

describe("when the invoice closes and falls due", () => {
	it("keeps the due date in the same month when it comes after the close", () => {
		expect(invoiceClosingDate("2026-09", early)).toBe("2026-09-03");
		expect(invoiceDueDate("2026-09", early)).toBe("2026-09-10");
	});

	it("pushes the due date to the next month when it comes before the close", () => {
		expect(invoiceClosingDate("2026-09", late)).toBe("2026-09-28");
		expect(invoiceDueDate("2026-09", late)).toBe("2026-10-05");
	});

	it("clamps a closing day that a short month does not have", () => {
		expect(invoiceClosingDate("2026-02", { closingDay: 31, dueDay: 10 })).toBe("2026-02-28");
	});

	it("covers the days between one closing and the next", () => {
		const period = invoicePeriod("2026-09", early);
		expect(period).toEqual({ from: "2026-08-03", to: "2026-09-02" });
		expect(compareCalendarDates(period.from, period.to)).toBe(-1);
	});

	it("gives a card that closes on the first the whole of the month before", () => {
		expect(invoicePeriod("2026-09", { closingDay: 1, dueDay: 10 })).toEqual({
			from: "2026-08-01",
			to: "2026-08-31",
		});
	});

	it("starts a card that closes on the thirty first on the first, after a February", () => {
		// February has no thirty first, so nothing in it closed onto the March invoice.
		expect(invoicePeriod("2026-03", { closingDay: 31, dueDay: 10 })).toEqual({
			from: "2026-03-01",
			to: "2026-03-30",
		});
		expect(invoicePeriod("2026-02", { closingDay: 31, dueDay: 10 })).toEqual({
			from: "2026-01-31",
			to: "2026-02-28",
		});
	});

	it("covers every day, and only the days, that land on that invoice", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 31 }),
				fc.integer({ min: 1, max: 12 }),
				(closingDay, month) => {
					const cycle: CardCycle = { closingDay, dueDay: 10 };
					const named = `2026-${String(month).padStart(2, "0")}` as const;
					const period = invoicePeriod(named, cycle);
					expect(compareCalendarDates(period.from, period.to)).toBe(-1);
					// Both ends belong to the invoice they are said to be the ends of, which
					// is the only thing the two dates promise.
					expect(invoiceMonthOf(period.from, cycle)).toBe(named);
					expect(invoiceMonthOf(period.to, cycle)).toBe(named);
				},
			),
		);
	});

	it("says how long the money is borrowed for", () => {
		// Buying the day after the invoice closed buys the longest wait.
		expect(daysUntilDue("2026-09-03", early)).toBe(37);
		expect(daysUntilDue("2026-09-02", early)).toBe(8);
	});

	it("refuses a day that is not a day of the month", () => {
		expect(() => invoiceMonthOf("2026-09-01", { closingDay: 0, dueDay: 10 })).toThrow(
			CalendarError,
		);
		expect(() => invoiceMonthOf("2026-09-01", { closingDay: 32, dueDay: 10 })).toThrow(
			CalendarError,
		);
	});
});

describe("planning installments", () => {
	it("adds up to the purchase, whatever the purchase is", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100_000_000 }),
				fc.integer({ min: 1, max: 48 }),
				(amount, count) => {
					const parts = planInstallments({
						total: money(amount),
						count,
						purchasedOn: "2026-09-15",
					});
					expect(parts).toHaveLength(count);
					expect(sum(parts.map((part) => part.amount)).amount).toBe(amount);
				},
			),
		);
	});

	it("walks one month at a time, keeping the day", () => {
		const parts = planInstallments({
			total: money(30_000),
			count: 3,
			purchasedOn: "2026-01-31",
		});
		expect(parts.map((part) => part.happenedOn)).toEqual([
			"2026-01-31",
			"2026-02-28",
			"2026-03-31",
		]);
	});

	it("walks one invoice at a time when the purchase went on a card", () => {
		const parts = planInstallments({
			total: money(30_000),
			count: 3,
			purchasedOn: "2026-09-05",
			cycle: early,
		});
		expect(parts.map((part) => part.invoiceMonth)).toEqual(["2026-10", "2026-11", "2026-12"]);
		expect(parts.map((part) => part.amount.amount)).toEqual([10_000, 10_000, 10_000]);
	});

	it("puts the leftover cent on the first installment", () => {
		const parts = planInstallments({ total: money(10_000), count: 3, purchasedOn: "2026-09-05" });
		expect(parts.map((part) => part.amount.amount)).toEqual([3334, 3333, 3333]);
	});
});
