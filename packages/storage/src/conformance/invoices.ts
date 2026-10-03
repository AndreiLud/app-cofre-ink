// A card invoice, on every adapter.
//
// What is checked here is the half that did not exist: whether an invoice was paid. The
// other half, what it charged, was always a filter over records and is checked with the
// cards. A payment is an ordinary transfer into the card account naming the invoice it
// pays, so nothing here reaches past the repository to look at a row.

import { amountToPay, canSpendThisMonth } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

const TODAY = "2026-09-29";

/** A space with a current account and a card that closes on the third, due on the tenth. */
async function readyCard(adapter: AdapterUnderTest) {
	const fixture = await prepare(adapter);
	const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
	const checking = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
		initialBalance: 500_000,
	});
	const card = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "credit",
		name: "Cartao",
		closingDay: 3,
		dueDay: 10,
		creditLimit: 500_000,
	});
	return { fixture, spaceId: space.id, checking, card };
}

export function runInvoiceConformance(adapter: AdapterUnderTest): void {
	describe("invoices", () => {
		// Part 1, F.3 of the request for 2.0.0: the month on paper for August, printed in
		// October, summed every purchase and payment whatever its day, so the card could come
		// out paid, a card written down after August appeared at nought, and the invoice that
		// had closed and was owed was not in the table at all.
		it("reads the cards as they stood on a day that has gone", async () => {
			const ready = await readyCard(adapter);
			try {
				const on = ready.fixture.asAna;
				const write = (amount: number, happenedOn: string, description: string) =>
					on.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount,
						happenedOn,
						description,
						accountId: ready.card.id,
					});
				// August's invoice closed on the third, owed 300 and was paid on the tenth.
				await write(30_000, "2026-07-20", "Julho");
				await on.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 30_000,
					happenedOn: "2026-08-10",
					month: "2026-08",
					description: "Pagamento",
				});
				// September's had 500 by the end of August, and 200 more on the first.
				await write(50_000, "2026-08-20", "Agosto");
				await write(20_000, "2026-09-01", "Setembro");
				await on.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 50_000,
					happenedOn: "2026-09-10",
					month: "2026-09",
					description: "Pagamento",
				});
				// A card written down later, which did not exist on the day.
				await on.accounts.create({
					spaceId: ready.spaceId,
					kind: "credit",
					name: "Cartao novo",
					closingDay: 3,
					dueDay: 10,
				});

				const asItStood = await on.invoices.standing(ready.spaceId, "2026-08-31", {
					asItStood: true,
				});
				expect(asItStood.map((one) => one.account.name)).toEqual(["Cartao"]);
				const card = asItStood[0];
				// The open invoice holds what had been bought by then, and is not paid.
				expect(card?.open).toMatchObject({ month: "2026-09", charged: 50_000, paid: 0 });
				expect(card?.open.scheduled).toBe(0);
				// August's, closed on the third and paid on the tenth, owes nothing.
				expect(card?.owing.map((one) => one.month)).toEqual([]);

				// Read on the fifth of August, before it was paid, July's purchase is the invoice
				// that closed and is still owed.
				const earlier = await on.invoices.standing(ready.spaceId, "2026-08-05", {
					asItStood: true,
				});
				expect(earlier[0]?.owing.map((one) => [one.month, one.left])).toEqual([
					["2026-08", 30_000],
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 2, B.7.1, B.7.2 and B.7.5 of the request for 2.0.0: a card archived with its last
		// invoice still owed vanished from the overview, the months ahead and the invoices,
		// while the bank still wanted 640 of it. It stays while something is owed, it can be
		// paid in either of the two ways an invoice is paid, and it goes once it is paid.
		it("keeps an archived card while it still owes, and lets it be paid", async () => {
			const ready = await readyCard(adapter);
			try {
				const on = ready.fixture.asAna;
				await on.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 64_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});
				await on.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 10_000,
					happenedOn: "2026-08-10",
					description: "Antes",
					accountId: ready.card.id,
				});
				await on.accounts.archive(ready.card.id);

				const owing = await on.invoices.standing(ready.spaceId, TODAY);
				expect(owing.map((one) => [one.account.id, one.open.left])).toEqual([
					[ready.card.id, 64_000],
				]);
				// The months ahead pay it: 640 open and 100 already late, in the first month.
				const ahead = await on.projections.monthsAhead({
					spaceId: ready.spaceId,
					from: "2026-10",
					months: 2,
					today: TODAY,
				});
				expect(ahead.months[0]?.expenseFrom.written).toBe(74_000);

				// The one before, by marking it paid, and the open one by paying it.
				expect(
					await on.invoices.markPaidUntil({
						accountId: ready.card.id,
						month: "2026-10",
						fromAccountId: ready.checking.id,
						today: TODAY,
						description: "Pagamento {{month}}",
					}),
				).toBe(1);
				await on.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 64_000,
					happenedOn: TODAY,
					month: "2026-10",
					description: "Pagamento",
				});
				expect(await on.invoices.standing(ready.spaceId, TODAY)).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 1, G.1.3 of the request for 2.0.0: on a server the payment the month screen wrote
		// for a card lost the invoice it pays, and paid the oldest invoice still owed instead.
		// Its mark says the month, and the repair that travels gives it that invoice.
		it("gives a payment the month screen wrote with no invoice the invoice of its month", async () => {
			const ready = await readyCard(adapter);
			try {
				const on = ready.fixture.asAna;
				const old = (month: string, day: string) =>
					on.transactions.create({
						spaceId: ready.spaceId,
						kind: "transfer",
						amount: 30_000,
						happenedOn: day,
						description: "Pagamento da fatura",
						accountId: ready.checking.id,
						counterAccountId: ready.card.id,
						externalId: `mes:${month}:payment`,
					});
				const [september] = await old("2026-09", "2026-09-10");
				const [october] = await old("2026-10", "2026-10-10");
				expect(september?.invoiceMonth).toBeNull();

				const done = await on.repairs.run(ready.spaceId);
				expect(done.paymentsGivenTheirInvoice).toBe(2);
				expect((await on.transactions.get(september?.id ?? "")).invoiceMonth).toBe("2026-09");
				expect((await on.transactions.get(october?.id ?? "")).invoiceMonth).toBe("2026-10");
				// And once is enough.
				expect((await on.repairs.run(ready.spaceId)).paymentsGivenTheirInvoice).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 1, G.6 of the request for 2.0.0: paying the invoice of "2026-13" wrote the payment,
		// and from then on every reading of an invoice in the space failed. The month is refused
		// where a record is written, and one written before is cleared by the repair, so the
		// payment pays the oldest invoice still owed, as any payment that names none does.
		it("refuses a month that does not exist, and clears one already written", async () => {
			const ready = await readyCard(adapter);
			try {
				const on = ready.fixture.asAna;
				const [purchase] = await on.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-01",
					description: "Mercado",
					accountId: ready.card.id,
				});
				const itsInvoice = purchase?.invoiceMonth ?? "";
				const paying = (month: string) =>
					on.invoices.pay({
						accountId: ready.card.id,
						fromAccountId: ready.checking.id,
						amount: 90_000,
						happenedOn: "2026-09-10",
						month,
						description: "Pagamento da fatura",
					});
				await expect(paying("2026-13")).rejects.toThrow("2026-13");
				await expect(on.invoices.get(ready.card.id, "2026-13", TODAY)).rejects.toThrow("2026-13");
				await expect(
					on.invoices.closedOn({ accountId: ready.card.id, month: "2026-09", day: "2026-02-31" }),
				).rejects.toThrow("2026-02-31");

				// One written by a release that did not check, which is a row and not a request.
				const written = await paying("2026-09");
				for (const id of [written.id, purchase?.id ?? ""]) {
					await ready.fixture.driver.run(
						`UPDATE "transactions" SET "invoice_month" = '2026-13' WHERE "id" = ?`,
						[id],
					);
				}
				await expect(on.invoices.standing(ready.spaceId, TODAY)).rejects.toThrow("2026-13");

				// The payment names none, and the purchase takes the invoice of its day again.
				const done = await on.repairs.run(ready.spaceId);
				expect(done.impossibleMonthsCleared).toBe(2);
				expect((await on.transactions.get(written.id)).invoiceMonth).toBeNull();
				expect((await on.transactions.get(purchase?.id ?? "")).invoiceMonth).toBe(itsInvoice);
				const standing = await on.invoices.standing(ready.spaceId, TODAY);
				expect(standing.map((one) => one.owing.length)).toEqual([0]);
				expect((await on.repairs.run(ready.spaceId)).impossibleMonthsCleared).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 2, B.7.4: a credit account with no cycle has no invoices, and it vanished with
		// nothing said. A new one is refused, and so is an edit that clears a day; one written
		// before 2.0.0 comes back marked.
		it("asks a card for its two days, and marks an old one written without them", async () => {
			const ready = await readyCard(adapter);
			try {
				const on = ready.fixture.asAna;
				await expect(
					on.accounts.create({ spaceId: ready.spaceId, kind: "credit", name: "Sem dias" }),
				).rejects.toMatchObject({ rule: "cardNeedsACycle" });
				await expect(
					on.accounts.create({
						spaceId: ready.spaceId,
						kind: "credit",
						name: "Meio ciclo",
						closingDay: 3,
					}),
				).rejects.toMatchObject({ rule: "cardNeedsACycle" });
				await expect(on.accounts.update(ready.card.id, { dueDay: null })).rejects.toMatchObject({
					rule: "cardNeedsACycle",
				});

				// As release 1.2.1 left one: the days taken away underneath the repository.
				await ready.fixture.driver.run(
					`UPDATE "accounts" SET "closing_day" = NULL, "due_day" = NULL WHERE "id" = ?`,
					[ready.card.id],
				);
				const standing = await on.invoices.standing(ready.spaceId, TODAY);
				expect(standing.map((one) => [one.account.id, one.cycleMissing])).toEqual([
					[ready.card.id, true],
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("is open until something is paid against it", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 128_450,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices).toHaveLength(1);
				expect(invoices[0]?.month).toBe("2026-10");
				expect(invoices[0]?.charged).toBe(128_450);
				expect(invoices[0]?.standing).toBe("open");
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The invoice a card is written down with, which is the field on the account form.
		 *
		 * The cycle of a card somebody already owns started before they got here, so the form
		 * asks what is on it today and writes one record dated today. Everything after that is
		 * the ordinary path, and this holds it: on the open invoice, and in no total of money.
		 */
		it("puts what was already on the invoice on the open one, and moves no money", async () => {
			const ready = await readyCard(adapter);
			try {
				const written = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 50_000,
					happenedOn: TODAY,
					description: "Fatura em aberto quando o cartao foi cadastrado",
					accountId: ready.card.id,
				});

				expect(written).toHaveLength(1);
				expect(written[0]?.happenedOn).toBe(TODAY);
				// The twenty ninth is past the closing day, so it lands on the invoice of the
				// month after, which is the one still taking purchases.
				expect(written[0]?.invoiceMonth).toBe("2026-10");

				const standing = await ready.fixture.asAna.invoices.standing(ready.spaceId, TODAY);
				expect(standing[0]?.open.month).toBe("2026-10");
				expect(standing[0]?.open.charged).toBe(50_000);
				expect(standing[0]?.unpaid).toBe(null);
				// And it comes off the headroom, because the card has spent it.
				expect(standing[0]?.available).toBe(450_000);

				// No money moved. The current account is untouched and the card owes the amount,
				// which is what a card is: the money leaves when the invoice is paid.
				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, TODAY);
				expect(balances.find((one) => one.accountId === ready.checking.id)?.settled).toBe(500_000);
				expect(balances.find((one) => one.accountId === ready.card.id)?.settled).toBe(-50_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("is paid by a transfer into the card that names the invoice", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 128_450,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});

				await ready.fixture.asAna.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 128_450,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento",
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-11");
				expect(invoices[0]?.paid).toBe(128_450);
				expect(invoices[0]?.left).toBe(0);
				expect(invoices[0]?.standing).toBe("paid");
				expect(invoices[0]?.late).toBe(false);
			} finally {
				await ready.fixture.close();
			}
		});

		it("takes a payment of part of it, and leaves the rest owing without interest", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 128_450,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 50_000,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento",
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-11");
				expect(invoices[0]?.standing).toBe("partlyPaid");
				expect(invoices[0]?.left).toBe(78_450);
				expect(invoices[0]?.late).toBe(true);
			} finally {
				await ready.fixture.close();
			}
		});

		// The case from the request for 2.0.0, part 1, A.2: five thousand in the bank and an
		// invoice of two thousand due in seven days, paid on the due day, which is the day the
		// payment dialog suggests. Release 1.2.1 counted the payment at once, so the invoice
		// left what falls due while the bank still held the money, and what was left to spend
		// read five thousand instead of three until the due day.
		it("pays an invoice from the day of the payment, and not from the day it was written", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 200_000,
					happenedOn: "2026-09-10",
					description: "Notebook",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 200_000,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento",
				});

				const leftToSpend = async (day: string) => {
					const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, day);
					const bank = balances.find((one) => one.accountId === ready.checking.id)?.settled ?? 0;
					const [card] = await ready.fixture.asAna.invoices.standing(ready.spaceId, day);
					const due = [card?.open, ...(card?.owing ?? [])]
						.filter((state) => state !== undefined && state.left > 0)
						.reduce((total, state) => total + (state?.left ?? 0), 0);
					return {
						bank,
						left: canSpendThisMonth({
							spendable: bank,
							comingIn: 0,
							fallingDue: due,
							stillToSave: 0,
						}).amount,
					};
				};

				// Seven days before the due day.
				const [waiting] = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-03");
				expect(waiting?.paid).toBe(0);
				expect(waiting?.left).toBe(200_000);
				expect(waiting?.scheduled).toBe(200_000);
				expect(waiting?.scheduledOn).toBe("2026-10-10");
				expect(waiting?.standing).toBe("open");
				expect(waiting ? amountToPay(waiting) : null).toBe(0);
				expect(await leftToSpend("2026-10-03")).toEqual({ bank: 500_000, left: 300_000 });

				// Marking everything up to it as paid does not pay it a second time.
				expect(
					await ready.fixture.asAna.invoices.markPaidUntil({
						accountId: ready.card.id,
						month: "2026-10",
						fromAccountId: ready.checking.id,
						today: "2026-10-03",
						description: "Pagamento da fatura {{month}}",
					}),
				).toBe(0);

				// On the due day the money leaves and the invoice is paid, and the figure is the same.
				const [paid] = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-10");
				expect(paid?.paid).toBe(200_000);
				expect(paid?.left).toBe(0);
				expect(paid?.scheduled).toBe(0);
				expect(paid?.standing).toBe("paid");
				expect(await leftToSpend("2026-10-10")).toEqual({ bank: 300_000, left: 300_000 });
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 1, A.5 of the request for 2.0.0, answered by decision 2 of part 2: a transfer
		// out of a credit card is a purchase on its invoice. Release 1.2.1 added it the other
		// way round, so 500 taken out of the card made its invoice 500 smaller and its limit
		// 500 larger, while the balance of the card owed 500 more. Both written before 2.0.0,
		// by hand, because nothing new writes one.
		it("reads a transfer out of a card as a purchase, as the balance of the card does", async () => {
			const ready = await readyCard(adapter);
			try {
				const other = await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "credit",
					name: "Outro cartao",
					closingDay: 20,
					dueDay: 27,
				});
				const old = (
					id: string,
					from: string,
					to: string,
					amount: number,
					day: string,
					month: string,
				) =>
					ready.fixture.driver.run(
						`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
						   "amount_in_base", "happened_on", "description", "account_id", "counter_account_id",
						   "invoice_month", "created_by", "created_at", "updated_at", "hlc")
						 VALUES (?, ?, 'transfer', 'settled', ?, 'BRL', ?, ?, 'Antiga', ?, ?, ?, ?, 0, 0, 'stamp1')`,
						[id, ready.spaceId, amount, amount, day, from, to, month, ready.fixture.ana.id],
					);
				// 500 taken out of the card into the current account on the tenth.
				await old("withdrawal", ready.card.id, ready.checking.id, 50_000, "2026-09-10", "2026-10");
				// 300 paid into it from the other card on the fifteenth, which named the invoice
				// of the other card, September's, because the row was charged to that one.
				await old("fromOtherCard", other.id, ready.card.id, 30_000, "2026-09-15", "2026-09");

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices.map((one) => [one.month, one.charged, one.paid, one.left])).toEqual([
					["2026-10", 50_000, 30_000, 20_000],
				]);

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, TODAY);
				const of = (id: string) => balances.find((one) => one.accountId === id)?.settled;
				expect(of(ready.card.id)).toBe(-20_000);
				expect(of(other.id)).toBe(-30_000);

				const [standing] = (
					await ready.fixture.asAna.invoices.standing(ready.spaceId, TODAY)
				).filter((one) => one.account.id === ready.card.id);
				expect(standing?.available).toBe(500_000 - 20_000);

				// And on the card it left, it is a purchase on the invoice it named.
				const theirs = await ready.fixture.asAna.invoices.list(other.id, TODAY);
				expect(theirs.map((one) => [one.month, one.charged])).toEqual([["2026-09", 30_000]]);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 1, A.6 of the request for 2.0.0: what is paid too much on one invoice pays the
		// next, and counts in the limit. October charged 1,000 and was paid 1,500 by its own
		// button; November charged 800, so it owes 300, and the card has 4,700 of its 5,000.
		it("hands what was paid too much on one invoice to the next", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 150_000,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento",
				});
				const [taken] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 80_000,
					happenedOn: "2026-10-05",
					description: "Farmacia",
					accountId: ready.card.id,
				});
				expect(taken?.invoiceMonth).toBe("2026-11");

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-11");
				expect(
					invoices.map((one) => [one.month, one.standing, one.left, one.carriedIn, one.carriedOut]),
				).toEqual([
					["2026-10", "paid", 0, 0, 50_000],
					["2026-11", "partlyPaid", 30_000, 50_000, 0],
				]);

				const [standing] = await ready.fixture.asAna.invoices.standing(ready.spaceId, "2026-10-11");
				expect(standing?.open.left).toBe(30_000);
				expect(standing?.available).toBe(500_000 - 30_000);

				// Which is what the balance of the card says.
				const balances = await ready.fixture.asAna.transactions.balances(
					ready.spaceId,
					"2026-10-11",
				);
				expect(balances.find((one) => one.accountId === ready.card.id)?.settled).toBe(-30_000);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 1, A.7 of the request for 2.0.0. The form sends the day and the account on every
		// save, and the invoice was worked out again whenever either was sent, changed or not.
		describe("which invoice a record stays on", () => {
			it("keeps an old purchase on its invoice when only its category changes", async () => {
				const ready = await readyCard(adapter);
				try {
					const [purchase] = await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 40_000,
						happenedOn: "2026-09-10",
						description: "Mercado",
						accountId: ready.card.id,
					});
					expect(purchase?.invoiceMonth).toBe("2026-10");
					await ready.fixture.asAna.invoices.pay({
						accountId: ready.card.id,
						fromAccountId: ready.checking.id,
						amount: 40_000,
						happenedOn: "2026-10-10",
						month: "2026-10",
						description: "Pagamento",
					});

					// The closing day corrected under Accounts, from the third to the fifteenth.
					await ready.fixture.asAna.accounts.update(ready.card.id, { closingDay: 15 });
					const food = await ready.fixture.asAna.categories.create({
						spaceId: ready.spaceId,
						name: "Comida",
						kind: "expense",
					});
					// What the form sends when only the category was changed.
					const saved = await ready.fixture.asAna.transactions.update(purchase?.id ?? "", {
						happenedOn: "2026-09-10",
						accountId: ready.card.id,
						categoryId: food.id,
					});
					expect(saved.invoiceMonth).toBe("2026-10");

					const [october] = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-11");
					expect([october?.month, october?.standing]).toEqual(["2026-10", "paid"]);
				} finally {
					await ready.fixture.close();
				}
			});

			it("keeps each part of a plan on the first part's invoice plus its number", async () => {
				const ready = await readyCard(adapter);
				try {
					const late = await ready.fixture.asAna.accounts.create({
						spaceId: ready.spaceId,
						kind: "credit",
						name: "Fecha tarde",
						closingDay: 28,
						dueDay: 5,
					});
					// The thirty first of January in three parts: the second falls on the twenty
					// eighth of February, which is the closing day.
					const parts = await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 90_000,
						happenedOn: "2026-01-31",
						description: "Sofa",
						accountId: late.id,
						installments: 3,
					});
					expect(parts.map((part) => [part.happenedOn, part.invoiceMonth])).toEqual([
						["2026-01-31", "2026-02"],
						["2026-02-28", "2026-03"],
						["2026-03-31", "2026-04"],
					]);

					// The second part moved a day earlier stays on March's invoice, beside nothing.
					const second = await ready.fixture.asAna.transactions.update(parts[1]?.id ?? "", {
						happenedOn: "2026-02-27",
						accountId: late.id,
					});
					expect(second.invoiceMonth).toBe("2026-03");
					const invoices = await ready.fixture.asAna.invoices.list(late.id, "2026-01-31");
					expect(invoices.map((one) => [one.month, one.charged])).toEqual([
						["2026-02", 30_000],
						["2026-03", 30_000],
						["2026-04", 30_000],
					]);
				} finally {
					await ready.fixture.close();
				}
			});

			it("moves a purchase paid ahead of its day to the invoice of the day it was paid", async () => {
				const ready = await readyCard(adapter);
				try {
					// The fifth of October is after the closing day, so November's invoice.
					const [ahead] = await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 12_000,
						happenedOn: "2026-10-05",
						description: "Ingresso",
						accountId: ready.card.id,
					});
					expect(ahead?.invoiceMonth).toBe("2026-11");

					// Said to have happened on the twenty ninth of September, which is October's.
					const settled = await ready.fixture.asAna.transactions.settle(ahead?.id ?? "", TODAY);
					expect([settled.happenedOn, settled.invoiceMonth]).toEqual([TODAY, "2026-10"]);

					// Unless somebody chose the invoice, which stays chosen.
					const [chosen] = await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 5_000,
						happenedOn: "2026-10-06",
						description: "Livro",
						accountId: ready.card.id,
					});
					await ready.fixture.asAna.transactions.setInvoiceMonth(chosen?.id ?? "", "2026-12");
					expect(await ready.fixture.asAna.transactions.settleMany([chosen?.id ?? ""], TODAY)).toBe(
						1,
					);
					const kept = await ready.fixture.asAna.transactions.get(chosen?.id ?? "");
					expect([kept.happenedOn, kept.invoiceMonth]).toEqual([TODAY, "2026-12"]);
				} finally {
					await ready.fixture.close();
				}
			});
		});

		// Part 1, A.8 of the request for 2.0.0, with its example: a plan bought on the fourth
		// of July, on a card that closes on the third, has parts on the invoices of August,
		// September and October. Saying September closed on the fifth took the part of the
		// fourth of September and put it on September, beside the part already there.
		it("says which day an invoice closed on, and moves only what belongs to it", async () => {
			const ready = await readyCard(adapter);
			try {
				const plan = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-07-04",
					description: "Geladeira",
					accountId: ready.card.id,
					installments: 3,
				});
				expect(plan.map((part) => part.invoiceMonth)).toEqual(["2026-08", "2026-09", "2026-10"]);
				const [plain] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 12_000,
					happenedOn: "2026-09-04",
					description: "Padaria",
					accountId: ready.card.id,
				});
				const [chosen] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 5_000,
					happenedOn: "2026-09-03",
					description: "Revista",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.transactions.setInvoiceMonth(chosen?.id ?? "", "2026-10");

				const moved = await ready.fixture.asAna.invoices.closedOn({
					accountId: ready.card.id,
					month: "2026-09",
					day: "2026-09-05",
				});
				expect(moved).toBe(1);

				const monthOf = async (id: string) =>
					(await ready.fixture.asAna.transactions.get(id)).invoiceMonth;
				expect(await Promise.all(plan.map((part) => monthOf(part.id)))).toEqual([
					"2026-08",
					"2026-09",
					"2026-10",
				]);
				expect(await monthOf(plain?.id ?? "")).toBe("2026-09");
				expect(await monthOf(chosen?.id ?? "")).toBe("2026-10");

				// A year typed wrong is refused, and moves nothing.
				await expect(
					ready.fixture.asAna.invoices.closedOn({
						accountId: ready.card.id,
						month: "2026-09",
						day: "2027-09-05",
					}),
				).rejects.toMatchObject({ rule: "closingDayTooFar" });

				// The first part of a plan in the window takes the plan along, one invoice each.
				const second = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 60_000,
					happenedOn: "2026-09-04",
					description: "Televisao",
					accountId: ready.card.id,
					installments: 2,
				});
				expect(second.map((part) => part.invoiceMonth)).toEqual(["2026-10", "2026-11"]);
				expect(
					await ready.fixture.asAna.invoices.closedOn({
						accountId: ready.card.id,
						month: "2026-09",
						day: "2026-09-05",
					}),
				).toBe(2);
				expect(await Promise.all(second.map((part) => monthOf(part.id)))).toEqual([
					"2026-09",
					"2026-10",
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("lets a payment with no invoice named on it pay down the oldest one owing", async () => {
			const ready = await readyCard(adapter);
			try {
				for (const [day, amount] of [
					["2026-08-10", 30_000],
					["2026-09-10", 50_000],
				] as const) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount,
						happenedOn: day,
						description: "Mercado",
						accountId: ready.card.id,
					});
				}

				// Made by hand, or brought in from a statement, so it names no invoice.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 30_000,
					happenedOn: "2026-09-10",
					description: "Pagamento",
					accountId: ready.checking.id,
					counterAccountId: ready.card.id,
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices.map((one) => one.month)).toEqual(["2026-09", "2026-10"]);
				expect(invoices[0]?.standing).toBe("paid");
				expect(invoices[1]?.standing).toBe("open");
			} finally {
				await ready.fixture.close();
			}
		});

		// The screen sends the month it shows, and the button and the dialog count the invoices
		// before it. Release 1.2.1 paid the one on screen as well, so the open invoice, with its
		// purchases, came back paid, and one more invoice was marked than the button announced.
		it("marks every invoice before the one on screen as paid, and leaves that one open", async () => {
			const ready = await readyCard(adapter);
			try {
				// The invoices of July, August and September, and October still taking purchases.
				for (const day of ["2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"]) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 20_000,
						happenedOn: day,
						description: "Mercado",
						accountId: ready.card.id,
					});
				}

				const before = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				const announced = before.filter((one) => one.month < "2026-10" && one.left > 0).length;
				expect(announced).toBe(3);

				// Part 2, B.1.3 of the request for 2.0.0: each payment names its month the way the
				// screen spells it, and the code where the screen did not spell one.
				const paid = await ready.fixture.asAna.invoices.markPaidUntil({
					accountId: ready.card.id,
					month: "2026-10",
					fromAccountId: ready.checking.id,
					today: TODAY,
					description: "Pagamento da fatura de {{month}} (Cartao)",
					monthNames: { "2026-07": "julho de 2026", "2026-08": "agosto de 2026" },
				});
				expect(paid).toBe(announced);
				const payments = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					kind: "transfer",
				});
				expect(payments.map((one) => one.description).sort()).toEqual([
					"Pagamento da fatura de 2026-09 (Cartao)",
					"Pagamento da fatura de agosto de 2026 (Cartao)",
					"Pagamento da fatura de julho de 2026 (Cartao)",
				]);

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices.map((one) => [one.month, one.standing])).toEqual([
					["2026-07", "paid"],
					["2026-08", "paid"],
					["2026-09", "paid"],
					["2026-10", "open"],
				]);
				expect(invoices.at(-1)?.left).toBe(20_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("reopens an invoice that was paid when a purchase is moved onto it", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 100_000,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento",
				});

				// A purchase the bank closed onto the invoice before, moved back onto this one.
				const [later] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-10-05",
					description: "Farmacia",
					accountId: ready.card.id,
				});
				await ready.fixture.asAna.invoices.move(later?.id ?? "", "earlier");

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-15");
				const october = invoices.find((one) => one.month === "2026-10");
				// The payment is money that left the account and does not move. The invoice
				// says what is left, which is the twenty that arrived after it was paid.
				expect(october?.paid).toBe(100_000);
				expect(october?.left).toBe(20_000);
				expect(october?.standing).toBe("partlyPaid");
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps a purchase where it was put, even after the closing day is corrected", async () => {
			const ready = await readyCard(adapter);
			try {
				const [bought] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-02",
					description: "Farmacia",
					accountId: ready.card.id,
				});
				expect(bought?.invoiceMonth).toBe("2026-09");

				await ready.fixture.asAna.invoices.move(bought?.id ?? "", "later");
				const moved = await ready.fixture.asAna.transactions.get(bought?.id ?? "");
				expect(moved.invoiceMonth).toBe("2026-10");
				expect(moved.invoiceMonthByHand).toBe(true);

				// Editing it afterwards does not work the invoice out again and drag it back.
				const edited = await ready.fixture.asAna.transactions.update(bought?.id ?? "", {
					description: "Farmacia do bairro",
					happenedOn: "2026-09-02",
				});
				expect(edited.invoiceMonth).toBe("2026-10");
			} finally {
				await ready.fixture.close();
			}
		});

		it("moves every part of a purchase in parts together", async () => {
			const ready = await readyCard(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Fone",
					accountId: ready.card.id,
					installments: 3,
				});
				expect(parts.map((one) => one.invoiceMonth)).toEqual(["2026-10", "2026-11", "2026-12"]);

				const moved = await ready.fixture.asAna.invoices.move(parts[0]?.id ?? "", "earlier");
				expect(moved).toBe(3);

				const after = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					installmentGroup: parts[0]?.installmentGroup ?? "",
				});
				expect(after.map((one) => one.invoiceMonth).sort()).toEqual([
					"2026-09",
					"2026-10",
					"2026-11",
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		// Decision 7 of part 1 of 2.0.0: moving a part moves it and the parts after it, and the
		// ones before stay on the invoices they were charged on. It moved the whole plan.
		it("moves a part of a plan and the parts after it, and leaves the ones before", async () => {
			const ready = await readyCard(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Fone",
					accountId: ready.card.id,
					installments: 3,
				});
				expect(parts.map((one) => one.invoiceMonth)).toEqual(["2026-10", "2026-11", "2026-12"]);

				const moved = await ready.fixture.asAna.invoices.move(parts[1]?.id ?? "", "later");
				expect(moved).toBe(2);

				const monthOf = async (id: string) =>
					(await ready.fixture.asAna.transactions.get(id)).invoiceMonth;
				expect(await Promise.all(parts.map((part) => monthOf(part.id)))).toEqual([
					"2026-10",
					"2026-12",
					"2027-01",
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says which day an invoice really closed on, and moves what falls between", async () => {
			const ready = await readyCard(adapter);
			try {
				// The card closes on the third, so these two are on the October invoice.
				for (const day of ["2026-09-03", "2026-09-04"]) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 10_000,
						happenedOn: day,
						description: "Mercado",
						accountId: ready.card.id,
					});
				}

				// The bank actually closed September on the fifth, so both belong to September.
				const moved = await ready.fixture.asAna.invoices.closedOn({
					accountId: ready.card.id,
					month: "2026-09",
					day: "2026-09-05",
				});
				expect(moved).toBe(2);

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices.find((one) => one.month === "2026-09")?.charged).toBe(20_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses an invoice on an account that is not a card with a cycle", async () => {
			const ready = await readyCard(adapter);
			try {
				await expect(
					ready.fixture.asAna.invoices.list(ready.checking.id, TODAY),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says where every card of a space stands", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 128_450,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.card.id,
				});

				const standing = await ready.fixture.asAna.invoices.standing(ready.spaceId, TODAY);
				expect(standing).toHaveLength(1);
				expect(standing[0]?.open.month).toBe("2026-10");
				expect(standing[0]?.open.charged).toBe(128_450);
				expect(standing[0]?.unpaid).toBeNull();
				expect(standing[0]?.available).toBe(500_000 - 128_450);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * An invoice is a figure in the currency of the space, and never a mixture.
		 *
		 * It used to sum the amount as written, so an invoice holding a dinner of forty dollars
		 * and a market of a hundred reais came back as fourteen thousand, a number in no
		 * currency at all, and three screens labelled it with whatever currency the card's
		 * account happened to carry. The overview then added that figure to a total in the
		 * currency of the space and handed the result to what is left to spend this month.
		 */
		it("adds a purchase in another currency up as what it was worth here", async () => {
			const ready = await readyCard(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 4_000,
					currency: "USD",
					// Five reais and twenty centavos to the dollar, scaled by ten to the eighth.
					fxRate: 520_000_000,
					happenedOn: "2026-09-10",
					description: "Jantar em Nova York",
					accountId: ready.card.id,
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices[0]?.month).toBe("2026-10");
				// Forty dollars at the rate written down with the purchase, and not forty.
				expect(invoices[0]?.charged).toBe(20_800);
				expect(invoices[0]?.inOtherCurrencies).toBe(1);
				expect(invoices[0]?.withoutRate).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * Two invoices behind, and both of them are answered for.
		 *
		 * The model used to answer with the newest closed invoice still owing and no more, so a
		 * household two behind saw one of them on every screen, while the headroom of the card
		 * took both off. Two figures on one screen disagreed, and the invisible one was the
		 * older debt, which is the one that has been unpaid longest.
		 */
		it("lists every invoice that closed and was not paid, oldest first", async () => {
			const ready = await readyCard(adapter);
			try {
				// One purchase in the August invoice, one in the September one, and one in the
				// invoice still taking purchases. Nothing is paid.
				for (const [day, description] of [
					["2026-07-20", "Julho"],
					["2026-08-20", "Agosto"],
					["2026-09-20", "Setembro"],
				] as const) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 10_000,
						happenedOn: day,
						description,
						accountId: ready.card.id,
					});
				}

				const standing = await ready.fixture.asAna.invoices.standing(ready.spaceId, TODAY);
				const card = standing[0];

				// The twenty ninth of September: the invoice of October is still open, and the two
				// before it have closed with nothing paid against them.
				expect(card?.open.month).toBe("2026-10");
				expect(card?.owing.map((state) => state.month)).toEqual(["2026-08", "2026-09"]);
				expect(card?.unpaid?.month).toBe("2026-09");

				// And the headroom takes every one of them off, which is what it always did. The
				// agreement between the two is the point: three invoices owed, three off the limit.
				expect(card?.available).toBe(500_000 - 30_000);
				expect(
					(card?.owing.reduce((total, state) => total + state.left, 0) ?? 0) +
						(card?.open.left ?? 0),
				).toBe(30_000);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The headroom on a card is the limit less what it will charge, counted once.
		 *
		 * What is owed was summed over every invoice, including the ones after the one still
		 * taking purchases, and those were then added again as what is charged later. So a
		 * purchase in parts came off the headroom twice and a card looked fuller than it was,
		 * which is the figure somebody checks before paying for something at a till.
		 */
		it("takes the instalments still to come off the headroom once", async () => {
			const ready = await readyCard(adapter);
			try {
				// Nine hundred in three parts, so three invoices of three hundred each.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Bicicleta",
					accountId: ready.card.id,
					installments: 3,
				});

				const standing = await ready.fixture.asAna.invoices.standing(ready.spaceId, TODAY);
				expect(standing[0]?.open.charged).toBe(30_000);
				expect(standing[0]?.later).toBe(60_000);
				expect(standing[0]?.available).toBe(500_000 - 90_000);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * Moving a plan between invoices is all of it or none of it.
		 *
		 * It moved the parts one at a time through the door that refuses a record ticked off
		 * against a bank, so a plan with one reconciled part in it moved the parts before it
		 * and then refused, leaving the purchase split between two invoices with nothing
		 * saying how far it got.
		 */
		it("refuses to move half a plan between invoices", async () => {
			const ready = await readyCard(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Bicicleta",
					accountId: ready.card.id,
					installments: 3,
				});
				const months = parts.map((part) => part.invoiceMonth);

				// The second part is ticked off against the bank, which freezes it.
				await ready.fixture.asAna.transactions.reconcile(parts[1]?.id ?? "", true);

				await expect(
					ready.fixture.asAna.invoices.move(parts[0]?.id ?? "", "later"),
				).rejects.toBeInstanceOf(RuleError);

				// And every part is on the invoice it was on.
				const after = await ready.fixture.asAna.transactions.list({
					installmentGroup: parts[0]?.installmentGroup ?? "",
				});
				expect(after.map((one) => one.invoiceMonth).sort()).toEqual([...months].sort());
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("the repair that puts a series on its invoice", () => {
		it("stamps a subscription on a card that was written without one", async () => {
			const ready = await readyCard(adapter);
			try {
				const series = await ready.fixture.asAna.recurrences.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 5_000,
					description: "Streaming",
					accountId: ready.card.id,
					frequency: "monthly",
					startsOn: "2026-09-10",
					dayOfMonth: 10,
				});
				await ready.fixture.asAna.recurrences.materialize({ spaceId: ready.spaceId });

				// Written correctly now, so the repair is checked by undoing the stamp first,
				// which is exactly the state every row written before this release is in.
				await ready.fixture.driver.run(
					`UPDATE "transactions" SET "invoice_month" = NULL WHERE "recurrence_id" = ?`,
					[series.id],
				);
				await ready.fixture.asAna.repairs.run(ready.spaceId);

				const all = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				const written = all.filter((one) => one.recurrenceId === series.id);
				expect(written.length).toBeGreaterThan(0);
				// The tenth is after the third, so each one belongs to the invoice of the
				// month after the one it happened in.
				for (const one of written) {
					const happened = one.happenedOn.slice(0, 7);
					expect(one.invoiceMonth).not.toBeNull();
					expect(one.invoiceMonth).not.toBe(happened);
				}
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
