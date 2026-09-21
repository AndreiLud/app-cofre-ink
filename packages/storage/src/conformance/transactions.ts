// The transaction part of the conformance suite.
//
// These are the rules that decide whether the numbers on the screen are true, so they
// are checked against every engine, not just the one that happens to be convenient.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import type { Account } from "../models.ts";
import type { Session } from "../session.ts";
import { type AdapterUnderTest, type Fixture, prepare } from "./setup.ts";

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

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId);
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

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId);
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

				await ready.fixture.asAna.transactions.settle(planned?.id ?? "");
				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId);
				expect(balanceOf(balances, ready.checking.id).settled).toBe(80_000);
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

		it("keeps seeing their own rows across spaces they belong to", async () => {
			const { ready, asLogger } = await withLogger();
			try {
				const everywhere = await asLogger.transactions.list({});
				expect(everywhere.map((row) => row.description)).toEqual(["Padaria do Joao"]);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
