import { type InvoiceState, invoiceStateOf } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { payable } from "./payable.ts";

const cycle = { closingDay: 3, dueDay: 10 };

function owing(withoutRate: number): InvoiceState {
	return invoiceStateOf({
		month: "2026-10",
		cycle,
		charged: 43_340,
		paid: 0,
		today: "2026-10-28",
		withoutRate,
	});
}

describe("whether an invoice is offered to be paid", () => {
	// Part 1, H.1.2 of the request for 2.0.0: an invoice with a purchase in another currency and
	// no rate said it had no total, above a button that offered to pay R$ 433,40 of it.
	it("is not, while a purchase on it has no rate", () => {
		expect(payable(owing(1))).toBe(false);
	});

	it("is, when something is owed and every purchase has a figure", () => {
		expect(payable(owing(0))).toBe(true);
		expect(payable(undefined)).toBe(false);
	});
});
