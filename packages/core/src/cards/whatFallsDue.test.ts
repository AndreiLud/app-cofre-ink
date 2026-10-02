import { describe, expect, it } from "vitest";
import { splitInvoicesFallingDue } from "./whatFallsDue.ts";

const bill = (month: string, dueOn: string, left: number) => ({
	accountId: "card",
	month,
	dueOn,
	left,
});

describe("what falls due", () => {
	it("puts an invoice past its due day with the bills to answer", () => {
		const bills = splitInvoicesFallingDue({
			invoices: [bill("2026-09", "2026-09-10", 128_450), bill("2026-10", "2026-10-10", 42_000)],
			today: "2026-10-02",
			until: "2026-10-17",
		});

		expect(bills.toAnswer.map((one) => one.month)).toEqual(["2026-09"]);
		expect(bills.coming.map((one) => one.month)).toEqual(["2026-10"]);
	});

	it("keeps a bill however late it is, because an old bill is still a bill", () => {
		const bills = splitInvoicesFallingDue({
			invoices: [bill("2026-04", "2026-04-10", 10_000)],
			today: "2026-10-02",
			until: "2026-10-17",
		});

		expect(bills.toAnswer).toHaveLength(1);
	});

	it("counts the due day itself as coming, because the day is not over", () => {
		const bills = splitInvoicesFallingDue({
			invoices: [bill("2026-10", "2026-10-02", 10_000)],
			today: "2026-10-02",
			until: "2026-10-17",
		});

		expect(bills.coming).toHaveLength(1);
		expect(bills.toAnswer).toHaveLength(0);
	});

	it("leaves out what is paid, and what is further off than the horizon", () => {
		const bills = splitInvoicesFallingDue({
			invoices: [
				bill("2026-09", "2026-09-10", 0),
				bill("2026-08", "2026-08-10", -500),
				bill("2026-11", "2026-11-10", 42_000),
				null,
				undefined,
			],
			today: "2026-10-02",
			until: "2026-10-17",
		});

		expect(bills.toAnswer).toHaveLength(0);
		expect(bills.coming).toHaveLength(0);
	});

	it("puts the oldest first in each list, whatever order they arrive in", () => {
		const bills = splitInvoicesFallingDue({
			invoices: [
				bill("2026-09", "2026-09-10", 1),
				bill("2026-10", "2026-10-15", 1),
				bill("2026-08", "2026-08-10", 1),
				bill("2026-10", "2026-10-05", 1),
			],
			today: "2026-10-02",
			until: "2026-10-17",
		});

		expect(bills.toAnswer.map((one) => one.dueOn)).toEqual(["2026-08-10", "2026-09-10"]);
		expect(bills.coming.map((one) => one.dueOn)).toEqual(["2026-10-05", "2026-10-15"]);
	});
});
