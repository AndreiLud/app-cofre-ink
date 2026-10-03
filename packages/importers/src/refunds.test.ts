// Part 2, E.12 of the request for 2.0.0: a refund and the purchase it takes back.

import { describe, expect, it } from "vitest";
import { recogniseStatement } from "./recognise/index.ts";
import { refundedPurchase, refundKey, refundsInFile } from "./refunds.ts";

describe("a refund and its purchase", () => {
	it("takes off what a refund and an acquirer add to the name", () => {
		expect(refundKey("Estorno MP*Loja X")).toBe(refundKey("Loja X"));
		expect(refundKey("DEVOLUCAO PAG*Loja X")).toBe("loja x");
	});

	it("pairs the two of one invoice, so neither is written", () => {
		const read = recogniseStatement(
			[
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"Total desta fatura R$ 0,00",
				"02/09/2026 Loja X 50,00",
				"14/09/2026 Estorno Loja X -50,00",
			],
			{ today: "2026-09-22" },
		);
		expect(refundsInFile(read.entries)).toEqual(new Map([[1, 0]]));
	});

	it("finds the purchase already written, and none for part of it", () => {
		const refund = {
			happenedOn: "2026-09-14",
			amount: 5000,
			description: "Estorno Loja X",
			nature: "credit",
		};
		const written = [
			{
				id: "later",
				happenedOn: "2026-09-20",
				amount: -5000,
				description: "Loja X",
				externalId: null,
				kind: "expense" as const,
			},
			{
				id: "purchase",
				happenedOn: "2026-09-02",
				amount: -5000,
				description: "LOJA X",
				externalId: null,
				kind: "expense" as const,
			},
		];
		expect(refundedPurchase(refund, written)?.id).toBe("purchase");
		expect(refundedPurchase({ ...refund, amount: 3000 }, written)).toBe(null);
	});
});
