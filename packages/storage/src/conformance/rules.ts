// Rules and recurrences, on every adapter.
//
// These two write records without anybody watching, so the things worth checking are
// the ones that would be discovered late: a rule that overrules a person, and a series
// that writes the same day twice.

import { addDays, todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runRuleConformance(adapter: AdapterUnderTest): void {
	async function readySpace() {
		const fixture = await prepare(adapter);
		const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
		const account = await fixture.asAna.accounts.create({
			spaceId: space.id,
			kind: "checking",
			name: "Conta",
			initialBalance: 500_000,
		});
		const card = await fixture.asAna.accounts.create({
			spaceId: space.id,
			kind: "credit",
			name: "Cartao",
			closingDay: 3,
			dueDay: 10,
		});
		const delivery = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Delivery",
			kind: "expense",
			priority: "superfluous",
		});
		const market = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Mercado",
			kind: "expense",
			priority: "essential",
		});
		return { fixture, spaceId: space.id, account, card, delivery, market };
	}

	describe("rules that sort on their own", () => {
		it("sorts a new record that arrives with no category", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "ifood",
					categoryId: ready.delivery.id,
				});

				const [written] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "IFOOD * Restaurante",
					accountId: ready.account.id,
				});
				expect(written?.categoryId).toBe(ready.delivery.id);
			} finally {
				await ready.fixture.close();
			}
		});

		it("never overrules a category somebody chose by hand", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "ifood",
					categoryId: ready.delivery.id,
				});

				const [written] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Ifood do mercado",
					accountId: ready.account.id,
					categoryId: ready.market.id,
				});
				expect(written?.categoryId).toBe(ready.market.id);
			} finally {
				await ready.fixture.close();
			}
		});

		it("takes the rule that comes first, and can be narrowed to one account", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "padaria",
					categoryId: ready.market.id,
					position: 2,
				});
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "padaria",
					categoryId: ready.delivery.id,
					accountId: ready.card.id,
					position: 1,
				});

				const [onCard] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Padaria da esquina",
					accountId: ready.card.id,
				});
				const [onAccount] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Padaria da esquina",
					accountId: ready.account.id,
				});

				expect(onCard?.categoryId).toBe(ready.delivery.id);
				expect(onAccount?.categoryId).toBe(ready.market.id);
			} finally {
				await ready.fixture.close();
			}
		});

		it("leaves a transfer alone, because moving money is not spending", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "guardar",
					categoryId: ready.market.id,
				});
				const savings = await ready.fixture.asAna.accounts.create({
					spaceId: ready.spaceId,
					kind: "savings",
					name: "Poupanca",
				});

				const [written] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Guardar um pouco",
					accountId: ready.account.id,
					counterAccountId: savings.id,
				});
				expect(written?.categoryId).toBe(null);
			} finally {
				await ready.fixture.close();
			}
		});

		it("runs over what is already there, and only over what was never sorted", async () => {
			const ready = await readySpace();
			try {
				const [loose] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 3000,
					happenedOn: "2026-09-10",
					description: "Ifood de ontem",
					accountId: ready.account.id,
				});
				const [byHand] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 3000,
					happenedOn: "2026-09-11",
					description: "Ifood do almoco",
					accountId: ready.account.id,
					categoryId: ready.market.id,
				});

				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "ifood",
					categoryId: ready.delivery.id,
				});

				expect(await ready.fixture.asAna.rules.applyToExisting({ spaceId: ready.spaceId })).toBe(1);
				expect((await ready.fixture.asAna.transactions.get(loose?.id ?? "")).categoryId).toBe(
					ready.delivery.id,
				);
				expect((await ready.fixture.asAna.transactions.get(byHand?.id ?? "")).categoryId).toBe(
					ready.market.id,
				);
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses a rule that would match everything", async () => {
			const ready = await readySpace();
			try {
				await expect(
					ready.fixture.asAna.rules.create({
						spaceId: ready.spaceId,
						matchText: " a ",
						categoryId: ready.market.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says what it would do without writing anything", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.rules.create({
					spaceId: ready.spaceId,
					matchText: "ifood",
					categoryId: ready.delivery.id,
				});

				const found = await ready.fixture.asAna.rules.suggest({
					spaceId: ready.spaceId,
					description: "ifood agora",
					accountId: ready.account.id,
					kind: "expense",
				});
				expect(found?.categoryId).toBe(ready.delivery.id);
				expect(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId })).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});
	});

	describe("things that happen again", () => {
		it("writes the days it owes, as promises and not as facts", async () => {
			const ready = await readySpace();
			try {
				const today = todayIn("America/Sao_Paulo");
				await ready.fixture.asAna.recurrences.create({
					spaceId: ready.spaceId,
					description: "Aluguel",
					kind: "expense",
					amount: 145_000,
					accountId: ready.account.id,
					frequency: "monthly",
					startsOn: today,
					categoryId: ready.market.id,
				});

				const written = await ready.fixture.asAna.recurrences.materialize({
					spaceId: ready.spaceId,
				});
				expect(written).toBeGreaterThanOrEqual(2);

				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(rows.every((row) => row.status === "planned")).toBe(true);
				expect(rows.every((row) => row.amount === -145_000)).toBe(true);
				expect(rows.every((row) => row.recurrenceId !== null)).toBe(true);
				expect(rows.every((row) => row.categoryId === ready.market.id)).toBe(true);

				// The settled balance is untouched, because none of this has happened.
				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId);
				expect(balances.find((one) => one.accountId === ready.account.id)?.settled).toBe(500_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("never writes the same day twice, however many times it runs", async () => {
			const ready = await readySpace();
			try {
				await ready.fixture.asAna.recurrences.create({
					spaceId: ready.spaceId,
					description: "Streaming",
					kind: "expense",
					amount: 2790,
					accountId: ready.account.id,
					frequency: "monthly",
					startsOn: todayIn("America/Sao_Paulo"),
				});

				const first = await ready.fixture.asAna.recurrences.materialize({
					spaceId: ready.spaceId,
				});
				const second = await ready.fixture.asAna.recurrences.materialize({
					spaceId: ready.spaceId,
				});
				const third = await ready.fixture.asAna.recurrences.materialize({ spaceId: ready.spaceId });

				expect(first).toBeGreaterThan(0);
				expect(second).toBe(0);
				expect(third).toBe(0);
				expect(
					(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId })).length,
				).toBe(first);
			} finally {
				await ready.fixture.close();
			}
		});

		it("writes nothing while it is on hold", async () => {
			const ready = await readySpace();
			try {
				const series = await ready.fixture.asAna.recurrences.create({
					spaceId: ready.spaceId,
					description: "Academia",
					kind: "expense",
					amount: 9900,
					accountId: ready.account.id,
					frequency: "monthly",
					startsOn: todayIn("America/Sao_Paulo"),
				});
				await ready.fixture.asAna.recurrences.update(series.id, { paused: true });

				expect(await ready.fixture.asAna.recurrences.materialize({ spaceId: ready.spaceId })).toBe(
					0,
				);
			} finally {
				await ready.fixture.close();
			}
		});

		it("takes its promises back when it is removed, and leaves what happened", async () => {
			const ready = await readySpace();
			try {
				const today = todayIn("America/Sao_Paulo");
				const series = await ready.fixture.asAna.recurrences.create({
					spaceId: ready.spaceId,
					description: "Internet",
					kind: "expense",
					amount: 12_000,
					accountId: ready.account.id,
					frequency: "monthly",
					startsOn: addDays(today, -1),
				});
				await ready.fixture.asAna.recurrences.materialize({ spaceId: ready.spaceId });

				const rows = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				const oldest = rows[rows.length - 1];
				await ready.fixture.asAna.transactions.settle(oldest?.id ?? "");

				await ready.fixture.asAna.recurrences.remove(series.id);

				const left = await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId });
				expect(left.map((row) => row.id)).toEqual([oldest?.id]);
				expect(left[0]?.status).toBe("settled");
			} finally {
				await ready.fixture.close();
			}
		});

		it("refuses an amount that is not a positive integer, and a day that does not exist", async () => {
			const ready = await readySpace();
			try {
				await expect(
					ready.fixture.asAna.recurrences.create({
						spaceId: ready.spaceId,
						description: "Errado",
						kind: "expense",
						amount: -100,
						accountId: ready.account.id,
						frequency: "monthly",
						startsOn: "2026-09-10",
					}),
				).rejects.toBeInstanceOf(RuleError);

				await expect(
					ready.fixture.asAna.recurrences.create({
						spaceId: ready.spaceId,
						description: "Errado",
						kind: "expense",
						amount: 100,
						accountId: ready.account.id,
						frequency: "monthly",
						startsOn: "2026-02-30",
					}),
				).rejects.toThrow();
			} finally {
				await ready.fixture.close();
			}
		});

		it("keeps a series away from the accounts of another space", async () => {
			const ready = await readySpace();
			try {
				const other = await ready.fixture.asJoao.spaces.create({
					name: "Pessoal",
					kind: "personal",
				});
				const theirs = await ready.fixture.asJoao.accounts.create({
					spaceId: other.id,
					kind: "checking",
					name: "Conta do Joao",
				});

				await expect(
					ready.fixture.asAna.recurrences.create({
						spaceId: ready.spaceId,
						description: "Nao deveria",
						kind: "expense",
						amount: 1000,
						accountId: theirs.id,
						frequency: "monthly",
						startsOn: "2026-09-10",
					}),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
