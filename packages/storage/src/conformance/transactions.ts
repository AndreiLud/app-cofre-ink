// The transaction part of the conformance suite.
//
// These are the rules that decide whether the numbers on the screen are true, so they
// are checked against every engine, not just the one that happens to be convenient.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import type { Account } from "../models.ts";
import type { Session } from "../session.ts";
import { type AdapterUnderTest, type Fixture, LATER, prepare } from "./setup.ts";

type Ready = {
	fixture: Fixture;
	spaceId: string;
	checking: Account;
	savings: Account;
	card: Account;
};

/** A space with three accounts, one of them a card that closes on the third. */
async function readySpace(adapter: AdapterUnderTest): Promise<Ready> {
	const fixture = await prepare(adapter);
	const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });

	const checking = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
		initialBalance: 100_000,
	});
	const savings = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "savings",
		name: "Poupanca",
	});
	const card = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "credit",
		name: "Cartao",
		closingDay: 3,
		dueDay: 10,
	});

	return { fixture, spaceId: space.id, checking, savings, card };
}

function balanceOf(
	balances: Array<{ accountId: string; settled: number; projected: number }>,
	id: string,
) {
	const found = balances.find((balance) => balance.accountId === id);
	if (!found) throw new Error("no balance for that account");
	return found;
}

export function runTransactionConformance(adapter: AdapterUnderTest): void {
	describe("transactions", () => {
		it("takes the direction from the kind, not from the sign that was typed", async () => {
			const ready = await readySpace(adapter);
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: ready.checking.id,
				});
				const [income] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 500_000,
					happenedOn: "2026-09-05",
					description: "Salario",
					accountId: ready.checking.id,
				});

				expect(expense?.amount).toBe(-4290);
				expect(income?.amount).toBe(500_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses an amount that is not a positive integer of minor units", async () => {
			const ready = await readySpace(adapter);
			try {
				for (const amount of [0, -100, 42.9]) {
					await expect(
						ready.fixture.asAna.transactions.create({
							spaceId: ready.spaceId,
							kind: "expense",
							amount,
							happenedOn: "2026-09-10",
							description: "Mercado",
							accountId: ready.checking.id,
						}),
					).rejects.toBeInstanceOf(RuleError);
				}
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a day that does not exist", async () => {
			const ready = await readySpace(adapter);
			try {
				await expect(
					ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 1000,
						happenedOn: "2026-02-30",
						description: "Mercado",
						accountId: ready.checking.id,
					}),
				).rejects.toThrow();
			} finally {
				await ready.fixture.close();
			}
		});

		it("moves money between accounts with one row, counted once on each side", async () => {
			const ready = await readySpace(adapter);
			try {
				const [transfer] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 30_000,
					happenedOn: "2026-09-10",
					description: "Guardar",
					accountId: ready.checking.id,
					counterAccountId: ready.savings.id,
				});

				expect(transfer?.amount).toBe(30_000);
				expect(transfer?.counterAccountId).toBe(ready.savings.id);

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, LATER);
				expect(balanceOf(balances, ready.checking.id).settled).toBe(70_000);
				expect(balanceOf(balances, ready.savings.id).settled).toBe(30_000);

				// One row, so the transfer shows up once in the space.
				const all = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(all).toHaveLength(1);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a transfer that goes nowhere", async () => {
			const ready = await readySpace(adapter);
			try {
				await expect(
					ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "transfer",
						amount: 1000,
						happenedOn: "2026-09-10",
						description: "Para mim mesmo",
						accountId: ready.checking.id,
						counterAccountId: ready.checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				await expect(
					ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "transfer",
						amount: 1000,
						happenedOn: "2026-09-10",
						description: "Sem destino",
						accountId: ready.checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("splits a purchase into installments that add up to it", async () => {
			const ready = await readySpace(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-05",
					description: "Geladeira",
					accountId: ready.card.id,
					installments: 3,
				});

				expect(parts).toHaveLength(3);
				expect(parts.reduce((total, part) => total + part.amount, 0)).toBe(-100_000);
				expect(parts.map((part) => part.description)).toEqual([
					"Geladeira 1/3",
					"Geladeira 2/3",
					"Geladeira 3/3",
				]);
				expect(new Set(parts.map((part) => part.installmentGroup)).size).toBe(1);
				// Bought after the card closed, so the first part lands on the next invoice.
				expect(parts.map((part) => part.invoiceMonth)).toEqual(["2026-10", "2026-11", "2026-12"]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("stamps a card purchase with the invoice it will be charged on", async () => {
			const ready = await readySpace(adapter);
			try {
				const [before] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 5000,
					happenedOn: "2026-09-02",
					description: "Antes do fechamento",
					accountId: ready.card.id,
				});
				const [after] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 5000,
					happenedOn: "2026-09-03",
					description: "No fechamento",
					accountId: ready.card.id,
				});

				expect(before?.invoiceMonth).toBe("2026-09");
				expect(after?.invoiceMonth).toBe("2026-10");

				const invoice = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					invoiceMonth: "2026-10",
				});
				expect(invoice.map((row) => row.description)).toEqual(["No fechamento"]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("leaves an account with no card alone", async () => {
			const ready = await readySpace(adapter);
			try {
				const [row] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 5000,
					happenedOn: "2026-09-03",
					description: "Padaria",
					accountId: ready.checking.id,
				});
				expect(row?.invoiceMonth).toBeNull();
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps what is planned out of the settled balance", async () => {
			const ready = await readySpace(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-30",
					description: "Aluguel",
					accountId: ready.checking.id,
					status: "planned",
				});

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, LATER);
				const checking = balanceOf(balances, ready.checking.id);
				expect(checking.settled).toBe(100_000);
				expect(checking.projected).toBe(80_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("counts a planned record once it is marked as settled", async () => {
			const ready = await readySpace(adapter);
			try {
				const [planned] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-30",
					description: "Aluguel",
					accountId: ready.checking.id,
					status: "planned",
				});

				await ready.fixture.asAna.transactions.settle(planned?.id ?? "", LATER);
				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, LATER);
				expect(balanceOf(balances, ready.checking.id).settled).toBe(80_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("brings a record dated ahead back to today when somebody says it happened", async () => {
			const ready = await readySpace(adapter);
			try {
				const [ahead] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-10-15",
					description: "Aluguel de outubro",
					accountId: ready.checking.id,
					status: "planned",
				});

				const settled = await ready.fixture.asAna.transactions.settle(
					ahead?.id ?? "",
					"2026-09-29",
				);
				expect(settled.status).toBe("settled");
				// Otherwise saying it happened would change nothing anybody can see, because
				// the balance counts by the day and that day is still to come.
				expect(settled.happenedOn).toBe("2026-09-29");

				const now = await ready.fixture.asAna.transactions.balances(ready.spaceId, "2026-09-29");
				expect(balanceOf(now, ready.checking.id).settled).toBe(80_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("leaves the day alone on a record that was already due", async () => {
			const ready = await readySpace(adapter);
			try {
				const [late] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-25",
					description: "Academia",
					accountId: ready.checking.id,
					status: "planned",
				});

				// It fell due on the twenty fifth and is confirmed on the twenty ninth. Moving
				// it forward would take it out of the month it belongs to and out of the limit
				// it was spent against.
				const settled = await ready.fixture.asAna.transactions.settle(late?.id ?? "", "2026-09-29");
				expect(settled.happenedOn).toBe("2026-09-25");
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps a record whose day has not arrived out of the settled balance", async () => {
			const ready = await readySpace(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-10-15",
					description: "Aluguel de outubro",
					accountId: ready.checking.id,
				});

				// Written as a fact, dated in a month that has not come. It is a fact about
				// October and it is not money that has left today.
				const now = await ready.fixture.asAna.transactions.balances(ready.spaceId, "2026-09-29");
				expect(balanceOf(now, ready.checking.id).settled).toBe(100_000);
				expect(balanceOf(now, ready.checking.id).projected).toBe(80_000);

				const after = await ready.fixture.asAna.transactions.balances(ready.spaceId, "2026-10-15");
				expect(balanceOf(after, ready.checking.id).settled).toBe(80_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("counts each part of a purchase in parts in the month of that part", async () => {
			const ready = await readySpace(adapter);
			try {
				// Three parts, written as facts, dated a month apart. All three used to leave
				// the balance on the afternoon of the purchase, and the same two were counted
				// again as money still to come by the reading of instalments ahead.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-05",
					description: "Fone de ouvido",
					accountId: ready.checking.id,
					installments: 3,
				});

				const inSeptember = await ready.fixture.asAna.transactions.balances(
					ready.spaceId,
					"2026-09-29",
				);
				expect(balanceOf(inSeptember, ready.checking.id).settled).toBe(90_000);

				const inOctober = await ready.fixture.asAna.transactions.balances(
					ready.spaceId,
					"2026-10-06",
				);
				expect(balanceOf(inOctober, ready.checking.id).settled).toBe(80_000);

				const inNovember = await ready.fixture.asAna.transactions.balances(
					ready.spaceId,
					"2026-11-06",
				);
				expect(balanceOf(inNovember, ready.checking.id).settled).toBe(70_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("counts money arriving on the other side of a transfer by the day too", async () => {
			const ready = await readySpace(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 50_000,
					happenedOn: "2026-10-10",
					description: "Para a poupanca",
					accountId: ready.checking.id,
					counterAccountId: ready.savings.id,
				});

				const before = await ready.fixture.asAna.transactions.balances(ready.spaceId, "2026-09-29");
				expect(balanceOf(before, ready.checking.id).settled).toBe(100_000);
				expect(balanceOf(before, ready.savings.id).settled).toBe(0);

				const after = await ready.fixture.asAna.transactions.balances(ready.spaceId, "2026-10-10");
				expect(balanceOf(after, ready.checking.id).settled).toBe(50_000);
				expect(balanceOf(after, ready.savings.id).settled).toBe(50_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("cuts the page from the end that was asked for", async () => {
			const ready = await readySpace(adapter);
			try {
				for (const day of ["2026-09-10", "2026-09-20", "2026-09-30"]) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 1_000,
						happenedOn: day,
						description: `Compra de ${day}`,
						accountId: ready.checking.id,
					});
				}

				// Two records, and which two depends on which end the caller asked for. Sorting
				// after the fact cannot do this: the database has already thrown one away.
				const newest = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					limit: 2,
				});
				expect(newest.map((one) => one.happenedOn)).toEqual(["2026-09-30", "2026-09-20"]);

				const oldest = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					limit: 2,
					order: "oldestFirst",
				});
				expect(oldest.map((one) => one.happenedOn)).toEqual(["2026-09-10", "2026-09-20"]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("freezes a record that was reconciled against the bank", async () => {
			const ready = await readySpace(adapter);
			try {
				const [row] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: ready.checking.id,
				});

				await ready.fixture.asAna.transactions.reconcile(row?.id ?? "", true);
				await expect(
					ready.fixture.asAna.transactions.update(row?.id ?? "", { description: "Outro" }),
				).rejects.toBeInstanceOf(RuleError);
				await expect(ready.fixture.asAna.transactions.remove(row?.id ?? "")).rejects.toBeInstanceOf(
					RuleError,
				);

				await ready.fixture.asAna.transactions.reconcile(row?.id ?? "", false);
				const changed = await ready.fixture.asAna.transactions.update(row?.id ?? "", {
					description: "Outro",
				});
				expect(changed.description).toBe("Outro");
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses to write into an archived account", async () => {
			const ready = await readySpace(adapter);
			try {
				await ready.fixture.asAna.accounts.archive(ready.savings.id);
				await expect(
					ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "income",
						amount: 1000,
						happenedOn: "2026-09-10",
						description: "Juros",
						accountId: ready.savings.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("finds records by account, by kind, by day and by words", async () => {
			const ready = await readySpace(adapter);
			try {
				const write = (input: {
					kind: "income" | "expense";
					amount: number;
					happenedOn: string;
					description: string;
					accountId: string;
				}) =>
					ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						...input,
					});

				await write({
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: ready.checking.id,
				});
				await write({
					kind: "income",
					amount: 500_000,
					happenedOn: "2026-09-05",
					description: "Salario",
					accountId: ready.checking.id,
				});
				await write({
					kind: "expense",
					amount: 2000,
					happenedOn: "2026-08-20",
					description: "Cafe",
					accountId: ready.card.id,
				});

				const byAccount = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					accountId: ready.card.id,
				});
				expect(byAccount.map((row) => row.description)).toEqual(["Cafe"]);

				const byKind = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					kind: "income",
				});
				expect(byKind.map((row) => row.description)).toEqual(["Salario"]);

				const byDay = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(byDay).toHaveLength(2);

				const byWords = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					search: "MERCADO",
				});
				expect(byWords.map((row) => row.description)).toEqual(["Mercado do bairro"]);

				// Newest first, which is the order a person expects to read.
				const all = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(all.map((row) => row.happenedOn)).toEqual([
					"2026-09-10",
					"2026-09-05",
					"2026-08-20",
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("removes every installment of one purchase together", async () => {
			const ready = await readySpace(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 60_000,
					happenedOn: "2026-09-05",
					description: "Notebook",
					accountId: ready.card.id,
					installments: 6,
				});

				const removed = await ready.fixture.asAna.transactions.removeGroup(
					parts[0]?.installmentGroup ?? "",
				);
				expect(removed).toBe(6);
				expect(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId })).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * A correction to one part of a purchase can reach the parts ahead of it, and never
		 * the parts behind.
		 *
		 * A subscription in twelve parts filed under the wrong category was twelve rows to
		 * open, and whoever opened one left eleven disagreeing with it. What is behind stays
		 * as it was, because a month somebody has already read does not get rewritten.
		 */
		it("changes this part of a purchase and the parts after it", async () => {
			const ready = await readySpace(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 60_000,
					happenedOn: "2026-09-05",
					description: "Curso",
					accountId: ready.card.id,
					installments: 6,
				});
				const group = parts[0]?.installmentGroup ?? "";
				const third = parts.find((part) => part.installmentNumber === 3);

				// From the third on: four rows, a new name and a new amount each.
				const changed = await ready.fixture.asAna.transactions.updateFrom(third?.id ?? "", {
					description: "Curso de inglês",
					amount: 15_000,
				});
				expect(changed).toBe(4);

				const after = await ready.fixture.asAna.transactions.list({ installmentGroup: group });
				const byNumber = (number: number) => after.find((row) => row.installmentNumber === number);

				// The two behind are untouched, name, number and amount.
				expect(byNumber(1)?.description).toBe("Curso 1/6");
				expect(byNumber(1)?.amount).toBe(-10_000);
				expect(byNumber(2)?.description).toBe("Curso 2/6");

				// And each part from the third keeps its own number in its own name.
				expect(byNumber(3)?.description).toBe("Curso de inglês 3/6");
				expect(byNumber(6)?.description).toBe("Curso de inglês 6/6");
				expect(byNumber(3)?.amount).toBe(-15_000);
				expect(byNumber(6)?.amount).toBe(-15_000);

				// Each part falls on its own day, so the day is not one of the things this
				// changes, and asking for it is refused rather than silently ignored.
				await expect(
					ready.fixture.asAna.transactions.updateFrom(third?.id ?? "", {
						happenedOn: "2026-12-01",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("finds a record by its mark, however many records are in the way", async () => {
			const ready = await readySpace(adapter);
			try {
				// The mark goes on one record, and then enough records are written after it
				// to push it past any page a caller would ask for by day. Somebody who came
				// back looking for their own record by a range of days would be told it is
				// not there and would write it again.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 500_000,
					happenedOn: "2026-09-30",
					description: "Entradas de setembro",
					accountId: ready.checking.id,
					externalId: "mes:2026-09:income",
				});

				for (let count = 0; count < 12; count += 1) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount: 1_000 + count,
						happenedOn: "2026-09-30",
						description: `Compra ${count}`,
						accountId: ready.checking.id,
					});
				}

				const found = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					externalIds: ["mes:2026-09:income", "mes:2026-09:spending"],
				});
				expect(found).toHaveLength(1);
				expect(found[0]?.externalId).toBe("mes:2026-09:income");

				// A page of the same days holds thirteen, so the mark is doing the work
				// rather than the ordering happening to be kind.
				const everything = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(everything).toHaveLength(13);

				expect(
					await ready.fixture.asAna.transactions.list({
						spaceId: ready.spaceId,
						externalIds: ["mes:2026-09:invoice"],
					}),
				).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("changing several records at once", () => {
		/** Three planned bills, which is the selection people actually make. */
		async function threeBills(adapter: AdapterUnderTest) {
			const ready = await readySpace(adapter);
			const ids: string[] = [];
			for (const [day, description] of [
				["2026-09-05", "Aluguel"],
				["2026-09-10", "Luz"],
				["2026-09-15", "Internet"],
			] as const) {
				const [written] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 10_000,
					happenedOn: day,
					description,
					accountId: ready.checking.id,
					status: "planned",
				});
				ids.push(written?.id ?? "");
			}
			return { ready, ids };
		}

		it("marks a selection as paid in one go", async () => {
			const { ready, ids } = await threeBills(adapter);
			try {
				expect(await ready.fixture.asAna.transactions.updateMany(ids, { status: "settled" })).toBe(
					3,
				);
				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(rows.every((row) => row.status === "settled")).toBe(true);
			} finally {
				await ready.fixture.close();
			}
		});

		it("changes nothing at all when one of them is frozen", async () => {
			const { ready, ids } = await threeBills(adapter);
			try {
				await ready.fixture.asAna.transactions.reconcile(ids[1] ?? "", true);

				await expect(
					ready.fixture.asAna.transactions.updateMany(ids, { status: "settled" }),
				).rejects.toBeInstanceOf(RuleError);

				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(rows.every((row) => row.status === "planned")).toBe(true);
			} finally {
				await ready.fixture.close();
			}
		});

		it("moves a selection to another account and works out the invoice again", async () => {
			const { ready, ids } = await threeBills(adapter);
			try {
				await ready.fixture.asAna.transactions.updateMany(ids, { accountId: ready.card.id });

				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(rows.every((row) => row.accountId === ready.card.id)).toBe(true);
				// The card closes on the third, so all three fall on the October invoice.
				expect(rows.map((row) => row.invoiceMonth)).toEqual(["2026-10", "2026-10", "2026-10"]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("removes a selection, or none of it", async () => {
			const { ready, ids } = await threeBills(adapter);
			try {
				await ready.fixture.asAna.transactions.reconcile(ids[0] ?? "", true);
				await expect(ready.fixture.asAna.transactions.removeMany(ids)).rejects.toBeInstanceOf(
					RuleError,
				);
				expect(
					(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId })).length,
				).toBe(3);

				await ready.fixture.asAna.transactions.reconcile(ids[0] ?? "", false);
				expect(await ready.fixture.asAna.transactions.removeMany(ids)).toBe(3);
				expect(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId })).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("does nothing, quietly, when the selection is empty", async () => {
			const { ready } = await threeBills(adapter);
			try {
				expect(await ready.fixture.asAna.transactions.updateMany([], { status: "settled" })).toBe(
					0,
				);
				expect(await ready.fixture.asAna.transactions.removeMany([])).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a selection that reaches into a space the person cannot write to", async () => {
			const { ready, ids } = await threeBills(adapter);
			try {
				await expect(
					ready.fixture.asJoao.transactions.updateMany(ids, { status: "settled" }),
				).rejects.toBeInstanceOf(NotFoundError);
				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(rows.every((row) => row.status === "planned")).toBe(true);
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("the logger role", () => {
		async function withLogger(): Promise<{ ready: Ready; asLogger: Session }> {
			const ready = await readySpace(adapter);
			const house = await ready.fixture.asAna.spaces.create({ name: "Casa" });
			await ready.fixture.asAna.members.invite({
				spaceId: house.id,
				userId: ready.fixture.joao.id,
				role: "logger",
			});
			await ready.fixture.asJoao.members.accept(house.id);

			const account = await ready.fixture.asAna.accounts.create({
				spaceId: house.id,
				kind: "checking",
				name: "Conta da casa",
			});

			await ready.fixture.asAna.transactions.create({
				spaceId: house.id,
				kind: "expense",
				amount: 10_000,
				happenedOn: "2026-09-10",
				description: "Mercado da Ana",
				accountId: account.id,
			});
			await ready.fixture.asJoao.transactions.create({
				spaceId: house.id,
				kind: "expense",
				amount: 5000,
				happenedOn: "2026-09-11",
				description: "Padaria do Joao",
				accountId: account.id,
			});

			return {
				ready: { ...ready, spaceId: house.id },
				asLogger: ready.fixture.asJoao,
			};
		}

		it("writes what they spent", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const mine = await asLogger.transactions.list({ spaceId: ready.spaceId });
				expect(mine.map((row) => row.description)).toEqual(["Padaria do Joao"]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("does not see what anybody else wrote", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const everything = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				const other = everything.find((row) => row.description === "Mercado da Ana");
				expect(other).toBeDefined();

				await expect(asLogger.transactions.get(other?.id ?? "")).rejects.toBeInstanceOf(
					NotFoundError,
				);
				await expect(
					asLogger.transactions.update(other?.id ?? "", { description: "Outro" }),
				).rejects.toBeInstanceOf(NotFoundError);
				await expect(asLogger.transactions.remove(other?.id ?? "")).rejects.toBeInstanceOf(
					NotFoundError,
				);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The same rule, on the query behind the import screen.
		 *
		 * It asked whether the caller may read transactions and then filtered on the space
		 * alone, so the screen that marks what looks familiar handed a logger every record
		 * of the space, with its description and its amount, which is the one thing the
		 * role exists to prevent.
		 */
		it("reads only their own rows back when a file is checked for repeats", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const known = await asLogger.imports.existing(ready.spaceId);
				expect(known.map((row) => row.description)).toEqual(["Padaria do Joao"]);

				const everything = await ready.fixture.asAna.imports.existing(ready.spaceId);
				expect(everything.map((row) => row.description).sort()).toEqual([
					"Mercado da Ana",
					"Padaria do Joao",
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * Every screen that reads records, and not only the list and the limits.
		 *
		 * The rule was held by the list, the reports, the budget and the import, and not by
		 * the balances, the projection, the savings, the goals or the diagnosis, so one
		 * screen showed a logger their own spending against a limit beside four vital signs
		 * about the whole household. The comment on the findings said the opposite of what
		 * the code did.
		 */
		it("reads the household to nobody who only sees their own rows", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const spaceId = ready.spaceId;
				const today = "2026-09-20";

				// Ana wrote a hundred, the logger wrote fifty, and every figure below has to
				// be made of the fifty alone.
				const balances = await asLogger.transactions.balances(ready.spaceId, LATER);
				const settled = balances.reduce((sum, one) => sum + one.settled, 0);
				expect(settled).toBe(-5000);

				const ahead = await asLogger.projections.monthsAhead({
					spaceId,
					from: "2026-09",
					months: 3,
					today,
				});
				expect(ahead.months.every((month) => month.expense <= 5000)).toBe(true);

				const savings = await asLogger.goals.savings({ spaceId, month: "2026-09" });
				expect(savings.earned).toBe(0);

				const seen = await asLogger.advice.snapshot({ spaceId, today });
				const everything = await ready.fixture.asAna.advice.snapshot({ spaceId, today });
				expect(seen.thisMonth.expense).toBe(5000);
				expect(everything.thisMonth.expense).toBe(15_000);
				// The money on hand is the household's, so for them it is what they put
				// through the accounts themselves and not the opening balances.
				expect(seen.onHand).toBe(-5000);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The one delete path that asked the permission and then skipped the two questions
		 * every other one asks: whose row it is, and whether it was ticked off against the
		 * bank. A logger holds transaction.delete, so it could take away somebody else's
		 * whole instalment plan.
		 */
		it("refuses to take away an instalment plan that is not theirs", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const account = (await ready.fixture.asAna.accounts.list(ready.spaceId))[0];
				const card = await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "credit",
					name: "Cartao da casa",
					closingDay: 10,
					dueDay: 20,
				});
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-05",
					description: "Geladeira da Ana",
					accountId: card.id,
					installments: 3,
				});
				const group = parts[0]?.installmentGroup ?? "";
				expect(group).not.toBe("");
				expect(account).toBeDefined();

				await expect(asLogger.transactions.removeGroup(group)).rejects.toBeInstanceOf(
					NotFoundError,
				);

				// And it is all still there.
				const left = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(left.filter((row) => row.installmentGroup === group)).toHaveLength(3);
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps seeing their own rows across spaces they belong to", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const everywhere = await asLogger.transactions.list({});
				expect(everywhere.map((row) => row.description)).toEqual(["Padaria do Joao"]);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The three readings 1.1.0 added that were open to them, and are not.
		 *
		 * Each of them is a figure made of every record on an account whoever wrote it, which
		 * is what makes them useful and what makes them somebody else's. Each asked only for
		 * a permission every role holds, so the release that closed the diagnosis to a logger
		 * opened three new doors beside it.
		 */
		it("closes the invoice, the allowance and the count of records to them", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const card = await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "credit",
					name: "Cartão da casa",
					closingDay: 28,
					dueDay: 5,
				});
				const voucher = await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "voucher",
					name: "Vale da casa",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-12",
					description: "Compra da Ana",
					accountId: card.id,
				});

				// An invoice is the whole of what the card will charge, so it is not read one
				// person at a time. The card screen said so from the start and refused; these
				// two asked for transaction.read, which a logger holds.
				await expect(asLogger.invoices.list(card.id, LATER)).rejects.toBeInstanceOf(RuleError);
				await expect(asLogger.invoices.get(card.id, "2026-09", LATER)).rejects.toBeInstanceOf(
					RuleError,
				);
				// And the whole of it still reads for whoever may see the household.
				expect((await ready.fixture.asAna.invoices.get(card.id, "2026-09", LATER)).charged).toBe(
					30_000,
				);

				// What is left on a benefit card is made of every lunch on it, so it says
				// nothing to somebody who can see none of them.
				expect(await asLogger.accounts.benefitLeft(voucher.id, "2026-09-30")).toBeNull();
				expect(
					(await ready.fixture.asAna.accounts.benefitLeft(voucher.id, "2026-09-30"))?.quota,
				).toBe(90_000);

				// And a count of records counts what the asker can see, like every other count.
				const account = (await ready.fixture.asAna.accounts.list(ready.spaceId)).find(
					(one) => one.name === "Conta da casa",
				);
				expect(await asLogger.accounts.recordCount(account?.id ?? "")).toBe(1);
				expect(await ready.fixture.asAna.accounts.recordCount(account?.id ?? "")).toBe(2);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The allowance of a benefit card is the household's, so it is not folded into a
		 * month made of one person's records.
		 *
		 * The filter was on the branch that reads every space and not on the branch every
		 * screen takes, so naming a space skipped it: a logger's own month came back with the
		 * household's whole meal card allowance inside its income and its difference, under a
		 * line saying these were only their figures.
		 */
		it("leaves the household's allowance out of a month made of their own records", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "voucher",
					name: "Vale da casa",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				const range = { spaceId: ready.spaceId, from: "2026-09-01", to: "2026-09-30" } as const;
				const theirs = await asLogger.reports.totals(range);
				expect(theirs.benefits).toBe(0);
				expect(theirs.expense).toBe(5000);
				expect(theirs.left).toBe(-5000);

				// The household reads it whole, which is the figure the allowance is for.
				const household = await ready.fixture.asAna.reports.totals(range);
				expect(household.benefits).toBe(90_000);
			} finally {
				await ready.fixture.close();
			}
		});

		/**
		 * The mark of an instalment plan is not renamed when a backup is restored into a
		 * second space, so two spaces can hold two plans under one mark.
		 *
		 * A caller that asked the permission once, on the first part it found, was asking
		 * about one space and writing both. The row is written here by hand because that is
		 * what a restore leaves behind, and because the repositories would never write it.
		 */
		it("corrects and removes a plan in one space, and never a namesake in another", async () => {
			const ready = await readySpace(adapter);
			try {
				const parts = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 60_000,
					happenedOn: "2026-09-05",
					description: "Curso",
					accountId: ready.card.id,
					installments: 3,
				});
				const group = parts[0]?.installmentGroup ?? "";

				// A second space of the same person, with one row carrying the same mark.
				const other = await ready.fixture.asAna.spaces.create({ name: "Viagem" });
				const elsewhere = await ready.fixture.asAna.accounts.create({
					spaceId: other.id,
					kind: "checking",
					name: "Conta da viagem",
				});
				const [restored] = await ready.fixture.asAna.transactions.create({
					spaceId: other.id,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-06",
					description: "Restaurado 1/3",
					accountId: elsewhere.id,
				});
				await ready.fixture.driver.run(
					`UPDATE "transactions" SET "installment_group" = ?, "installment_number" = 1,
					   "installment_count" = 3 WHERE "id" = ?`,
					[group, restored?.id ?? ""],
				);

				// Correcting the plan from its first part touches three rows, not four.
				const changed = await ready.fixture.asAna.transactions.updateFrom(parts[0]?.id ?? "", {
					description: "Curso de inglês",
				});
				expect(changed).toBe(3);
				expect((await ready.fixture.asAna.transactions.get(restored?.id ?? "")).description).toBe(
					"Restaurado 1/3",
				);

				// And removing it removes three.
				expect(await ready.fixture.asAna.transactions.removeGroup(group)).toBe(3);
				expect(
					(await ready.fixture.asAna.transactions.list({ spaceId: other.id })).map(
						(row) => row.description,
					),
				).toEqual(["Restaurado 1/3"]);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
