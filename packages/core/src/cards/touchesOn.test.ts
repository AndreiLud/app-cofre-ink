import { describe, expect, it } from "vitest";
import { type RowOnACard, touchesOn } from "./touchesOn.ts";

const row = (over: Partial<RowOnACard>): RowOnACard => ({
	kind: "expense",
	accountId: "A",
	counterAccountId: null,
	invoiceMonth: "2026-10",
	originInvoiceMonth: null,
	amountInBase: -10_000,
	leavesACard: true,
	...over,
});

// Part 2, C.2 of the request for 2.0.0.
describe("which invoice a record touches", () => {
	it("charges a purchase and takes off a refund on the invoice they name", () => {
		expect(touchesOn("A", row({}))).toEqual([{ as: "charge", month: "2026-10", amount: 10_000 }]);
		expect(touchesOn("A", row({ kind: "income", amountInBase: 2_000 }))).toEqual([
			{ as: "charge", month: "2026-10", amount: -2_000 },
		]);
	});

	it("reads a transfer out of a card as a purchase, on its origin when it names one", () => {
		const out = row({
			kind: "transfer",
			counterAccountId: "B",
			amountInBase: 66_667,
			originInvoiceMonth: "2026-12",
		});
		expect(touchesOn("A", out)).toEqual([{ as: "charge", month: "2026-12", amount: 66_667 }]);
		// And at the other end, a payment by another card of the invoice it names.
		expect(touchesOn("B", out)).toEqual([{ as: "byCard", month: "2026-10", amount: 66_667 }]);
	});

	it("reads a transfer between two cards from before 2.0.0 as a purchase and an unmarked payment", () => {
		const old = row({ kind: "transfer", counterAccountId: "B", amountInBase: 50_000 });
		expect(touchesOn("A", old)).toEqual([{ as: "charge", month: "2026-10", amount: 50_000 }]);
		expect(touchesOn("B", old)).toEqual([{ as: "unmarked", amount: 50_000 }]);
	});

	it("reads a split as a purchase on a later invoice and a payment of its own, the balance unmoved", () => {
		const part = row({
			kind: "transfer",
			counterAccountId: "A",
			amountInBase: 41_667,
			originInvoiceMonth: "2026-11",
		});
		expect(touchesOn("A", part)).toEqual([
			{ as: "charge", month: "2026-11", amount: 41_667 },
			{ as: "rolled", month: "2026-10", amount: 41_667 },
		]);
	});

	it("reads money from an account as paid, or unmarked when it names no invoice", () => {
		const paid = row({
			kind: "transfer",
			accountId: "checking",
			counterAccountId: "A",
			amountInBase: 50_000,
			leavesACard: false,
		});
		expect(touchesOn("A", paid)).toEqual([{ as: "paid", month: "2026-10", amount: 50_000 }]);
		expect(touchesOn("A", { ...paid, invoiceMonth: null })).toEqual([
			{ as: "unmarked", amount: 50_000 },
		]);
	});
});
