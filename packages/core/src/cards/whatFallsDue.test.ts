// What falls due. Part 2, J.2 of the request for 2.0.0, with its cases.

import { describe, expect, it } from "vitest";
import type { CalendarDate } from "../time/calendar.ts";
import { billsFallingDue, type DueInvoice, type DueRecord, SOON_DAYS } from "./whatFallsDue.ts";

const invoice = (
	month: string,
	dueOn: string,
	left: number,
	extra: Partial<DueInvoice> = {},
): DueInvoice => ({
	card: "Nubank",
	accountId: "card",
	month,
	dueOn,
	left,
	withoutRate: 0,
	scheduled: 0,
	scheduledOn: null,
	scheduledBy: null,
	...extra,
});

const record = (day: string, amount: number, extra: Partial<DueRecord> = {}): DueRecord => ({
	description: "Aluguel",
	amount,
	day,
	kind: "expense",
	status: "settled",
	invoiceMonth: null,
	onCardWithCycle: false,
	onBenefitCard: false,
	...extra,
});

const at = (today: string, records: DueRecord[], invoices: DueInvoice[], spendable = 0) =>
	billsFallingDue({ today: today as CalendarDate, records, invoices, spendable });

describe("what falls due", () => {
	it("is fifteen days ahead, said once", () => {
		expect(SOON_DAYS).toBe(15);
	});

	it("puts an invoice past its due day with the late, however late, and counts it", () => {
		const bills = at(
			"2026-10-02",
			[],
			[
				invoice("2026-04", "2026-04-10", 10_000),
				invoice("2026-09", "2026-09-10", 128_450),
				invoice("2026-10", "2026-10-10", 42_000),
			],
		);
		expect(bills.late.map((one) => one.invoice?.month)).toEqual(["2026-04", "2026-09"]);
		expect(bills.coming.map((one) => one.invoice?.month)).toEqual(["2026-10"]);
		expect(bills.total).toBe(180_450);
		// The oldest of the late is the one a sentence names.
		expect(bills.naming?.invoice?.month).toBe("2026-04");
	});

	it("counts the due day itself as coming, because the day is not over", () => {
		const bills = at("2026-10-02", [], [invoice("2026-10", "2026-10-02", 10_000)]);
		expect(bills.coming).toHaveLength(1);
		expect(bills.coming[0]?.days).toBe(0);
		expect(bills.late).toHaveLength(0);
	});

	it("leaves out what is paid, and what is further off than the window", () => {
		const bills = at(
			"2026-10-02",
			[],
			[
				invoice("2026-09", "2026-09-10", 0),
				invoice("2026-08", "2026-08-10", -500),
				invoice("2026-11", "2026-11-10", 42_000),
			],
		);
		expect(bills.count).toBe(0);
		expect(bills.naming).toBeNull();
	});

	it("sets apart an invoice with a purchase in another currency and no rate", () => {
		const bills = at(
			"2026-10-28",
			[],
			[invoice("2026-10", "2026-11-05", 50_000, { withoutRate: 1 })],
		);
		expect(bills.uncounted).toHaveLength(1);
		expect(bills.total).toBe(0);
		expect(bills.short).toBe(0);
	});

	it("leaves a purchase on the invoice of a card with a cycle to the invoice", () => {
		const bills = at(
			"2026-10-28",
			[
				record("2026-11-02", 9_990, { invoiceMonth: "2026-11", onCardWithCycle: true }),
				// A card with no cycle has no invoice to stand for it, and neither has a purchase
				// that lost its invoice.
				record("2026-11-02", 5_000, { invoiceMonth: "2026-11", onCardWithCycle: false }),
				record("2026-11-03", 4_000, { invoiceMonth: null, onCardWithCycle: true }),
			],
			[],
		);
		expect(bills.coming.map((one) => one.amount)).toEqual([5_000, 4_000]);
	});

	it("leaves out a lunch on a benefit card, money coming in, and a move", () => {
		const bills = at(
			"2026-10-28",
			[
				record("2026-11-02", 3_500, { onBenefitCard: true }),
				record("2026-11-02", 600_000, { kind: "income" }),
				record("2026-11-05", 230_000, { kind: "transfer" }),
			],
			[],
		);
		expect(bills.count).toBe(0);
	});

	it("counts a fact dated ahead, and leaves out one whose day has come", () => {
		const bills = at(
			"2026-10-28",
			[
				record("2026-10-28", 1_000),
				record("2026-10-29", 2_000),
				record("2026-11-12", 3_000),
				record("2026-11-13", 4_000),
			],
			[],
		);
		expect(bills.coming.map((one) => one.amount)).toEqual([2_000, 3_000]);
	});

	it("puts a promise from before 1.1.0 whose day has gone with the late", () => {
		const bills = at(
			"2026-10-28",
			[
				record("2026-10-20", 8_000, { status: "planned" }),
				record("2026-10-28", 1_000, { status: "planned" }),
			],
			[],
		);
		expect(bills.late.map((one) => one.amount)).toEqual([8_000]);
		expect(bills.coming.map((one) => one.amount)).toEqual([1_000]);
	});

	it("keeps an invoice whose payment is dated ahead, and says the payment is waiting", () => {
		const bills = at(
			"2026-10-28",
			[],
			[
				invoice("2026-11", "2026-11-05", 230_000, {
					scheduled: 230_000,
					scheduledOn: "2026-11-05",
				}),
			],
		);
		expect(bills.coming[0]).toMatchObject({
			amount: 230_000,
			scheduledOn: "2026-11-05",
			scheduledBy: "money",
		});
	});

	it("is short of what can be spent today, never below nothing, and names the largest", () => {
		const bills = at(
			"2026-10-28",
			[record("2026-11-01", 90_000)],
			[invoice("2026-11", "2026-11-05", 80_000)],
			120_000,
		);
		expect(bills).toMatchObject({ total: 170_000, count: 2, short: 50_000 });
		expect(bills.naming?.subject).toBe("Aluguel");
		expect(at("2026-10-28", [record("2026-11-01", 90_000)], [], 500_000).short).toBe(0);
	});

	it("reaches as far as it is asked, which is the end of the month for what is left to spend", () => {
		const bills = billsFallingDue({
			today: "2026-10-28",
			until: "2026-10-31",
			records: [],
			invoices: [
				invoice("2026-10", "2026-10-30", 10_000),
				invoice("2026-11", "2026-11-05", 20_000),
			],
			spendable: 0,
		});
		expect(bills.total).toBe(10_000);
	});
});
