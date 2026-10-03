// What falls due, read by the check up, on every adapter.
//
// Part 2, J of the request for 2.0.0. The check up read records written as promises and
// nothing else, so a card invoice was never among the bills, and with the cards netted off the
// money it said that one bill of R$ 0,00 was more than there was. What is checked here is the
// snapshot the findings are made from: which bills, on which day, against which money.

import { type CalendarDate, duesOf, findEverything } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { openSession } from "../session.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** A current account, and a card that closes on the twenty eighth and falls due on the fifth. */
async function withACard(adapter: AdapterUnderTest, checkingBalance: number) {
	const fixture = await prepare(adapter);
	const on = fixture.asAna;
	const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
	const checking = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
		initialBalance: checkingBalance,
	});
	const card = await on.accounts.create({
		spaceId: space.id,
		kind: "credit",
		name: "Nubank",
		closingDay: 28,
		dueDay: 5,
	});
	return { fixture, on, spaceId: space.id, checking, card };
}

const findingsOf = (snapshot: Parameters<typeof findEverything>[0]) =>
	findEverything(snapshot).map((one) => one.code);

export function runFallsDueConformance(adapter: AdapterUnderTest): void {
	describe("what falls due, in the check up", () => {
		// J.9.1: R$ 2.300,00 on the invoice that closed, R$ 1.200,00 in the bank, two days
		// before the due day. The list of what fell due came back empty.
		it("is the invoice on its due day, against the money in the accounts", async () => {
			const ready = await withACard(adapter, 120_000);
			try {
				await ready.on.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 230_000,
					happenedOn: "2026-10-20",
					description: "Compras",
					accountId: ready.card.id,
				});

				const snapshot = await ready.on.advice.snapshot({
					spaceId: ready.spaceId,
					today: "2026-11-03",
				});
				const dues = duesOf(snapshot);
				expect(dues.coming.map((one) => [one.kind, one.amount, one.dueOn])).toEqual([
					["invoice", 230_000, "2026-11-05"],
				]);
				expect(snapshot.money).toBe(120_000);
				const finding = findEverything(snapshot).find((one) => one.code === "invoiceOverBalance");
				expect(finding?.subject).toBe("Nubank");
				expect(finding?.amounts).toMatchObject({ short: 110_000, days: 2 });
			} finally {
				await ready.fixture.close();
			}
		});

		// J.9.2: a purchase on the card dated next week is on its invoice and not a bill of its
		// own; a payment dated on the due day leaves the invoice a bill until that day; an old card
		// written down owing R$ 1.500,00 is a bill of its opening invoice.
		it("leaves a purchase to its invoice, keeps an invoice until its payment's day, and reads an opening debt", async () => {
			const ready = await withACard(adapter, 1_000_000);
			try {
				const { on, spaceId } = ready;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 50_000,
					happenedOn: "2026-10-20",
					description: "Compras",
					accountId: ready.card.id,
				});
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 9_990,
					happenedOn: "2026-10-30",
					description: "Assinatura",
					accountId: ready.card.id,
				});
				await on.invoices.pay({
					accountId: ready.card.id,
					fromAccountId: ready.checking.id,
					amount: 50_000,
					happenedOn: "2026-11-05",
					month: "2026-10",
					description: "Pagamento agendado",
				});
				// A card written down on the twentieth of October by a release that kept what it
				// owed as its opening balance, which a new card is no longer written with.
				const earlier = await openSession({
					driver: ready.fixture.driver,
					userId: ready.fixture.ana.id,
					deviceId: "deviceAnaTwentieth",
					now: () => Date.parse("2026-10-20T12:00:00-03:00"),
				});
				const old = await earlier.accounts.create({
					spaceId,
					kind: "credit",
					name: "Cartao antigo",
					closingDay: 28,
					dueDay: 5,
				});
				await ready.fixture.driver.run(
					`UPDATE "accounts" SET "initial_balance" = ? WHERE "id" = ?`,
					[-150_000, old.id],
				);

				const snapshot = await on.advice.snapshot({ spaceId, today: "2026-10-28" });
				const dues = duesOf(snapshot);
				// The subscription of the thirtieth is on the invoice of December, not a bill.
				expect(dues.coming.some((one) => one.subject === "Assinatura")).toBe(false);
				const nubank = dues.coming.find((one) => one.invoice?.accountId === ready.card.id);
				expect(nubank).toMatchObject({
					amount: 50_000,
					dueOn: "2026-11-05",
					scheduledOn: "2026-11-05",
					scheduledBy: "money",
				});
				const opening = [...dues.coming, ...dues.late].find(
					(one) => one.invoice?.accountId === old.id,
				);
				expect(opening?.amount).toBe(150_000);

				// On the day of the payment the invoice is paid and leaves.
				const paid = await on.advice.snapshot({ spaceId, today: "2026-11-05" });
				expect(duesOf(paid).coming.some((one) => one.invoice?.accountId === ready.card.id)).toBe(
					false,
				);
			} finally {
				await ready.fixture.close();
			}
		});

		// J.9.3, with part 1, D.11: a card written down on the twenty eighth of October, closing on
		// the twenty fifth and falling due on the fifth, with R$ 2.300,00 on the invoice that
		// closed. That invoice is the bill of the fifth of November.
		it("reads the invoice that had closed when the card was written down", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
					initialBalance: 120_000,
				});
				const card = await on.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Nubank",
					closingDay: 25,
					dueDay: 5,
				});
				// What the form writes for it (`closedChargeOf` in the core).
				await on.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 230_000,
					happenedOn: "2026-10-24",
					invoiceMonth: "2026-10",
					description: "Fatura fechada quando o cartao foi cadastrado",
					accountId: card.id,
				});

				const snapshot = await on.advice.snapshot({ spaceId: space.id, today: "2026-10-28" });
				expect(duesOf(snapshot).coming.map((one) => [one.amount, one.dueOn])).toEqual([
					[230_000, "2026-11-05"],
				]);
				expect(findingsOf(snapshot)).toContain("invoiceOverBalance");
			} finally {
				await fixture.close();
			}
		});

		// J.9.4: R$ 2.000,00 on Nubank paid with Itau in three parts of R$ 700,00, three days from
		// now. Until that day the invoice is a bill and says how it is being paid.
		it("keeps an invoice paid with another card until the day, and says which", async () => {
			const ready = await withACard(adapter, 1_000_000);
			try {
				const { on, spaceId } = ready;
				const itau = await on.accounts.create({
					spaceId,
					kind: "credit",
					name: "Itau",
					closingDay: 28,
					dueDay: 5,
				});
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 200_000,
					happenedOn: "2026-10-20",
					description: "Compras",
					accountId: ready.card.id,
				});
				const today: CalendarDate = "2026-11-01";
				await on.invoices.payWithCard({
					accountId: ready.card.id,
					month: "2026-10",
					cardAccountId: itau.id,
					amount: 200_000,
					charged: 210_000,
					eachPart: false,
					parts: 3,
					happenedOn: "2026-11-04",
					today,
					description: "Pagamento da fatura com Itau",
					costDescription: "Custo do pagamento com Itau",
				});

				const before = duesOf(await on.advice.snapshot({ spaceId, today }));
				expect(before.coming.find((one) => one.invoice?.accountId === ready.card.id)).toMatchObject(
					{
						amount: 200_000,
						scheduledOn: "2026-11-04",
						scheduledBy: "card",
					},
				);
				const after = duesOf(await on.advice.snapshot({ spaceId, today: "2026-11-04" }));
				expect(after.coming.some((one) => one.invoice?.accountId === ready.card.id)).toBe(false);

				// The next three invoices of Itau each carry R$ 700,00 more.
				const states = await on.invoices.list(itau.id, "2026-11-04");
				expect(
					["2026-11", "2026-12", "2027-01"].map(
						(month) => states.find((one) => one.month === month)?.charged,
					),
				).toEqual([70_000, 70_000, 70_000]);
			} finally {
				await ready.fixture.close();
			}
		});

		// J.9.5: R$ 3.000,00 split with an entry of R$ 600,00 and four parts, agreed three days from
		// now. Until the agreement the invoice is a bill of R$ 3.000,00 that says it is being split.
		it("keeps an invoice split into parts until the agreement, and says so", async () => {
			const ready = await withACard(adapter, 1_000_000);
			try {
				const { on, spaceId } = ready;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 300_000,
					happenedOn: "2026-10-20",
					description: "Compras",
					accountId: ready.card.id,
				});
				const today: CalendarDate = "2026-11-01";
				await on.invoices.split({
					accountId: ready.card.id,
					month: "2026-10",
					entry: 60_000,
					entryFromAccountId: ready.checking.id,
					parts: 4,
					amount: 66_000,
					eachPart: true,
					agreedOn: "2026-11-04",
					today,
					description: "Parcelamento da fatura",
					costDescription: "Juros do parcelamento",
					entryDescription: "Entrada do parcelamento",
					taxDescription: "IOF do parcelamento",
				});

				const before = duesOf(await on.advice.snapshot({ spaceId, today }));
				expect(before.coming.find((one) => one.invoice?.accountId === ready.card.id)).toMatchObject(
					{
						amount: 300_000,
						scheduledOn: "2026-11-04",
						scheduledBy: "parts",
					},
				);
				const after = duesOf(await on.advice.snapshot({ spaceId, today: "2026-11-04" }));
				expect(
					after.coming.some(
						(one) => one.invoice?.accountId === ready.card.id && one.invoice.month === "2026-10",
					),
				).toBe(false);
				const states = await on.invoices.list(ready.card.id, "2026-11-04");
				expect(states.find((one) => one.month === "2026-11")?.charged ?? 0).toBeGreaterThanOrEqual(
					66_000,
				);
			} finally {
				await ready.fixture.close();
			}
		});

		// J.6: a logger with a purchase of R$ 50,00 hears nothing about what falls due or about the
		// reserve; the owner hears about the invoice.
		it("says nothing about money to a logger, and the invoice to the owner", async () => {
			const ready = await withACard(adapter, 120_000);
			try {
				const { fixture, on } = ready;
				const house = await on.spaces.create({ name: "Casa" });
				await on.members.invite({ spaceId: house.id, userId: fixture.joao.id, role: "logger" });
				await fixture.asJoao.members.accept(house.id);
				const checking = await on.accounts.create({
					spaceId: house.id,
					kind: "checking",
					name: "Conta da casa",
					initialBalance: 120_000,
				});
				const card = await on.accounts.create({
					spaceId: house.id,
					kind: "credit",
					name: "Nubank",
					closingDay: 28,
					dueDay: 5,
				});
				await on.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 230_000,
					happenedOn: "2026-10-20",
					description: "Compras",
					accountId: card.id,
				});
				await fixture.asJoao.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 5_000,
					happenedOn: "2026-11-01",
					description: "Padaria",
					accountId: checking.id,
				});

				const theirs = await fixture.asJoao.advice.snapshot({
					spaceId: house.id,
					today: "2026-11-03",
				});
				const told = findingsOf(theirs);
				for (const code of [
					"invoiceOverBalance",
					"duesOverBalance",
					"thinReserve",
					"cardsOverAccounts",
					"idleCash",
					"lowSavingRate",
				]) {
					expect(told).not.toContain(code);
				}
				const reading = await fixture.asJoao.advice.reading({
					spaceId: house.id,
					today: "2026-11-03",
				});
				expect(reading.signs.find((one) => one.code === "reserve")?.state).toBe("unknown");
				expect(reading.signs.find((one) => one.code === "committed")?.state).toBe("unknown");

				const owner = await on.advice.snapshot({ spaceId: house.id, today: "2026-11-03" });
				expect(findingsOf(owner)).toContain("invoiceOverBalance");
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
