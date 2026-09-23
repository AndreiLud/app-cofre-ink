// The months ahead and the money put aside, on every adapter.
//
// Two things are checked here that no unit test can check: that the three parts of a
// projection are gathered from the database without counting anything twice, and that
// a portfolio keeps the prices it was given rather than only the last one.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { QUANTITY_SCALE } from "../repositories/investments.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runFutureConformance(adapter: AdapterUnderTest): void {
	describe("the months ahead", () => {
		it("adds up what is written, what repeats and what is usual", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 1_000_000,
				});

				// Two months behind, which is where the habit comes from.
				for (const month of ["2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 500_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 300_000,
						happenedOn: `${month}-10`,
						description: "Vida",
						accountId: account.id,
					});
				}

				// One bill already written for next month, and one rule that repeats.
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "IPTU",
					accountId: account.id,
					status: "planned",
				});
				await fixture.asAna.recurrences.create({
					spaceId: space.id,
					description: "Assinatura",
					kind: "expense",
					amount: 5000,
					accountId: account.id,
					frequency: "monthly",
					startsOn: "2026-09-15",
				});

				const ahead = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 3,
					window: 2,
				});

				expect(ahead.months).toHaveLength(3);
				expect(ahead.history.map((month) => month.month)).toEqual(["2026-07", "2026-08"]);

				const september = ahead.months[0];
				expect(september?.expenseFrom.written).toBe(100_000);
				expect(september?.expenseFrom.recurring).toBe(5000);
				// The usual month costs three thousand, and two of it is already known.
				expect(september?.expense).toBe(300_000);
				expect(september?.income).toBe(500_000);

				// The opening balance counts what happened, not what is planned.
				expect(ahead.opening).toBe(1_000_000 + 2 * (500_000 - 300_000));
			} finally {
				await fixture.close();
			}
		});

		it("never counts a recurrence that already wrote its record", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});

				await fixture.asAna.recurrences.create({
					spaceId: space.id,
					description: "Aluguel",
					kind: "expense",
					amount: 150_000,
					accountId: account.id,
					frequency: "monthly",
					startsOn: "2026-09-05",
				});

				const before = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 2,
				});
				expect(before.months[0]?.expenseFrom.recurring).toBe(150_000);

				// The series writes the records it owes, and the rule stops owing them.
				await fixture.asAna.recurrences.materialize({ spaceId: space.id, until: "2026-10-31" });

				const after = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 2,
				});

				expect(after.months[0]?.expenseFrom.recurring).toBe(0);
				expect(after.months[0]?.expenseFrom.written).toBe(150_000);
				// Either way, the month costs the same.
				expect(after.months[0]?.expense).toBe(before.months[0]?.expense);
			} finally {
				await fixture.close();
			}
		});

		it("keeps the months of one space out of another", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asJoao.projections.monthsAhead({ spaceId: space.id, from: "2026-09", months: 3 }),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("what is owned", () => {
		it("is worth the quantity times the price, and remembers what it cost", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});

				const holding = await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: account.id,
					name: "Tesouro Selic 2029",
					kind: "fixedIncome",
					quantity: 2 * QUANTITY_SCALE,
					unitPrice: 15_000_00,
					cost: 28_000_00,
				});

				expect(holding.value).toBe(30_000_00);
				expect(holding.gain).toBe(2000_00);
				// Two thousand on twenty eight thousand is a bit over seven per cent.
				expect(holding.gainPercent).toBe(714);

				const total = await fixture.asAna.investments.total(space.id);
				expect(total).toEqual({ value: 30_000_00, cost: 28_000_00, gain: 2000_00 });
			} finally {
				await fixture.close();
			}
		});

		it("keeps every price it was given, not only the last one", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});

				const holding = await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: account.id,
					name: "Fundo",
					kind: "fund",
					quantity: QUANTITY_SCALE,
					unitPrice: 10_000,
				});

				await fixture.asAna.investments.price({
					id: holding.id,
					unitPrice: 11_000,
					onDay: "2026-08-31",
				});
				await fixture.asAna.investments.price({
					id: holding.id,
					unitPrice: 12_000,
					onDay: "2026-09-30",
				});

				const now = await fixture.asAna.investments.get(holding.id);
				expect(now.unitPrice).toBe(12_000);
				expect(now.pricedOn).toBe("2026-09-30");
				expect(now.value).toBe(12_000);

				const line = await fixture.asAna.investments.prices(holding.id);
				expect(line.map((price) => price.unitPrice)).toEqual([11_000, 12_000]);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a quantity or a price that is not a whole number", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});

				await expect(
					fixture.asAna.investments.create({
						spaceId: space.id,
						accountId: account.id,
						name: "Acao",
						kind: "stock",
						quantity: 1.5,
						unitPrice: 100,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("questions about the future", () => {
		it("keeps a scenario and gives it back", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });

				const scenario = await fixture.asAna.scenarios.create({
					spaceId: space.id,
					name: "Sem delivery",
					adjustments: [{ kind: "expense", percent: -1500 }],
				});

				expect(scenario.name).toBe("Sem delivery");
				expect(scenario.adjustments).toEqual([{ kind: "expense", percent: -1500 }]);

				const renamed = await fixture.asAna.scenarios.update(scenario.id, {
					name: "Cozinhar mais",
				});
				expect(renamed.name).toBe("Cozinhar mais");

				await fixture.asAna.scenarios.remove(scenario.id);
				expect(await fixture.asAna.scenarios.list(space.id)).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("what the country did", () => {
		it("keeps the months it was given and answers for the ones it holds", async () => {
			const fixture = await prepare(adapter);
			try {
				await fixture.asAna.indices.save("cdi", [
					{ month: "2026-08", rate: 90 },
					{ month: "2026-09", rate: 88 },
				]);

				// The same month again replaces it rather than doubling it.
				await fixture.asAna.indices.save("cdi", [{ month: "2026-09", rate: 87 }]);

				const months = await fixture.asAna.indices.list("cdi");
				expect(months.map((month) => [month.month, month.rate])).toEqual([
					["2026-08", 90],
					["2026-09", 87],
				]);

				const latest = await fixture.asAna.indices.latest();
				expect(latest.cdi?.month).toBe("2026-09");
				expect(latest.ipca).toBe(null);

				const forMonths = await fixture.asAna.indices.forMonths("cdi", ["2026-08", "2026-09"]);
				expect([...forMonths.entries()]).toEqual([
					["2026-08", 90],
					["2026-09", 87],
				]);
			} finally {
				await fixture.close();
			}
		});
	});
}
