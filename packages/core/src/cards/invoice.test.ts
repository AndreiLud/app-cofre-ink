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
	invoiceMonthOf,
	invoicePeriod,
} from "./invoice.ts";

// A card that closes on the third and falls due on the tenth.
const early: CardCycle = { closingDay: 3, dueDay: 10 };
// A card that closes on the twenty eighth and falls due on the fifth of the month after.
const late: CardCycle = { closingDay: 28, dueDay: 5 };

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
