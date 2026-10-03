// Part 2, E.14 of the request for 2.0.0: an invoice split, as the bank prints it later.

import { describe, expect, it } from "vitest";
import { matchArrangements } from "./arrangements.ts";
import type { ExistingRecord } from "./pipeline.ts";

/**
 * The invoice of September of a card split in six, R$ 100,00 a part and R$ 10,00 of cost on
 * each, the parts charged on October to March: what the application writes.
 */
const split: ExistingRecord[] = Array.from({ length: 6 }, (_unused, index) => {
	const month = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"][index] ?? "";
	return [
		{
			id: `part${index + 1}`,
			happenedOn: "2026-09-06",
			amount: -10_000,
			description: `Parcelamento da fatura de setembro ${index + 1}/6`,
			externalId: null,
			kind: "transfer" as const,
			invoiceMonth: "2026-09",
			originInvoiceMonth: month,
			installment: { group: "split", number: index + 1, count: 6 },
		},
		{
			id: `cost${index + 1}`,
			happenedOn: "2026-09-06",
			amount: -1000,
			description: `Custo do parcelamento ${index + 1}/6`,
			externalId: null,
			kind: "expense" as const,
			invoiceMonth: month,
			originInvoiceMonth: null,
			installment: { group: "split", number: index + 1, count: 6 },
		},
	];
}).flat();

describe("the lines of a split invoice", () => {
	it("are already here on the invoice of November, so it writes nothing", () => {
		const lines = [
			{ amount: -10_000, description: "Parcelamento de fatura 2/6" },
			{ amount: -700, description: "Encargos de parcelamento" },
			{ amount: -300, description: "IOF de financiamento" },
		];
		expect(matchArrangements(lines, split, "2026-11")).toEqual(
			new Map([
				[0, "here"],
				[1, "here"],
				[2, "here"],
			]),
		);
	});

	it("is the part and its cost together, when the bank prints one line", () => {
		const lines = [{ amount: -11_000, description: "Parcelamento de fatura 2/6" }];
		expect(matchArrangements(lines, split, "2026-11").get(0)).toBe("here");
	});

	it("sends a split nobody wrote to the screen that writes it", () => {
		const lines = [{ amount: -10_000, description: "Parcelamento de fatura 2/6" }];
		expect(matchArrangements(lines, [], "2026-11").get(0)).toBe("elsewhere");
	});
});
