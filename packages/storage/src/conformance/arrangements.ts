// Paying an invoice with another card, and splitting an invoice into parts, on every adapter.
//
// Part 2, section C of the request for 2.0.0. What is checked is what a person reads after
// each: which invoice owes what, what each card and account holds, what counts as spending,
// what the months ahead expect, and that the rule the sums follow is the rule in the core.

import { type CalendarMonth, touchesOn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { PermissionError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { openSession } from "../session.ts";
import { applyPeople } from "../sync.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** A current account and two cards that close on the third and fall due on the tenth. */
async function twoCards(adapter: AdapterUnderTest) {
	const fixture = await prepare(adapter);
	const on = fixture.asAna;
	const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
	const checking = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
		initialBalance: 1_000_000,
	});
	const card = (name: string) =>
		on.accounts.create({
			spaceId: space.id,
			kind: "credit",
			name,
			closingDay: 3,
			dueDay: 10,
			creditLimit: 500_000,
		});
	const a = await card("Nubank");
	const b = await card("Itau");
	const buy = (accountId: string, amount: number, happenedOn: string) =>
		on.transactions.create({
			spaceId: space.id,
			kind: "expense",
			amount,
			happenedOn,
			description: "Compras",
			accountId,
		});
	return { fixture, on, spaceId: space.id, checking, a, b, buy };
}

const words = {
	description: "Parcelamento da fatura de outubro",
	costDescription: "Juros do parcelamento",
	entryDescription: "Entrada do parcelamento",
	taxDescription: "IOF do parcelamento",
};

const SIX: CalendarMonth[] = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"];

export function runArrangementConformance(adapter: AdapterUnderTest): void {
	describe("an invoice split into parts", () => {
		// Part 2, C.14.2: R$ 3.000,00 owed on October, agreed on the tenth, an entry of R$ 500,00
		// and six parts of R$ 480,00 from November.
		it("leaves the invoice settled in parts and each next one charging its part", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				const october = { spaceId: ready.spaceId, from: "2025-10-01", to: "2025-10-31" };
				const before = await on.reports.totals(october);

				const result = await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 50_000,
					entryFromAccountId: ready.checking.id,
					parts: 6,
					amount: 48_000,
					eachPart: true,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				});
				expect(result.cost).toBe(38_000);

				const states = await on.invoices.list(a.id, "2025-10-10");
				const of = (month: string) => states.find((one) => one.month === month);
				expect(of("2025-10")?.standing).toBe("inParts");
				expect(of("2025-10")?.left).toBe(0);
				expect(of("2025-10")?.late).toBe(false);
				expect(SIX.map((month) => of(month)?.charged)).toEqual(SIX.map(() => 48_000));

				// The card's balance: what was bought, less the entry, less the first cost, which is
				// the one dated on the day of the agreement. The parts move nothing by themselves.
				const balances = await on.transactions.balances(ready.spaceId, "2025-10-10");
				expect(balances.find((one) => one.accountId === a.id)?.settled).toBe(-256_333);

				// Only the cost is spending, never the R$ 2.500,00 the card took on.
				const after = await on.reports.totals(october);
				expect(after.expense - before.expense).toBe(6_333);

				// And the months ahead pay R$ 480,00 on each of the six days the parts fall due.
				const ahead = await on.projections.monthsAhead({
					spaceId: ready.spaceId,
					from: "2025-11",
					months: 6,
					today: "2025-10-10",
				});
				expect(ahead.months.map((one) => one.expenseFrom.written)).toEqual(SIX.map(() => 48_000));

				// Undone, everything goes, and October owes again.
				expect(
					await on.invoices.undoPlan({ accountId: a.id, month: "2025-10", today: "2025-10-10" }),
				).toBe(13);
				const undone = await on.invoices.list(a.id, "2025-10-10");
				expect(undone.find((one) => one.month === "2025-10")?.left).toBe(300_000);
				expect(undone.filter((one) => SIX.includes(one.month))).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 2, C.7 and C.14.6: the check up read only purchases, so the invoice holding a part
		// read as its cost alone. With the clock on the fifteenth of December, November's invoice
		// reads R$ 480,00, and the parts ahead each in the month of its invoice.
		it("is read by the check up as the parts it charges", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 50_000,
					entryFromAccountId: ready.checking.id,
					parts: 6,
					amount: 48_000,
					eachPart: true,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				});
				const snapshot = await on.advice.snapshot({ spaceId: ready.spaceId, today: "2025-12-15" });
				expect(snapshot.invoices.find((one) => one.month === "2025-11")?.amount).toBe(48_000);
				// January holds the part on the invoice of January and the cost written on its tenth.
				expect(snapshot.instalments.find((one) => one.month === "2026-01")?.amount).toBe(48_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("changes nothing before the day of an agreement still to come", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 50_000,
					entryFromAccountId: ready.checking.id,
					parts: 6,
					amount: 48_000,
					eachPart: true,
					agreedOn: "2025-10-25",
					today: "2025-10-15",
					...words,
				});
				const states = await on.invoices.list(a.id, "2025-10-15");
				const october = states.find((one) => one.month === "2025-10");
				expect(october?.left).toBe(300_000);
				expect(october?.scheduledBy).toBe("parts");
				expect(october?.scheduledOn).toBe("2025-10-25");
				// November holds the cost of its part, written on the card, and not the principal.
				expect(states.find((one) => one.month === "2025-11")?.charged).toBe(6_333);
			} finally {
				await ready.fixture.close();
			}
		});

		// Part 2, C.9: removing only the part that paid the invoice would leave it owing again with
		// its cost still charged, so every row of the arrangement changes only by undoing it.
		it("locks every row of the arrangement until it is undone", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 50_000,
					entryFromAccountId: ready.checking.id,
					parts: 6,
					amount: 48_000,
					eachPart: true,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				});
				const rows = await on.transactions.list({ spaceId: ready.spaceId });
				const arranged = rows.filter((row) => row.arrangedFor !== null);
				// The entry, six parts and six costs, each saying which invoice it settled.
				expect(arranged).toHaveLength(13);
				expect(new Set(arranged.map((row) => row.arrangedFor))).toEqual(new Set(["2025-10"]));
				const part = arranged.find((row) => row.originInvoiceMonth !== null);
				const cost = arranged.find((row) => row.kind === "expense");
				const locked = { rule: "partOfAnArrangement" };
				await expect(on.transactions.update(part?.id ?? "", { amount: 1 })).rejects.toMatchObject(
					locked,
				);
				await expect(on.transactions.removeMany([cost?.id ?? ""])).rejects.toMatchObject(locked);
				await expect(
					on.transactions.updateFrom(cost?.id ?? "", { categoryId: null }),
				).rejects.toMatchObject(locked);
				await expect(on.invoices.move(cost?.id ?? "", "later")).rejects.toMatchObject(locked);
				// The purchase that made the invoice is not part of it, and stays free.
				const bought = rows.find((row) => row.description === "Compras");
				expect(bought?.arrangedFor).toBeNull();
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses what would not add up, and an invoice arranged twice", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				const asked = {
					accountId: a.id,
					month: "2025-10" as const,
					entry: 50_000,
					entryFromAccountId: ready.checking.id,
					parts: 6,
					amount: 40_000,
					eachPart: true,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				};
				await expect(on.invoices.split(asked)).rejects.toMatchObject({ rule: "splitDoesNotAdd" });
				await expect(on.invoices.split({ ...asked, parts: 49 })).rejects.toMatchObject({
					rule: "tooManyInstallments",
				});
				await on.invoices.split({ ...asked, amount: 48_000 });
				await expect(on.invoices.split({ ...asked, amount: 48_000 })).rejects.toMatchObject({
					rule: "invoiceAlreadyArranged",
				});
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("an invoice paid with another card", () => {
		// Part 2, C.14.3: A owes R$ 2.000,00 on October; B pays it on the fifth of November,
		// charging R$ 2.100,00 in three.
		it("pays the invoice with no money moving, and puts the parts on the other card", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a, b } = ready;
				await ready.buy(a.id, 200_000, "2025-09-20");
				await on.invoices.payWithCard({
					accountId: a.id,
					month: "2025-10",
					cardAccountId: b.id,
					amount: 200_000,
					charged: 210_000,
					eachPart: false,
					parts: 3,
					happenedOn: "2025-11-05",
					today: "2025-11-05",
					description: "Pagamento da fatura de outubro de 2026 (Nubank) com Itau",
					costDescription: "Custo do pagamento com Itau",
				});

				const paid = (await on.invoices.list(a.id, "2025-11-05")).find(
					(one) => one.month === "2025-10",
				);
				expect(paid?.standing).toBe("paid");
				expect(paid?.byCard).toBe(200_000);

				const other = await on.invoices.list(b.id, "2025-11-05");
				expect(
					["2025-12", "2026-01", "2026-02"].map(
						(month) => other.find((one) => one.month === month)?.charged,
					),
				).toEqual([70_000, 70_000, 70_000]);

				const balances = await on.transactions.balances(ready.spaceId, "2026-03-01");
				expect(balances.find((one) => one.accountId === ready.checking.id)?.settled).toBe(
					1_000_000,
				);

				const spent = await on.reports.totals({
					spaceId: ready.spaceId,
					from: "2025-11-01",
					to: "2026-02-28",
				});
				expect(spent.expense).toBe(10_000);

				const standing = await on.invoices.standing(ready.spaceId, "2025-11-05");
				expect(standing.find((one) => one.account.id === b.id)?.available).toBe(290_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses the same card, more than is owed, and an invoice with a payment waiting", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a, b } = ready;
				await ready.buy(a.id, 200_000, "2025-09-20");
				const asked = {
					accountId: a.id,
					month: "2025-10" as const,
					cardAccountId: b.id,
					amount: 200_000,
					charged: 210_000,
					eachPart: false,
					parts: 3,
					happenedOn: "2025-10-05",
					today: "2025-10-05",
					description: "Pagamento",
					costDescription: "Custo",
				};
				await expect(
					on.invoices.payWithCard({ ...asked, cardAccountId: a.id }),
				).rejects.toMatchObject({
					rule: "sameCard",
				});
				await expect(on.invoices.payWithCard({ ...asked, amount: 200_001 })).rejects.toMatchObject({
					rule: "moreThanIsOwed",
				});
				await on.invoices.pay({
					accountId: a.id,
					fromAccountId: ready.checking.id,
					amount: 50_000,
					happenedOn: "2025-10-09",
					month: "2025-10",
					description: "Pagamento agendado",
				});
				await expect(on.invoices.payWithCard(asked)).rejects.toMatchObject({
					rule: "invoiceHasAPaymentAhead",
				});
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("the rule of which invoice a record touches", () => {
		// Part 2, C.2 and C.14.4: the sums in SQL and the rule in the core give the same answer,
		// for every kind of row there is: a purchase, a refund, a payment of 1.2.1, a payment with
		// another card, a split and a transfer between two cards written before 2.0.0.
		it("sums each card as the rule in the core reads its records", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a, b } = ready;
				await ready.buy(a.id, 300_000, "2025-09-20");
				await ready.buy(b.id, 120_000, "2025-09-21");
				await on.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 10_000,
					happenedOn: "2025-09-25",
					description: "Estorno",
					accountId: b.id,
				});
				await on.invoices.pay({
					accountId: b.id,
					fromAccountId: ready.checking.id,
					amount: 40_000,
					happenedOn: "2025-10-01",
					month: "2025-10",
					description: "Pagamento",
				});
				await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 0,
					parts: 3,
					amount: 310_000,
					eachPart: false,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				});
				await on.invoices.payWithCard({
					accountId: b.id,
					month: "2025-10",
					cardAccountId: a.id,
					amount: 70_000,
					charged: 70_000,
					eachPart: false,
					parts: 2,
					happenedOn: "2025-10-10",
					today: "2025-10-10",
					description: "Pagamento com Nubank",
					costDescription: "Custo",
				});

				const accounts = await on.accounts.list(ready.spaceId);
				const isCard = new Set(
					accounts.filter((one) => one.kind === "credit").map((one) => one.id),
				);
				const rows = await on.transactions.list({ spaceId: ready.spaceId });
				for (const card of [a, b]) {
					const byRule = new Map<string, { charged: number; rolled: number; byCard: number }>();
					let paidInMoney = 0;
					for (const row of rows) {
						for (const touch of touchesOn(card.id, {
							...row,
							leavesACard: isCard.has(row.accountId),
						})) {
							if (touch.as === "paid" || touch.as === "unmarked") {
								paidInMoney += touch.amount;
								continue;
							}
							if (touch.month === null) continue;
							const sum = byRule.get(touch.month) ?? { charged: 0, rolled: 0, byCard: 0 };
							if (touch.as === "charge") sum.charged += touch.amount;
							if (touch.as === "rolled") sum.rolled += touch.amount;
							if (touch.as === "byCard") sum.byCard += touch.amount;
							byRule.set(touch.month, sum);
						}
					}
					const states = await on.invoices.list(card.id, "2026-12-31");
					for (const state of states) {
						const ruled = byRule.get(state.month) ?? { charged: 0, rolled: 0, byCard: 0 };
						expect([state.month, state.charged, state.rolled, state.byCard]).toEqual([
							state.month,
							ruled.charged,
							ruled.rolled,
							ruled.byCard,
						]);
					}
					expect(states.reduce((sum, state) => sum + state.paid, 0)).toBe(paidInMoney);
				}
			} finally {
				await ready.fixture.close();
			}
		});

		it("reads a transfer between two cards from before 2.0.0, and keeps the column on a restore", async () => {
			const ready = await twoCards(adapter);
			const driver = adapter.openAnother
				? await adapter.openAnother("arrangementsRestore")
				: await adapter.open();
			try {
				const { on, a, b } = ready;
				await ready.buy(b.id, 100_000, "2025-09-20");
				await ready.buy(a.id, 90_000, "2025-09-20");
				await on.invoices.payWithCard({
					accountId: a.id,
					month: "2025-10",
					cardAccountId: b.id,
					amount: 90_000,
					charged: 90_000,
					eachPart: false,
					parts: 1,
					happenedOn: "2025-10-05",
					today: "2025-10-05",
					description: "Pagamento com Itau",
					costDescription: "Custo",
				});
				const backup = await on.backup.exportSpace(ready.spaceId);
				const tables = backup.spaces[0]?.tables ?? {};
				const written = (tables.transactions ?? []).find(
					(row) => row.origin_invoice_month !== null && row.origin_invoice_month !== undefined,
				);
				expect(written?.origin_invoice_month).toBe("2025-11");
				// What 1.2.1 wrote for money moved from one card to another: one invoice, the one of
				// the card it left, and nothing for the other side.
				tables.transactions?.push({
					...written,
					id: "01890000-0000-7000-8000-000000000001",
					amount: 30_000,
					amount_in_base: 30_000,
					invoice_month: "2025-10",
					origin_invoice_month: null,
					installment_group: null,
					installment_number: null,
					installment_count: null,
				});

				await migrate(driver);
				const ana = ready.fixture.ana;
				await applyPeople(driver, [
					{
						id: ana.id,
						email: ana.email,
						name: ana.name,
						image: ana.image,
						createdAt: ana.createdAt,
						updatedAt: ana.updatedAt,
					},
				]);
				const elsewhere = await openSession({
					driver,
					userId: ready.fixture.ana.id,
					deviceId: "arrangementsRestore",
				});
				await elsewhere.backup.restore(backup);
				await elsewhere.refresh();

				const kept = (await elsewhere.transactions.list({ spaceId: ready.spaceId })).filter(
					(row) => row.originInvoiceMonth !== null,
				);
				expect(kept.map((row) => row.originInvoiceMonth)).toEqual(["2025-11"]);

				// The old one is a purchase on the card it left, B, on its one invoice, and a payment
				// of A with no invoice named, which pays the oldest A owes.
				const ofB = await elsewhere.invoices.list(b.id, "2025-10-05");
				expect(ofB.find((one) => one.month === "2025-10")?.charged).toBe(130_000);
				expect(ofB.find((one) => one.month === "2025-11")?.charged).toBe(90_000);
				const ofA = await elsewhere.invoices.list(a.id, "2025-10-05");
				expect(ofA.find((one) => one.month === "2025-10")?.byCard).toBe(90_000);
				expect(ofA.find((one) => one.month === "2025-10")?.left).toBe(-30_000);
			} finally {
				await driver.close();
				await ready.fixture.close();
			}
		});

		it("refuses to undo an arrangement with a part checked against the bank", async () => {
			const ready = await twoCards(adapter);
			try {
				const { on, a } = ready;
				await ready.buy(a.id, 90_000, "2025-09-20");
				await on.invoices.split({
					accountId: a.id,
					month: "2025-10",
					entry: 0,
					parts: 3,
					amount: 90_000,
					eachPart: false,
					agreedOn: "2025-10-10",
					today: "2025-10-10",
					...words,
				});
				const part = (await on.transactions.list({ spaceId: ready.spaceId })).find(
					(row) => row.originInvoiceMonth !== null,
				);
				await on.transactions.reconcile(part?.id ?? "", true);
				await expect(
					on.invoices.undoPlan({ accountId: a.id, month: "2025-10", today: "2025-10-10" }),
				).rejects.toMatchObject({ rule: "planHasReconciledRow" });
			} finally {
				await ready.fixture.close();
			}
		});

		it("is refused to a viewer and to a logger", async () => {
			const ready = await twoCards(adapter);
			try {
				const { fixture, on } = ready;
				const shared = await on.spaces.create({ name: "Casa" });
				for (const [who, role] of [
					[fixture.joao, "viewer"],
					[fixture.carla, "logger"],
				] as const) {
					await on.members.invite({ spaceId: shared.id, userId: who.id, role });
				}
				await fixture.asJoao.members.accept(shared.id);
				await fixture.asCarla.members.accept(shared.id);
				const card = await on.accounts.create({
					spaceId: shared.id,
					kind: "credit",
					name: "Cartao da casa",
					closingDay: 3,
					dueDay: 10,
				});
				await on.transactions.create({
					spaceId: shared.id,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2025-09-20",
					description: "Compras",
					accountId: card.id,
				});
				const split = (session: typeof on) =>
					session.invoices.split({
						accountId: card.id,
						month: "2025-10",
						entry: 0,
						parts: 3,
						amount: 90_000,
						eachPart: false,
						today: "2025-10-05",
						...words,
					});
				await expect(split(fixture.asJoao)).rejects.toBeInstanceOf(PermissionError);
				await expect(split(fixture.asCarla)).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
