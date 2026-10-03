// The months ahead and the money put aside, on every adapter.
//
// Two things are checked here that no unit test can check: that the three parts of a
// projection are gathered from the database without counting anything twice, and that
// a portfolio keeps the prices it was given rather than only the last one.

import { addDays, addMonthsToMonth, dateInMonth, monthOf, todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { QUANTITY_SCALE } from "../repositories/investments.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runFutureConformance(adapter: AdapterUnderTest): void {
	describe("the months ahead", () => {
		// Part 1, E.3 of the request for 2.0.0: for somebody who sees only their own records the
		// balances are made of their own rows, and the investment account was swapped for what
		// all the household's holdings are worth, 15,000 beside an aporte of 500 of their own.
		it("opens the months of a logger on their own rows, without the household's holdings", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.members.invite({
					spaceId: space.id,
					userId: fixture.joao.id,
					role: "logger",
				});
				await fixture.asJoao.members.accept(space.id);
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const broker = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});
				await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "Fundo",
					kind: "fund",
					quantity: QUANTITY_SCALE,
					unitPrice: 1_500_000,
				});
				const today = todayIn("America/Sao_Paulo");
				await fixture.asJoao.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 50_000,
					happenedOn: today,
					description: "Aporte",
					accountId: checking.id,
					counterAccountId: broker.id,
				});
				const ahead = (session: typeof fixture.asAna) =>
					session.projections.monthsAhead({
						spaceId: space.id,
						from: monthOf(today),
						months: 1,
						today,
					});

				// The household's figure is what the holdings are worth.
				expect((await ahead(fixture.asAna)).opening).toBe(-50_000 + 1_500_000);
				// The logger's is their own rows: out of the account, into the broker.
				expect((await ahead(fixture.asJoao)).opening).toBe(-50_000 + 50_000);
			} finally {
				await fixture.close();
			}
		});

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
					today: "2026-09-01",
				});

				expect(ahead.months).toHaveLength(3);
				expect(ahead.history.map((month) => month.month)).toEqual(["2026-07", "2026-08"]);

				const september = ahead.months[0];
				expect(september?.expenseFrom.written).toBe(100_000);
				expect(september?.expenseFrom.recurring).toBe(5000);
				// The usual month costs three thousand, and two of it is already known. The
				// reading is made on the first, so twenty nine of September's thirty days are
				// still to come and the habit is that share of a usual month: the first day is
				// already inside the opening balance.
				expect(september?.expense).toBe(290_000);
				expect(september?.income).toBe(483_333);

				// The opening balance counts what happened, not what is planned.
				expect(ahead.opening).toBe(1_000_000 + 2 * (500_000 - 300_000));
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The habit is a median of whole months, and a part month is not one.
		 *
		 * A reading that starts further ahead than the month somebody is standing in, which is
		 * what the month on paper asks for, took its history up to the month before the first
		 * projected one. For a report made in September about the months from November, that was
		 * September, which was eleven days old, and October, which had not happened at all. A
		 * month of eleven days enters a median as a cheap month and drags the habit down.
		 */
		it("reads the habit from whole months only, however far ahead it starts", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});

				for (const month of ["2026-07", "2026-08", "2026-09"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 100_000,
						happenedOn: `${month}-05`,
						description: "Vida",
						accountId: account.id,
					});
				}

				// Made on the fifteenth of September, about the months from November.
				const ahead = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-11",
					months: 2,
					window: 2,
					today: "2026-09-15",
				});

				// July and August, and not the September it is standing in, nor the October that
				// has not happened.
				expect(ahead.history.map((month) => month.month)).toEqual(["2026-07", "2026-08"]);

				// And a report about a month that has gone counts that month, because it is read
				// as that month stood on its last day, which makes it whole.
				const closed = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-10",
					months: 1,
					window: 2,
					today: "2026-09-30",
				});
				expect(closed.history.map((month) => month.month)).toEqual(["2026-08", "2026-09"]);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The month this runs in, and not a month written into the test.
		 *
		 * A series never writes a record earlier than the month it was written down in, which
		 * is the rule that stops a rent paid since 2019 arriving as six years of promises. So a
		 * test that materialises a series into a fixed month passes only while the calendar
		 * agrees with that month, and this one went red on the first of October without anybody
		 * touching the code. The dates the projection is asked about are derived from the same
		 * month, so the arithmetic under test is the same whenever it is run.
		 */
		it("never counts a recurrence that already wrote its record", async () => {
			const fixture = await prepare(adapter);
			try {
				const month = monthOf(todayIn("America/Sao_Paulo"));
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
					startsOn: dateInMonth(month, 5),
				});

				const asked = { spaceId: space.id, from: month, months: 2, today: dateInMonth(month, 1) };

				const before = await fixture.asAna.projections.monthsAhead(asked);
				expect(before.months[0]?.expenseFrom.recurring).toBe(150_000);

				// The series writes the records it owes, and the rule stops owing them.
				await fixture.asAna.recurrences.materialize({
					spaceId: space.id,
					until: dateInMonth(addMonthsToMonth(month, 1), 31),
				});

				const after = await fixture.asAna.projections.monthsAhead(asked);

				expect(after.months[0]?.expenseFrom.recurring).toBe(0);
				expect(after.months[0]?.expenseFrom.written).toBe(150_000);
				// Either way, the month costs the same.
				expect(after.months[0]?.expense).toBe(before.months[0]?.expense);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * A card purchase leaves the bank on the day the invoice falls due, and the months
		 * ahead say so.
		 *
		 * Both halves of this were wrong, in opposite directions. A card purchase is written
		 * as a fact and dated in the month it will be charged, and the only records counted
		 * ahead were the ones still waiting to be confirmed, so none of it was ever in the
		 * months ahead. And paying an invoice is a transfer into an account that is
		 * deliberately out of the total, which the opening balance treated as money that had
		 * not moved, so it opened over by every invoice the household had ever paid.
		 */
		it("counts a card invoice in the month it falls due, and a payment as money gone", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 1_000_000,
				});
				// Closes on the twenty eighth, falls due on the fifth of the month after.
				const card = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartão",
					closingDay: 28,
					dueDay: 5,
				});

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 40_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: card.id,
				});

				const ahead = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 3,
					window: 2,
					today: "2026-09-15",
				});

				// The purchase is September's invoice, which falls due in October.
				expect(ahead.months[0]?.expenseFrom.written).toBe(0);
				expect(ahead.months[1]?.expenseFrom.written).toBe(40_000);

				// And the money is still in the bank while the invoice is open.
				expect(ahead.opening).toBe(1_000_000);

				// Paid, and now it has gone: the invoice drops out of October and the opening
				// is a thousand less, which the old reading called money that had not moved.
				await fixture.asAna.invoices.pay({
					accountId: card.id,
					fromAccountId: checking.id,
					amount: 40_000,
					happenedOn: "2026-10-05",
					month: "2026-09",
					description: "Pagamento da fatura",
				});

				const paid = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 3,
					window: 2,
					today: "2026-10-06",
				});
				expect(paid.months[1]?.expenseFrom.written).toBe(0);
				expect(paid.opening).toBe(1_000_000 - 40_000);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * A record dated in a month ahead counts in that month, whatever it is marked.
		 *
		 * The opening balance is what the accounts hold on the day the projection is made, so
		 * what the months ahead still have to count is everything that balance has not already
		 * counted: a day that has not come, and a day that has passed with nobody saying it
		 * happened. This asked for planned records alone, and a record dated ahead and written
		 * as a fact is neither: somebody who filled November in from the month screen had
		 * thirteen thousand that appeared in no figure anywhere.
		 */
		it("counts a record dated in a month ahead even when it is written as a fact", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});

				// November, written down in September as facts, which is what the month screen
				// does when somebody fills a month in before it arrives.
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "income",
					amount: 800_000,
					happenedOn: "2026-11-30",
					description: "Entradas de novembro",
					accountId: account.id,
					status: "settled",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 500_000,
					happenedOn: "2026-11-30",
					description: "Saídas de novembro",
					accountId: account.id,
					status: "settled",
				});

				const ahead = await fixture.asAna.projections.monthsAhead({
					spaceId: space.id,
					from: "2026-09",
					months: 3,
					window: 2,
					today: "2026-09-29",
				});

				// The opening balance counts what has happened and whose day has come, so
				// neither of them is in it.
				expect(ahead.opening).toBe(100_000);
				expect(ahead.months[2]?.month).toBe("2026-11");
				expect(ahead.months[2]?.incomeFrom.written).toBe(800_000);
				expect(ahead.months[2]?.expenseFrom.written).toBe(500_000);
			} finally {
				await fixture.close();
			}
		});

		it("keeps the months of one space out of another", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asJoao.projections.monthsAhead({
						spaceId: space.id,
						from: "2026-09",
						months: 3,
						today: "2026-09-01",
					}),
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

				// The total of the portfolio is the sum of what the list says, which is the one reading
				// of a holding in packages/core; the call that added it up by itself is gone.
				const listed = await fixture.asAna.investments.list(space.id);
				expect(listed.reduce((sum, one) => sum + one.value, 0)).toBe(30_000_00);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The price is typed in the currency of the space, so the holding is stored in it.
		 *
		 * A holding was stamped BRL whatever the space said, and the screen shows each one
		 * with the currency the row carries, so a household keeping euros typed euros and
		 * read reais back on the same line.
		 */
		it("stores a holding in the currency of the space", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await fixture.asAna.spaces.update(space.id, { baseCurrency: "EUR" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});

				const holding = await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: account.id,
					name: "Fundo europeu",
					kind: "fund",
					quantity: QUANTITY_SCALE,
					unitPrice: 10_000,
				});

				expect(holding.currency).toBe("EUR");
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

				// The price it was written down with is today's, the newest, and a price typed for a day
				// before it goes into the line without replacing it (part 2, H.9.2 of 2.0.0): this
				// read 12_000, the last typed, whatever its day.
				const now = await fixture.asAna.investments.get(holding.id);
				expect(now.unitPrice).toBe(10_000);
				expect(now.value).toBe(10_000);

				// The price it was written down with is the first of them, on the day it was.
				const line = await fixture.asAna.investments.prices(holding.id);
				expect(line.map((price) => price.unitPrice)).toEqual([11_000, 12_000, 10_000]);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, F.1 of the request for 2.0.0: the month on paper for September, printed later,
		// priced every holding at today's price, those written down after September included, so
		// its money at the end of the month was the total of today.
		it("reads what was owned on a day, at the last price up to that day", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});
				const bought = await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: account.id,
					name: "Tesouro",
					kind: "fixedIncome",
					quantity: QUANTITY_SCALE,
					unitPrice: 150_000,
					boughtOn: "2026-08-01",
				});
				await fixture.asAna.investments.price({
					id: bought.id,
					unitPrice: 120_000,
					onDay: "2026-08-31",
				});
				await fixture.asAna.investments.price({
					id: bought.id,
					unitPrice: 130_000,
					onDay: "2026-09-15",
				});
				// Written down today, with no day of purchase: it did not exist yesterday.
				await fixture.asAna.investments.create({
					spaceId: space.id,
					accountId: account.id,
					name: "Fundo novo",
					kind: "fund",
					quantity: QUANTITY_SCALE,
					unitPrice: 50_000,
				});

				const onDay = async (day: string) =>
					(await fixture.asAna.investments.list(space.id, { onDay: day })).map((one) => [
						one.name,
						one.value,
					]);
				expect(await onDay("2026-09-30")).toEqual([["Tesouro", 130_000]]);
				expect(await onDay("2026-09-10")).toEqual([["Tesouro", 120_000]]);
				// Before the first price on record, the first price on record.
				expect(await onDay("2026-08-10")).toEqual([["Tesouro", 120_000]]);
				expect(await onDay("2026-07-31")).toEqual([]);
				const yesterday = addDays(todayIn("America/Sao_Paulo"), -1);
				expect((await onDay(yesterday)).map(([name]) => name)).toEqual(["Tesouro"]);
				// And the reading of today is every holding at its price now.
				expect((await fixture.asAna.investments.list(space.id)).map((one) => one.name)).toEqual([
					"Fundo novo",
					"Tesouro",
				]);
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
