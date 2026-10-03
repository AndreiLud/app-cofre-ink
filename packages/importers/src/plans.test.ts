// Part 2, E.13 of the request for 2.0.0: a part printed on an invoice and the plan written.

import { describe, expect, it } from "vitest";
import type { ExistingRecord } from "./pipeline.ts";
import { matchPart } from "./plans.ts";
import { recogniseStatement } from "./recognise/index.ts";

/** "Geladeira", R$ 1.000,00 in three from the twelfth of July, on a card closing on the third. */
const fridge: ExistingRecord[] = [
	["2026-07-12", -33_334, 1, "2026-08"],
	["2026-08-12", -33_333, 2, "2026-09"],
	["2026-09-12", -33_333, 3, "2026-10"],
].map(([day, amount, number, invoice]) => ({
	id: `part${number}`,
	happenedOn: String(day),
	amount: Number(amount),
	description: `Geladeira ${number}/3`,
	externalId: null,
	kind: "expense",
	invoiceMonth: String(invoice),
	installment: { group: "fridge", number: Number(number), count: 3 },
}));

describe("a part printed on an invoice", () => {
	it("is the part already written, whatever the bank calls it", () => {
		const read = recogniseStatement(
			["Fatura do cartao", "Vencimento: 10/09/2026", "12/07 MAGAZINELUIZA PARC 02/03 333,33"],
			{ today: "2026-09-22" },
		);
		const [line] = read.entries;
		if (!line?.installment) throw new Error("no part read");
		const match = matchPart({ ...line, installment: line.installment }, fridge, "2026-09");
		expect(match).toMatchObject({ kind: "same", record: { id: "part2" } });
	});

	it("is the same part on another invoice, which can be moved", () => {
		const match = matchPart(
			{
				amount: -33_333,
				description: "MAGAZINELUIZA",
				installment: { number: 2, count: 3, sure: true },
			},
			fridge,
			"2026-10",
		);
		expect(match).toMatchObject({ kind: "elsewhere", record: { id: "part2" } });
	});

	it("is the same as a plan typed from its middle", () => {
		const typed: ExistingRecord[] = [
			{
				id: "typed",
				happenedOn: "2026-09-12",
				amount: -15_000,
				description: "Loja X 1/6",
				externalId: null,
				kind: "expense",
				invoiceMonth: "2026-10",
				installment: { group: "typed", number: 1, count: 6 },
			},
		];
		const match = matchPart(
			{ amount: -15_000, description: "Loja X", installment: { number: 5, count: 10, sure: true } },
			typed,
			"2026-10",
		);
		expect(match).toMatchObject({ kind: "same", record: { id: "typed" } });
	});

	it("only looks the same when nothing but the amount answers, and is new otherwise", () => {
		const purchase: ExistingRecord = {
			id: "one",
			happenedOn: "2026-09-12",
			amount: -15_000,
			description: "Outra loja",
			externalId: null,
			kind: "expense",
			invoiceMonth: "2026-10",
			installment: null,
		};
		const line = {
			amount: -15_000,
			description: "Loja X",
			installment: { number: 5, count: 10, sure: true },
		};
		expect(matchPart(line, [purchase], "2026-10").kind).toBe("looksSame");
		expect(matchPart(line, [], "2026-10").kind).toBe("new");
	});
});
