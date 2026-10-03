import { describe, expect, it } from "vitest";
import { MoneyError } from "../money/money.ts";
import { closedAndNotDue, closedChargeOf, openingChargeOf } from "./openingCharge.ts";

describe("what a card already owes on the day it is written down", () => {
	it("turns an amount already on the invoice into one expense dated today", () => {
		expect(openingChargeOf({ charged: 50_000, today: "2026-10-02" })).toEqual({
			kind: "expense",
			amount: 50_000,
			happenedOn: "2026-10-02",
		});
	});

	it("writes nothing for a card that owes nothing", () => {
		// Three ways of saying the same thing, and none of them is a record.
		expect(openingChargeOf({ charged: null, today: "2026-10-02" })).toBe(null);
		expect(openingChargeOf({ charged: 0, today: "2026-10-02" })).toBe(null);
		expect(openingChargeOf({ charged: -1, today: "2026-10-02" })).toBe(null);
	});

	it("refuses a fraction of a cent rather than rounding it", () => {
		expect(() => openingChargeOf({ charged: 50_000.5, today: "2026-10-02" })).toThrow(MoneyError);
		expect(() => openingChargeOf({ charged: Number.NaN, today: "2026-10-02" })).toThrow(MoneyError);
	});

	// Part 1, D.11 of the request for 2.0.0: between the closing day and the due day, the invoice
	// that closed was typed into the field for the open one and landed a month later.
	it("finds the invoice that closed and is not due, only between the two days", () => {
		const cycle = { closingDay: 3, dueDay: 10 };
		expect(closedAndNotDue("2026-10-05", cycle)).toEqual({
			month: "2026-10",
			dueOn: "2026-10-10",
			lastDay: "2026-10-02",
		});
		expect(closedAndNotDue("2026-10-10", cycle)?.month).toBe("2026-10");
		expect(closedAndNotDue("2026-10-11", cycle)).toBe(null);
		expect(closedAndNotDue("2026-10-02", cycle)).toBe(null);

		// A due day before the closing day falls in the month after.
		expect(closedAndNotDue("2026-10-01", { closingDay: 28, dueDay: 5 })).toEqual({
			month: "2026-09",
			dueOn: "2026-10-05",
			lastDay: "2026-09-27",
		});
	});

	it("writes what the closed invoice holds on its last day, named after it", () => {
		const cycle = { closingDay: 25, dueDay: 5 };
		expect(closedChargeOf({ charged: 120_000, today: "2026-10-28", cycle })).toEqual({
			kind: "expense",
			amount: 120_000,
			happenedOn: "2026-10-24",
			invoiceMonth: "2026-10",
		});
		expect(closedChargeOf({ charged: null, today: "2026-10-28", cycle })).toBe(null);
		// Past the due day there is no such invoice to speak of.
		expect(closedChargeOf({ charged: 120_000, today: "2026-11-06", cycle })).toBe(null);
	});
});
