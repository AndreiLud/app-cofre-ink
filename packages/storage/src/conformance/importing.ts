// What reading a file writes, on every adapter. Part 2, section E of the request for 2.0.0.

import { describe, expect, it } from "vitest";
import { RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** A current account, and a card that closes on the third and falls due on the tenth. */
async function ready(adapter: AdapterUnderTest) {
	const fixture = await prepare(adapter);
	const on = fixture.asAna;
	const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
	const checking = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
	});
	const card = await on.accounts.create({
		spaceId: space.id,
		kind: "credit",
		name: "Itau",
		closingDay: 3,
		dueDay: 10,
		creditLimit: 1_000_000,
	});
	return { fixture, on, spaceId: space.id, checking, card };
}

export function runImportingConformance(adapter: AdapterUnderTest): void {
	describe("reading a file in", () => {
		// E.7.3: an invoice lists the holder's purchases and an additional card's under headings
		// of their own, and the import took one card for the whole file.
		it("gives each line of an invoice the card it was under", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const holder = await on.cards.create({
					spaceId,
					kind: "credit",
					name: "Itau",
					lastFour: "1234",
					creditAccountId: setup.card.id,
				});
				const extra = await on.cards.create({
					spaceId,
					kind: "credit",
					name: "Itau adicional",
					lastFour: "5678",
					creditAccountId: setup.card.id,
				});
				const written = await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					cardId: holder.id,
					records: [
						{ happenedOn: "2026-09-12", amount: -1840, description: "Padaria" },
						{
							happenedOn: "2026-09-13",
							amount: -13_160,
							description: "Mercado",
							cardId: extra.id,
						},
					],
				});
				const rows = await Promise.all(written.ids.map((id) => on.transactions.get(id)));
				expect(rows.map((row) => row.cardId)).toEqual([holder.id, extra.id]);

				// A card that reaches another account stops the whole file.
				const other = await on.cards.create({
					spaceId,
					kind: "debit",
					name: "Debito",
					debitAccountId: setup.checking.id,
				});
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						records: [
							{ happenedOn: "2026-09-14", amount: -500, description: "Cafe", cardId: other.id },
						],
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await setup.fixture.close();
			}
		});
	});
}
