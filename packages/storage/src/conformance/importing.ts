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

		// E.10: every line of an invoice was written by its sign and on the invoice of its own day,
		// so on a card that closes on the third the purchase of the third went to November.
		it("writes an invoice on the month it is, chosen by hand, its purchases as money out", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const written = await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					invoiceMonth: "2026-10",
					records: [
						{ happenedOn: "2026-10-03", amount: 1840, description: "Padaria", nature: "purchase" },
						{ happenedOn: "2026-09-20", amount: -320, description: "IOF", nature: "fee" },
					],
				});
				const rows = await Promise.all(written.ids.map((id) => on.transactions.get(id)));
				expect(
					rows.map((row) => [row.kind, row.amount, row.invoiceMonth, row.invoiceMonthByHand]),
				).toEqual([
					["expense", -1840, "2026-10", true],
					["expense", -320, "2026-10", true],
				]);

				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-13",
						records: [{ happenedOn: "2026-10-03", amount: -100, description: "Cafe" }],
					}),
				).rejects.toThrow();
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.checking.id,
						invoiceMonth: "2026-10",
						records: [{ happenedOn: "2026-10-03", amount: -100, description: "Cafe" }],
					}),
				).rejects.toMatchObject({ rule: "invoiceIsOfACard" });
			} finally {
				await setup.fixture.close();
			}
		});

		it("asks which invoice a file is for a card with no closing day", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				// A card from before 2.0.0, written down without its two days, which nothing can
				// write any more.
				const old = await on.accounts.create({
					spaceId,
					kind: "credit",
					name: "Cartao antigo",
					closingDay: 3,
					dueDay: 10,
				});
				await setup.fixture.driver.run(
					`UPDATE "accounts" SET "closing_day" = NULL, "due_day" = NULL WHERE "id" = ?`,
					[old.id],
				);
				const line = { happenedOn: "2026-10-03", amount: -100, description: "Cafe" };
				await expect(
					on.imports.create({ spaceId, accountId: old.id, records: [line] }),
				).rejects.toMatchObject({ rule: "invoiceNeedsItsMonth" });
				const written = await on.imports.create({
					spaceId,
					accountId: old.id,
					invoiceMonth: "2026-10",
					records: [line],
				});
				expect((await on.transactions.get(written.ids[0] ?? "")).invoiceMonth).toBe("2026-10");
			} finally {
				await setup.fixture.close();
			}
		});

		// E.10.2: the one record a card was written down with for its open invoice is replaced by
		// the invoice that details it, in the same write.
		it("removes the record an invoice details, in the same write", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const [soFar] = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 15_000,
					happenedOn: "2026-09-20",
					description: "Fatura em aberto hoje",
					accountId: setup.card.id,
				});
				await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					invoiceMonth: "2026-10",
					removes: [soFar?.id ?? ""],
					records: [
						{ happenedOn: "2026-09-12", amount: 5000, description: "Padaria", nature: "purchase" },
						{
							happenedOn: "2026-09-13",
							amount: 10_000,
							description: "Mercado",
							nature: "purchase",
						},
					],
				});
				const left = await on.transactions.list({ spaceId, accountId: setup.card.id });
				expect(left.map((row) => row.description).sort()).toEqual(["Mercado", "Padaria"]);

				// What is not on this account is not removed, and nothing is written.
				const [elsewhere] = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 900,
					happenedOn: "2026-09-20",
					description: "Cafe",
					accountId: setup.checking.id,
				});
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-10",
						removes: [elsewhere?.id ?? ""],
						records: [
							{ happenedOn: "2026-09-14", amount: 100, description: "Pao", nature: "purchase" },
						],
					}),
				).rejects.toMatchObject({ rule: "replacedRecordIsNotHere" });
				expect(await on.transactions.list({ spaceId, accountId: setup.card.id })).toHaveLength(2);
			} finally {
				await setup.fixture.close();
			}
		});
	});
}
