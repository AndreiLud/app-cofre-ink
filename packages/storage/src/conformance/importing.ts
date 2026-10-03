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

		// E.11: the payment on an invoice was income on the card, and the month earned what it paid.
		it("writes the payment on an invoice as the invoice before it, paid from the bank", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const before = await on.reports.totals({ spaceId, from: "2026-09-01", to: "2026-09-30" });
				const written = await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					invoiceMonth: "2026-09",
					records: [
						{ happenedOn: "2026-08-20", amount: 5000, description: "Padaria", nature: "purchase" },
						{
							happenedOn: "2026-09-05",
							amount: -100_000,
							description: "Pagamento da fatura de agosto de 2026 (Itau)",
							nature: "payment",
							paymentFrom: setup.checking.id,
						},
					],
				});
				const payment = await on.transactions.get(written.ids[1] ?? "");
				expect([
					payment.kind,
					payment.amount,
					payment.accountId,
					payment.counterAccountId,
					payment.invoiceMonth,
					payment.invoiceMonthByHand,
				]).toEqual(["transfer", 100_000, setup.checking.id, setup.card.id, "2026-08", true]);
				const after = await on.reports.totals({ spaceId, from: "2026-09-01", to: "2026-09-30" });
				expect(after.income).toBe(before.income);

				// Never from a card, and never with no account at all.
				const line = {
					happenedOn: "2026-09-05",
					amount: -1000,
					description: "Pagamento",
					nature: "payment" as const,
				};
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-09",
						records: [line],
					}),
				).rejects.toMatchObject({ rule: "paymentNeedsItsAccount" });
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-09",
						records: [{ ...line, paymentFrom: setup.card.id }],
					}),
				).rejects.toMatchObject({ rule: "paymentFromMoney" });
			} finally {
				await setup.fixture.close();
			}
		});

		// E.12: a refund of a purchase already written was income on the card, and the month kept
		// the purchase it did not keep.
		it("takes back the purchase a refund undoes, in the same write", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const [purchase] = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 5000,
					happenedOn: "2026-09-02",
					description: "Loja X",
					accountId: setup.card.id,
				});
				const before = await on.reports.totals({ spaceId, from: "2026-09-01", to: "2026-09-30" });
				const written = await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					invoiceMonth: "2026-10",
					records: [
						{
							happenedOn: "2026-09-14",
							amount: 5000,
							description: "Estorno Loja X",
							nature: "credit",
							reverses: purchase?.id ?? "",
						},
					],
				});
				expect(written.written).toBe(0);
				const after = await on.reports.totals({ spaceId, from: "2026-09-01", to: "2026-09-30" });
				expect(before.expense - after.expense).toBe(5000);
				expect(await on.transactions.list({ spaceId, accountId: setup.card.id })).toEqual([]);

				// A refund of part of it does not take a purchase back.
				const [other] = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 9000,
					happenedOn: "2026-09-03",
					description: "Loja Y",
					accountId: setup.card.id,
				});
				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-10",
						records: [
							{
								happenedOn: "2026-09-14",
								amount: 3000,
								description: "Estorno Loja Y",
								nature: "credit",
								reverses: other?.id ?? "",
							},
						],
					}),
				).rejects.toMatchObject({ rule: "refundedPurchaseIsNotHere" });
			} finally {
				await setup.fixture.close();
			}
		});

		// E.13: a part printed on an invoice was one record; the plan behind it went unwritten.
		it("writes a plan from the part an invoice prints to the last", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const written = await on.imports.create({
					spaceId,
					accountId: setup.card.id,
					invoiceMonth: "2026-10",
					records: [
						{
							happenedOn: "2026-09-12",
							amount: 15_000,
							description: "Loja X",
							nature: "installment",
							installment: { number: 5, count: 10 },
						},
					],
				});
				const rows = await Promise.all(written.ids.map((id) => on.transactions.get(id)));
				expect(
					rows.map((row) => [row.description, row.happenedOn, row.invoiceMonth, row.amount]),
				).toEqual([
					["Loja X 5/10", "2026-09-12", "2026-10", -15_000],
					["Loja X 6/10", "2026-10-12", "2026-11", -15_000],
					["Loja X 7/10", "2026-11-12", "2026-12", -15_000],
					["Loja X 8/10", "2026-12-12", "2027-01", -15_000],
					["Loja X 9/10", "2027-01-12", "2027-02", -15_000],
					["Loja X 10/10", "2027-02-12", "2027-03", -15_000],
				]);
				expect(new Set(rows.map((row) => row.installmentGroup)).size).toBe(1);

				await expect(
					on.imports.create({
						spaceId,
						accountId: setup.card.id,
						invoiceMonth: "2026-10",
						records: [
							{
								happenedOn: "2026-09-12",
								amount: 1000,
								description: "Loja Y",
								nature: "installment",
								installment: { number: 2, count: 49 },
							},
						],
					}),
				).rejects.toMatchObject({ rule: "tooManyInstallments" });

				// What was already there comes back with its part, on this invoice.
				const known = await on.imports.existing(spaceId, {
					accountId: setup.card.id,
					invoiceMonth: "2026-11",
					from: "2026-11-01",
					to: "2026-11-30",
				});
				expect(
					known.filter((row) => row.installment?.number === 6).map((row) => row.invoiceMonth),
				).toEqual(["2026-11"]);
			} finally {
				await setup.fixture.close();
			}
		});

		// E.16: the payment of a card on the statement of the account it left was money spent.
		it("writes a card paid from a statement as the transfer that pays its invoice", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const written = await on.imports.create({
					spaceId,
					accountId: setup.checking.id,
					records: [
						{
							happenedOn: "2026-10-10",
							amount: -123_456,
							description: "Pagamento da fatura de outubro de 2026 (Itau)",
							nature: "cardPayment",
							paysCard: setup.card.id,
							paysInvoice: "2026-10",
						},
					],
				});
				const payment = await on.transactions.get(written.ids[0] ?? "");
				expect([
					payment.kind,
					payment.amount,
					payment.accountId,
					payment.counterAccountId,
					payment.invoiceMonth,
				]).toEqual(["transfer", 123_456, setup.checking.id, setup.card.id, "2026-10"]);
				const october = await on.invoices.get(setup.card.id, "2026-10", "2026-10-28");
				expect(october.paid).toBe(123_456);
				// And the statement read again finds it, as money that left the account.
				const known = await on.imports.existing(spaceId, {
					from: "2026-10-10",
					to: "2026-10-10",
					accountId: setup.checking.id,
				});
				expect(known.map((row) => [row.id, row.amount, row.moved])).toEqual([
					[payment.id, -123_456, true],
				]);
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
