// Cards, on every adapter.
//
// What is checked here is the one thing a card can get wrong in a way nobody notices:
// reaching an account it has no business reaching. A purchase written against the meal
// voucher but stamped with the credit card would land on an invoice that never charged
// it, and every screen that adds up a card would be adding up a story. So each rule is
// checked from the outside, through the repository, exactly as a screen would hit it.

import { todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { type AdapterUnderTest, LATER, prepare } from "./setup.ts";

export function runCardConformance(adapter: AdapterUnderTest): void {
	describe("benefit accounts", () => {
		it("works out what is left from the allowance, because nothing is written when it lands", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					initialBalance: 64_500,
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4_500,
					happenedOn: todayIn("America/Sao_Paulo"),
					description: "Almoco",
					accountId: voucher.id,
				});

				const state = await fixture.asAna.accounts.benefitLeft(
					voucher.id,
					todayIn("America/Sao_Paulo"),
				);
				// Written down today, so no allowance has landed since: what was typed, less
				// the lunch. The card being credited is not a record anybody wrote.
				expect(state?.landed).toBe(0);
				expect(state?.left).toBe(60_000);
				expect(state?.quota).toBe(90_000);
			} finally {
				await fixture.close();
			}
		});

		it("says nothing for a voucher with no allowance on it, which every old one is", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale antigo",
					benefit: "meal",
					initialBalance: 30_000,
				});
				expect(
					await fixture.asAna.accounts.benefitLeft(voucher.id, todayIn("America/Sao_Paulo")),
				).toBeNull();
			} finally {
				await fixture.close();
			}
		});

		it("refuses an allowance on an account that is not a benefit card", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta corrente",
						quotaAmount: 90_000,
						quotaDay: 5,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses income on a benefit card, because the credit is not a record", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});
				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 90_000,
						happenedOn: "2026-09-05",
						description: "Credito do vale",
						accountId: voucher.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses moving money out of a benefit card, and takes a top up into one", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
					initialBalance: 100_000,
				});
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});

				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "transfer",
						amount: 10_000,
						happenedOn: "2026-09-10",
						description: "Sacando o vale",
						accountId: voucher.id,
						counterAccountId: checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// The other direction is real: cards like Caju and Flash take a top up.
				const [topUp] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Recarga",
					accountId: checking.id,
					counterAccountId: voucher.id,
				});
				expect(topUp?.kind).toBe("transfer");
			} finally {
				await fixture.close();
			}
		});

		it("counts the allowance as money that came in, on its own line", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 25_500,
					happenedOn: "2026-09-10",
					description: "Almoco",
					accountId: voucher.id,
				});

				const month = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});

				// The lunch is spending like any other. Without the credit beside it the month
				// would close worse by exactly what was eaten, and nobody writes the credit
				// down because nothing of theirs moved.
				expect(month.benefits).toBe(90_000);
				expect(month.expense).toBe(25_500);
				expect(month.left).toBe(90_000 - 25_500);

				// And not a real before the card existed. The allowance was counted over any
				// range at all, so a card written down this month paid a household nine hundred
				// in every month back to the beginning of its records, and every one of those
				// months read as though it had ended better than it did.
				const before = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-03-01",
					to: "2026-03-31",
				});
				expect(before.benefits).toBe(0);
				expect(before.left).toBe(0);

				// Nor after it is archived, for the same reason from the other end.
				await fixture.asAna.accounts.archive(voucher.id);
				const after = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-12-01",
					to: "2026-12-31",
				});
				expect(after.benefits).toBe(0);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a day that is not a day of the month", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "voucher",
						name: "Vale",
						benefit: "meal",
						quotaAmount: 90_000,
						quotaDay: 32,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});
	});

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

		/**
		 * Removing a card takes the card and nothing else.
		 *
		 * This is the test that has to keep passing. A card is a label on money that
		 * already moved, and money that already moved is not undone by throwing away the
		 * piece of plastic: the account, the balance, the invoice it was charged on and
		 * the invoice month stamped on it all belong to the record, not to the card.
		 */
		it("takes only the card away, and leaves the invoice and the money behind", async () => {
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
					name: "Do banco",
					lastFour: "4417",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});

				const [onDebit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: card.id,
				});
				const parts = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Fone",
					accountId: invoice.id,
					cardId: card.id,
					installments: 3,
				});

				await fixture.asAna.cards.remove(card.id);
				await expect(fixture.asAna.cards.get(card.id)).rejects.toBeInstanceOf(NotFoundError);

				// The two accounts the card reached are untouched.
				expect((await fixture.asAna.accounts.list(space.id)).map((one) => one.name).sort()).toEqual(
					["Cartao", "Conta corrente"],
				);

				// The money is still charged where it was charged, which is what a balance
				// is made of.
				const kept = await fixture.asAna.transactions.get(onDebit?.id ?? "");
				expect(kept.accountId).toBe(checking.id);
				const balances = await fixture.asAna.transactions.balances(space.id, LATER);
				expect(balances.find((one) => one.accountId === checking.id)?.settled).toBe(-2_000);

				// And the invoice still has every part of the purchase, on the month it was
				// stamped with when it was written.
				const onInvoice = await fixture.asAna.transactions.list({
					spaceId: space.id,
					accountId: invoice.id,
					invoiceMonth: "2026-10",
				});
				expect(onInvoice).toHaveLength(1);
				expect(parts).toHaveLength(3);
				expect(
					(
						await fixture.asAna.transactions.list({
							spaceId: space.id,
							accountId: invoice.id,
						})
					).reduce((sum, one) => sum + one.amount, 0),
				).toBe(-90_000);
			} finally {
				await fixture.close();
			}
		});

		it("takes the cards with it when the account they reach is removed", async () => {
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
				const onBoth = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Do banco",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});
				const onlyDebit = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Da conta",
					debitAccountId: checking.id,
				});
				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: onlyDebit.id,
				});

				await fixture.asAna.accounts.remove(checking.id);

				// Both cards reached that account, so neither is a card any more. A card
				// left naming an account that is gone would still be offered on a record
				// it could never be saved with.
				expect(await fixture.asAna.cards.list(space.id)).toEqual([]);
				await expect(fixture.asAna.cards.get(onBoth.id)).rejects.toBeInstanceOf(NotFoundError);
				await expect(fixture.asAna.cards.get(onlyDebit.id)).rejects.toBeInstanceOf(NotFoundError);

				// The other account is untouched, and so is the record.
				expect((await fixture.asAna.accounts.list(space.id)).map((one) => one.name)).toEqual([
					"Cartao",
				]);
				expect((await fixture.asAna.transactions.get(record?.id ?? "")).amount).toBe(-2_000);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * VA and VR became one pot. Two things have to be true of that, and only one of
		 * them is about code somebody will read again: the rows that already said VA have
		 * to say the one that is left, and a row that arrives afterwards still saying VA,
		 * from a device running an older build, has to be read as the one that is left
		 * rather than as a value nothing knows how to show.
		 */
		it("folds the benefit that was retired into the one that replaced it", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale",
					benefit: "meal",
				});

				// A row as an older build would have written it, straight into the table.
				await fixture.driver.run(`UPDATE "accounts" SET "benefit" = 'food' WHERE "id" = ?`, [
					account.id,
				]);
				expect((await fixture.asAna.accounts.get(account.id)).benefit).toBe("meal");

				// And the migration itself, run again over a row that has it.
				await fixture.driver.run(`DELETE FROM "schema_migrations" WHERE "id" = ?`, [
					"0012_one_food_benefit",
				]);
				expect(await migrate(fixture.driver)).toEqual(["0012_one_food_benefit"]);

				const rows = await fixture.driver.all(`SELECT "benefit" FROM "accounts" WHERE "id" = ?`, [
					account.id,
				]);
				expect(rows[0]?.benefit).toBe("meal");
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
