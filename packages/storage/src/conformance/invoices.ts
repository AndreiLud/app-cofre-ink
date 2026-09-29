// A card invoice, on every adapter.
//
// What is checked here is the half that did not exist: whether an invoice was paid. The
// other half, what it charged, was always a filter over records and is checked with the
// cards. A payment is an ordinary transfer into the card account naming the invoice it
// pays, so nothing here reaches past the repository to look at a row.

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
				});

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, "2026-10-11");
				expect(invoices[0]?.standing).toBe("partlyPaid");
				expect(invoices[0]?.left).toBe(78_450);
				expect(invoices[0]?.late).toBe(true);
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

		it("marks every invoice up to a month as paid in one go", async () => {
			const ready = await readyCard(adapter);
			try {
				for (const day of ["2026-06-10", "2026-07-10", "2026-08-10"]) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 20_000,
						happenedOn: day,
						description: "Mercado",
						accountId: ready.card.id,
					});
				}

				const paid = await ready.fixture.asAna.invoices.markPaidUntil({
					accountId: ready.card.id,
					month: "2026-09",
					fromAccountId: ready.checking.id,
					today: TODAY,
				});
				expect(paid).toBe(3);

				const invoices = await ready.fixture.asAna.invoices.list(ready.card.id, TODAY);
				expect(invoices.every((one) => one.standing === "paid")).toBe(true);
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
