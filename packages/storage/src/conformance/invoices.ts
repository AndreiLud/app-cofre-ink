// A card invoice, on every adapter.
//
// What is checked here is the half that did not exist: whether an invoice was paid. The
// other half, what it charged, was always a filter over records and is checked with the
// cards. A payment is an ordinary transfer into the card account naming the invoice it
// pays, so nothing here reaches past the repository to look at a row.

import { amountToPay, canSpendThisMonth } from "@cofre/core";
import { STAMP_SERIES_WITH_THEIR_INVOICE } from "@cofre/db";
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

				const paid = await ready.fixture.asAna.invoices.markPaidUntil({
					accountId: ready.card.id,
					month: "2026-10",
					fromAccountId: ready.checking.id,
					today: TODAY,
					description: "Pagamento da fatura {{month}}",
				});
				expect(paid).toBe(announced);

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
				await ready.fixture.driver.run(STAMP_SERIES_WITH_THEIR_INVOICE);

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
