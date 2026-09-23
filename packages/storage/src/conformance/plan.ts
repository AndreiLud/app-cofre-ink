// Budgets, goals, the savings rule and the division of money between people.
//
// The one thing every test here is really checking is that money is not invented and
// not lost: a limit counts what it should and nothing else, a goal reads the account it
// points at, and what two people owe each other always adds up to zero.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import type { Session } from "../session.ts";
import { type AdapterUnderTest, type Fixture, prepare } from "./setup.ts";

export function runPlanConformance(adapter: AdapterUnderTest): void {
	async function personalSpace() {
		const fixture = await prepare(adapter);
		const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
		const account = await fixture.asAna.accounts.create({
			spaceId: space.id,
			kind: "checking",
			name: "Conta",
			initialBalance: 100_000,
		});
		const savings = await fixture.asAna.accounts.create({
			spaceId: space.id,
			kind: "savings",
			name: "Reserva",
		});
		const market = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Mercado",
			kind: "expense",
			priority: "essential",
		});
		const fun = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Bar",
			kind: "expense",
			priority: "superfluous",
		});
		return { fixture, spaceId: space.id, account, savings, market, fun };
	}

	/** A house with two people in it, which is what splitting needs. */
	async function sharedSpace(): Promise<{
		fixture: Fixture;
		spaceId: string;
		accountId: string;
		asJoao: Session;
	}> {
		const fixture = await prepare(adapter);
		const house = await fixture.asAna.spaces.create({ name: "Casa" });
		await fixture.asAna.members.invite({
			spaceId: house.id,
			userId: fixture.joao.id,
			role: "editor",
		});
		await fixture.asJoao.members.accept(house.id);

		const account = await fixture.asAna.accounts.create({
			spaceId: house.id,
			kind: "checking",
			name: "Conta conjunta",
		});
		return { fixture, spaceId: house.id, accountId: account.id, asJoao: fixture.asJoao };
	}

	describe("budgets", () => {
		it("counts what leaves, and only inside its reach", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "category",
					categoryId: ready.market.id,
					amount: 100_000,
				});

				for (const [amount, categoryId] of [
					[40_000, ready.market.id],
					[15_000, ready.fun.id],
				] as const) {
					await ready.fixture.asAna.transactions.create({
						spaceId: ready.spaceId,
						kind: "expense",
						amount,
						happenedOn: "2026-09-10",
						description: "Compra",
						accountId: ready.account.id,
						categoryId,
					});
				}
				// Money coming in never counts against a limit.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 500_000,
					happenedOn: "2026-09-05",
					description: "Salario",
					accountId: ready.account.id,
				});

				const [limit] = await ready.fixture.asAna.budgets.progress({
					spaceId: ready.spaceId,
					month: "2026-09",
					today: "2026-09-30",
				});
				expect(limit?.progress.spent).toBe(40_000);
				expect(limit?.progress.left).toBe(60_000);
				expect(limit?.progress.state).toBe("comfortable");
			} finally {
				await ready.fixture.close();
			}
		});

		it("counts by priority, taking the one the record carries over the one of the category", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "priority",
					priority: "superfluous",
					amount: 20_000,
				});

				// Bought at the market, but this one was not a need.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 9000,
					happenedOn: "2026-09-10",
					description: "Vinho caro",
					accountId: ready.account.id,
					categoryId: ready.market.id,
					priority: "superfluous",
				});
				// And this one was.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-11",
					description: "Feira",
					accountId: ready.account.id,
					categoryId: ready.market.id,
				});

				const [limit] = await ready.fixture.asAna.budgets.progress({
					spaceId: ready.spaceId,
					month: "2026-09",
					today: "2026-09-30",
				});
				expect(limit?.progress.spent).toBe(9000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("lets one month say something different from every month", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "total",
					amount: 300_000,
				});
				await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "total",
					amount: 500_000,
					month: "2026-12",
				});

				const september = await ready.fixture.asAna.budgets.progress({
					spaceId: ready.spaceId,
					month: "2026-09",
				});
				const december = await ready.fixture.asAna.budgets.progress({
					spaceId: ready.spaceId,
					month: "2026-12",
				});

				expect(september).toHaveLength(1);
				expect(september[0]?.progress.limit).toBe(300_000);
				expect(december).toHaveLength(1);
				expect(december[0]?.progress.limit).toBe(500_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("changes the limit instead of writing a second one for the same thing", async () => {
			const ready = await personalSpace();
			try {
				const first = await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "category",
					categoryId: ready.market.id,
					amount: 100_000,
				});
				const again = await ready.fixture.asAna.budgets.create({
					spaceId: ready.spaceId,
					scope: "category",
					categoryId: ready.market.id,
					amount: 150_000,
				});

				expect(again.id).toBe(first.id);
				expect(again.amount).toBe(150_000);
				expect(await ready.fixture.asAna.budgets.list(ready.spaceId)).toHaveLength(1);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a limit that is not a positive amount, and one with nothing to limit", async () => {
			const ready = await personalSpace();
			try {
				await expect(
					ready.fixture.asAna.budgets.create({
						spaceId: ready.spaceId,
						scope: "total",
						amount: 0,
					}),
				).rejects.toBeInstanceOf(RuleError);
				await expect(
					ready.fixture.asAna.budgets.create({
						spaceId: ready.spaceId,
						scope: "category",
						amount: 1000,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("goals and the savings rule", () => {
		it("reads what is in the account behind the goal", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.goals.create({
					spaceId: ready.spaceId,
					name: "Reserva de emergencia",
					targetAmount: 1_000_000,
					accountId: ready.savings.id,
				});

				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 250_000,
					happenedOn: "2026-09-10",
					description: "Guardar",
					accountId: ready.account.id,
					counterAccountId: ready.savings.id,
				});

				const [goal] = await ready.fixture.asAna.goals.progress({
					spaceId: ready.spaceId,
					today: "2026-09-21",
				});
				expect(goal?.saved).toBe(250_000);
				expect(goal?.left).toBe(750_000);
				expect(goal?.share).toBeCloseTo(0.25);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says how much a month it takes to arrive on time", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.goals.create({
					spaceId: ready.spaceId,
					name: "Viagem",
					targetAmount: 600_000,
					accountId: ready.savings.id,
					targetDate: "2027-03-21",
				});

				const [goal] = await ready.fixture.asAna.goals.progress({
					spaceId: ready.spaceId,
					today: "2026-09-21",
				});
				// Six months to go, nothing saved yet.
				expect(goal?.monthlyNeeded).toBe(100_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps one goal per account, so the same money is never counted twice", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.goals.create({
					spaceId: ready.spaceId,
					name: "Reserva",
					targetAmount: 100_000,
					accountId: ready.savings.id,
				});
				await expect(
					ready.fixture.asAna.goals.create({
						spaceId: ready.spaceId,
						name: "Outra coisa",
						targetAmount: 50_000,
						accountId: ready.savings.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("compares what the rule asked for against what went in", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.goals.setRule({
					spaceId: ready.spaceId,
					mode: "percent",
					// Ten percent, written in hundredths of a percent.
					value: 1000,
					accountId: ready.savings.id,
				});

				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 600_000,
					happenedOn: "2026-09-05",
					description: "Salario",
					accountId: ready.account.id,
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 40_000,
					happenedOn: "2026-09-06",
					description: "Guardar",
					accountId: ready.account.id,
					counterAccountId: ready.savings.id,
				});

				const savings = await ready.fixture.asAna.goals.savings({
					spaceId: ready.spaceId,
					month: "2026-09",
				});
				expect(savings.earned).toBe(600_000);
				expect(savings.expected).toBe(60_000);
				expect(savings.put).toBe(40_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps one rule per space, however many times it is written", async () => {
			const ready = await personalSpace();
			try {
				await ready.fixture.asAna.goals.setRule({
					spaceId: ready.spaceId,
					mode: "percent",
					value: 1000,
				});
				const second = await ready.fixture.asAna.goals.setRule({
					spaceId: ready.spaceId,
					mode: "fixed",
					value: 50_000,
				});

				const rule = await ready.fixture.asAna.goals.readRule(ready.spaceId);
				expect(rule?.id).toBe(second.id);
				expect(rule?.mode).toBe("fixed");
				expect(rule?.value).toBe(50_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a share of what comes in that is over everything", async () => {
			const ready = await personalSpace();
			try {
				await expect(
					ready.fixture.asAna.goals.setRule({
						spaceId: ready.spaceId,
						mode: "percent",
						value: 20_000,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("dividing an expense between people", () => {
		it("splits it evenly and says who owes whom", async () => {
			const ready = await sharedSpace();
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-10",
					description: "Mercado da casa",
					accountId: ready.accountId,
				});

				const parts = await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "evenly",
				});
				expect(parts).toHaveLength(2);
				expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(20_000);

				const balances = await ready.fixture.asAna.sharing.balances(ready.spaceId);
				expect(balances.find((one) => one.userId === ready.fixture.ana.id)?.amount).toBe(10_000);
				expect(balances.find((one) => one.userId === ready.fixture.joao.id)?.amount).toBe(-10_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("splits in proportion to what each one earns", async () => {
			const ready = await sharedSpace();
			try {
				await ready.fixture.asAna.members.setIncome(ready.spaceId, ready.fixture.ana.id, 600_000);
				await ready.fixture.asAna.members.setIncome(ready.spaceId, ready.fixture.joao.id, 400_000);

				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "Aluguel",
					accountId: ready.accountId,
				});

				const parts = await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "income",
				});
				const ana = parts.find((part) => part.userId === ready.fixture.ana.id);
				const joao = parts.find((part) => part.userId === ready.fixture.joao.id);
				expect(ana?.amount).toBe(60_000);
				expect(joao?.amount).toBe(40_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("replaces a division instead of piling them up", async () => {
			const ready = await sharedSpace();
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-10",
					description: "Internet",
					accountId: ready.accountId,
				});

				await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "evenly",
				});
				const second = await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "shares",
					userIds: [ready.fixture.ana.id, ready.fixture.joao.id],
					weights: [2, 1],
				});

				expect(second).toHaveLength(2);
				expect(second.find((part) => part.userId === ready.fixture.ana.id)?.amount).toBe(20_000);
				expect(second.reduce((sum, part) => sum + part.amount, 0)).toBe(30_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses to divide anything that is not an expense", async () => {
			const ready = await sharedSpace();
			try {
				const [income] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Reembolso",
					accountId: ready.accountId,
				});

				await expect(
					ready.fixture.asAna.sharing.split({
						transactionId: income?.id ?? "",
						method: "evenly",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses to divide in a space with one person in it", async () => {
			const ready = await personalSpace();
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Sozinho",
					accountId: ready.account.id,
				});

				await expect(
					ready.fixture.asAna.sharing.split({
						transactionId: expense?.id ?? "",
						method: "evenly",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says nothing is owed once it has been paid back", async () => {
			const ready = await sharedSpace();
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-10",
					description: "Conta de luz",
					accountId: ready.accountId,
				});
				await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "evenly",
				});

				const suggested = await ready.fixture.asAna.sharing.suggestSettlements(ready.spaceId);
				expect(suggested).toEqual([
					{
						fromUserId: ready.fixture.joao.id,
						toUserId: ready.fixture.ana.id,
						amount: 10_000,
					},
				]);

				await ready.fixture.asAna.sharing.settle({
					spaceId: ready.spaceId,
					fromUserId: ready.fixture.joao.id,
					toUserId: ready.fixture.ana.id,
					amount: 10_000,
					happenedOn: "2026-09-12",
				});

				expect(await ready.fixture.asAna.sharing.balances(ready.spaceId)).toEqual([]);
				expect(await ready.fixture.asAna.sharing.suggestSettlements(ready.spaceId)).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps the division of one space out of another", async () => {
			const ready = await sharedSpace();
			try {
				const [expense] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Casa",
					accountId: ready.accountId,
				});
				await ready.fixture.asAna.sharing.split({
					transactionId: expense?.id ?? "",
					method: "evenly",
				});

				await expect(ready.fixture.asCarla.sharing.balances(ready.spaceId)).rejects.toBeInstanceOf(
					NotFoundError,
				);
				await expect(ready.fixture.asCarla.sharing.splitsOf(expense?.id ?? "")).resolves.toEqual(
					[],
				);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a payment between people who are not both in the space", async () => {
			const ready = await sharedSpace();
			try {
				await expect(
					ready.fixture.asAna.sharing.settle({
						spaceId: ready.spaceId,
						fromUserId: ready.fixture.carla.id,
						toUserId: ready.fixture.ana.id,
						amount: 1000,
						happenedOn: "2026-09-12",
					}),
				).rejects.toBeInstanceOf(RuleError);

				await expect(
					ready.fixture.asAna.sharing.settle({
						spaceId: ready.spaceId,
						fromUserId: ready.fixture.ana.id,
						toUserId: ready.fixture.ana.id,
						amount: 1000,
						happenedOn: "2026-09-12",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
