// Cards, on every adapter.
//
// What is checked here is the one thing a card can get wrong in a way nobody notices:
// reaching an account it has no business reaching. A purchase written against the meal
// voucher but stamped with the credit card would land on an invoice that never charged
// it, and every screen that adds up a card would be adding up a story. So each rule is
// checked from the outside, through the repository, exactly as a screen would hit it.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runCardConformance(adapter: AdapterUnderTest): void {
	describe("cards", () => {
		it("gives a cartao multiplo both of its accounts, and keeps them apart", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});

				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Nubank",
					lastFour: "1234",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});
				expect(card.creditAccountId).toBe(invoice.id);
				expect(card.debitAccountId).toBe(checking.id);

				// The same plastic, used the two ways it can be used. One lands on the
				// invoice with a month stamped on it, the other leaves the balance today.
				const [onCredit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 9_900,
					happenedOn: "2026-09-10",
					description: "Livraria",
					accountId: invoice.id,
					cardId: card.id,
				});
				const [onDebit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4_200,
					happenedOn: "2026-09-10",
					description: "Padaria",
					accountId: checking.id,
					cardId: card.id,
				});

				expect(onCredit?.invoiceMonth).toBe("2026-10");
				expect(onDebit?.invoiceMonth).toBeNull();
				expect(onCredit?.cardId).toBe(card.id);
				expect(onDebit?.cardId).toBe(card.id);

				const byCard = await fixture.asAna.transactions.list({
					spaceId: space.id,
					cardId: card.id,
				});
				expect(byCard.map((one) => one.description).sort()).toEqual(["Livraria", "Padaria"]);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a card whose accounts do not match what its kind promises", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});

				// A credit card with no invoice cannot charge anything.
				await expect(
					fixture.asAna.cards.create({ spaceId: space.id, kind: "credit", name: "Sem fatura" }),
				).rejects.toBeInstanceOf(RuleError);

				// A debit card that points at an invoice is a credit card mislabelled.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "debit",
						name: "Debito",
						debitAccountId: invoice.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// And an invoice only lives on a credit account.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "credit",
						name: "Credito",
						creditAccountId: checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// A benefit card spends a balance and never charges an invoice.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "benefit",
						name: "VR",
						debitAccountId: checking.id,
						creditAccountId: invoice.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "debit",
						name: "Digitos",
						debitAccountId: checking.id,
						lastFour: "12",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("never lets a card reach an account of another space", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Pessoal", kind: "personal" });
				const elsewhere = await fixture.asJoao.accounts.create({
					spaceId: theirs.id,
					kind: "checking",
					name: "Conta do Joao",
				});

				await expect(
					fixture.asAna.cards.create({
						spaceId: mine.id,
						kind: "debit",
						name: "Emprestado",
						debitAccountId: elsewhere.id,
					}),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses to stamp a record with a card that does not reach its account", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "benefit",
					name: "VR",
					debitAccountId: voucher.id,
				});

				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 3_500,
						happenedOn: "2026-09-10",
						description: "Almoco",
						accountId: checking.id,
						cardId: card.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// Archived, it is not something to write with either.
				await fixture.asAna.cards.archive(card.id);
				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 3_500,
						happenedOn: "2026-09-10",
						description: "Almoco",
						accountId: voucher.id,
						cardId: card.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				expect(await fixture.asAna.cards.list(space.id)).toEqual([]);
				expect((await fixture.asAna.cards.list(space.id, { includeArchived: true })).length).toBe(
					1,
				);
			} finally {
				await fixture.close();
			}
		});

		it("drops the card when a record moves somewhere the card does not reach", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const cash = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Carteira",
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Debito",
					debitAccountId: checking.id,
				});

				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: card.id,
				});
				expect(record?.cardId).toBe(card.id);

				const moved = await fixture.asAna.transactions.update(record?.id ?? "", {
					accountId: cash.id,
				});
				expect(moved.cardId).toBeNull();
			} finally {
				await fixture.close();
			}
		});

		it("keeps the record when the card it named is removed", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Debito",
					debitAccountId: checking.id,
				});
				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: card.id,
				});

				await fixture.asAna.cards.remove(card.id);
				await expect(fixture.asAna.cards.get(card.id)).rejects.toBeInstanceOf(NotFoundError);

				// The money is still charged to the account, which is what a balance is
				// made of. Only the name of the plastic is gone.
				const kept = await fixture.asAna.transactions.get(record?.id ?? "");
				expect(kept.accountId).toBe(checking.id);
				const balances = await fixture.asAna.transactions.balances(space.id);
				expect(balances.find((one) => one.accountId === checking.id)?.settled).toBe(-2_000);
			} finally {
				await fixture.close();
			}
		});

		it("lets only a voucher account say which benefit it holds", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta corrente",
						benefit: "transport",
					}),
				).rejects.toBeInstanceOf(RuleError);

				const transport = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale transporte",
					benefit: "transport",
				});
				expect(transport.benefit).toBe("transport");
			} finally {
				await fixture.close();
			}
		});
	});
}
